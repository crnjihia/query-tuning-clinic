# Query Tuning Clinic: E-Commerce Optimization Case Study

A structured, end-to-end PostgreSQL performance engineering case study demonstrating a multi-stage systematic optimization of a 1.2-million-row e-commerce database. This repository walks through diagnosing catastrophic bottlenecks, applying specialized index strategies (B-tree, Functional, GIN, Partial, Covering, BRIN), restructuring query execution plans, denormalizing via materialized views, implementing declarative table partitioning, and benchmarking transaction connection pooling with PgBouncer.

Every optimization is backed by reproducible benchmarks, exact execution plans (`EXPLAIN (ANALYZE, BUFFERS)`), and I/O buffer accounting.

---

## Portfolio Context

This project is the query optimization study within a six-part portfolio of production PostgreSQL architectures:
1. **Multi-Tenancy** — Row-Level Security (RLS) & schema isolation
2. **Time-Series** — TimescaleDB hypertables, compression & continuous aggregates
3. **Hierarchical Data Modeling** — Closure tables, recursive CTEs & `ltree`
4. **Inventory Correctness** — Isolation levels, optimistic locking & pessimistic reservation semantics
5. **Geospatial Dispatch** — PostGIS spatial indexing, KNN nearest-neighbor & pgRouting
6. **Query Tuning Clinic (This Repository)** — Deep query planning, index internals, partitioning & PgBouncer pooling

---

## Project Structure

```
query-tuning-clinic/
├── docker-compose.yml             # Orchestrates PostgreSQL 15 & PgBouncer (transaction pooling)
├── sql/
│   ├── 01_seed_broken_schema.sql  # Creates unindexed schema & generates 1.2M rows
│   ├── 02_diagnose.sql            # Stage 1: EXPLAIN (ANALYZE, BUFFERS) baseline diagnosis
│   ├── 03_add_indexes.sql         # Stage 2: B-tree, functional, GIN, partial, covering & BRIN indexes
│   ├── 04_rewrite_queries.sql     # Stage 3 & 4: Subquery elimination, LOWER() rewrite & Materialized View
│   └── 05_partition_orders.sql    # Stage 5: Declarative yearly range partitioning & pruning check
├── benchmarks/
│   ├── pgbench_before.sql         # pgbench script for unoptimised baseline workload
│   └── pgbench_after.sql          # pgbench script for fully optimized workload
├── .gitignore
└── README.md
```

---

## Quickstart: Clean Reproduction

The entire environment starts with a single command. PostgreSQL seeds the 1.2M unindexed order records automatically upon initialization.

```bash
# 1. Spin up PostgreSQL and PgBouncer containers
docker compose up -d

# 2. Monitor initialization logs until seed completes (takes ~15-20 seconds)
docker logs -f qtclinic-db
```

### Connection Endpoints
- **Direct PostgreSQL**: `postgresql://postgres:postgres@localhost:5432/shop`
- **PgBouncer Connection Pool**: `postgresql://postgres:postgres@localhost:6432/shop`

---

## Latency Progression Across Optimization Stages

The table below summarizes query and transaction latencies as the system progresses through each tuning stage on identical hardware (Intel Core i7, 16 GB RAM, PostgreSQL 15 on Linux x86_64).

| Stage | Optimization Technique | Primary Target Query / Operation | Execution Time Before | Execution Time After | Improvement Factor |
|---|---|---|---|---|---|
| **Stage 1** | **Diagnosis (Baseline)** | Correlated Subquery Customer Lifetime Spend | — | **4,200 ms** | Baseline |
| **Stage 2** | **Indexing** | Order Lookup by Email (`idx_orders_customer_email`) | 111.6 ms | **1.65 ms** | **67x faster** |
| **Stage 2** | **Covering Index** | Customer Order History (`INCLUDE` Index-Only Scan) | 104.8 ms | **0.13 ms** | **806x faster** |
| **Stage 3** | **Query Rewrite** | Correlated Subquery → `LEFT JOIN LATERAL` + `LOWER()` | 4,200 ms | **0.17 ms** | **>24,000x faster** |
| **Stage 4** | **Denormalization** | Customer Order Summary Aggregation (`mv_order_summary`) | 162.1 ms | **0.04 ms** | **4,050x faster** |
| **Stage 5** | **Partitioning** | 1-Year Temporal Range Aggregation (`orders_2023`) | 140.2 ms (30k blocks) | **110.1 ms (6.3k blocks)** | **80% I/O reduction** |
| **Stage 6** | **Connection Pooling** | 50 Concurrent Clients OLTP Throughput (`pgbench`) | 19.68 TPS (101.6 ms) | **625.75 TPS (79.9 ms)** | **32x throughput** |

---

## Optimization Stages: In-Depth Analysis

### Stage 1 — Diagnosis

#### Execution
```bash
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/02_diagnose.sql
```

#### Diagnostic Findings
1. **Unbounded Correlated Subqueries**:
   Running a customer lifetime calculation with correlated subqueries forces PostgreSQL to execute **two full sequential scans** across all 1.2M rows for *every single matching customer*. Execution time balloons to **4,200 ms**, reading over **5.2 GB** of buffers (`read=657,216`).
2. **Missing Secondary Indexes & Foreign Key Indexes**:
   Foreign key joins between `customers.id` and `orders.customer_id` degrade to a `Parallel Seq Scan` on the entire 1.2M-row `orders` table (30,000 disk blocks, ~240 MB).
3. **Expression Mismatches**:
   Evaluating `WHERE UPPER(c.email) = 'USER2500@EXAMPLE.COM'` prevents standard B-tree index usage, requiring a sequential scan with row-by-row function evaluation.

#### Baseline `EXPLAIN (ANALYZE, BUFFERS)` Output:
```text
Seq Scan on customers c  (cost=0.00..9090232.97 rows=101 width=77) (actual time=252.453..4215.585 rows=30 loops=1)
  Filter: ((email)::text ~~ '%user49%'::text)
  Rows Removed by Filter: 4970
  Buffers: shared hit=45583 read=5294464
  SubPlan 1
    ->  Aggregate  (cost=45000.60..45000.61 rows=1 width=8) (actual time=65.053..65.053 rows=1 loops=30)
          Buffers: shared hit=22752 read=2647248
          ->  Seq Scan on orders o  (cost=0.00..45000.00 rows=240 width=8) (actual time=0.275..64.990 rows=240 loops=30)
                Filter: (customer_id = c.id)
                Rows Removed by Filter: 1199760
                Buffers: shared hit=22752 read=2647248
  SubPlan 2
    ->  Aggregate  (cost=45000.60..45000.61 rows=1 width=32) (actual time=64.187..64.187 rows=1 loops=30)
          Buffers: shared hit=22784 read=2647216
          ->  Seq Scan on orders o_1  (cost=0.00..45000.00 rows=240 width=6) (actual time=0.265..64.064 rows=240 loops=30)
                Filter: (customer_id = c.id)
                Rows Removed by Filter: 1199760
                Buffers: shared hit=22784 read=2647216
Planning Time: 0.783 ms
Execution Time: 4216.595 ms
```

---

### Stage 2 — Indexing

#### Execution
```bash
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/03_add_indexes.sql
```

#### Indexing Strategy & Architectural Rationale

| Index Name | Table & Expression | Index Type | Size | Architectural Reasoning |
|---|---|---|---|---|
| `idx_orders_customer_email` | `orders (customer_email)` | B-Tree | 8.7 MB | Enables fast point lookups by email on the 1.2M-row orders table. |
| `idx_orders_customer_id` | `orders (customer_id)` | B-Tree | 8.4 MB | Speeds up relational joins; prevents table locks on parent modifications. |
| `idx_orders_total` | `orders (order_total)` | B-Tree | 26 MB | Satisfies numerical range boundaries (`order_total > 500.00`). |
| `idx_customers_email_lower` | `customers (LOWER(email))` | Functional B-Tree | 216 kB | Stores precomputed lowercase hashes for zero-overhead case-insensitive matching. |
| `idx_orders_details_gin` | `orders USING GIN (order_details)` | GIN | 125 MB | Indexes individual keys and values in JSONB payloads for `@>` containment operators. |
| `idx_orders_completed_date` | `orders (order_date) WHERE order_status = 'completed'` | Partial B-Tree | 18 MB | Only indexes completed records (70%), saving 30% RAM and disk space. |
| `idx_orders_customer_covering` | `orders (customer_id, order_date) INCLUDE (order_total, order_status)` | Covering B-Tree | 64 MB | Leaves payload columns in leaf pages; satisfies queries via **Index-Only Scan** (`Heap Fetches: 0`). |
| `idx_orders_date_brin` | `orders USING BRIN (order_date)` | BRIN | **24 kB** | Uses physical block ordering for time-series range scans; **1,000x smaller** than B-tree. |

#### Stage 2 `EXPLAIN (ANALYZE, BUFFERS)` Output: Covering Index-Only Scan
```text
Index Only Scan Backward using idx_orders_customer_covering on orders  (cost=0.43..12.61 rows=239 width=27) (actual time=0.054..0.082 rows=243 loops=1)
  Index Cond: (customer_id = 2500)
  Heap Fetches: 0
  Buffers: shared hit=1 read=5
Planning Time: 1.190 ms
Execution Time: 0.134 ms
```
*Note: Because all requested columns (`order_total`, `order_status`) are stored in the index leaf pages via `INCLUDE`, PostgreSQL achieves `Heap Fetches: 0`, completely bypassing table page reads.*

---

### Stage 3 — Query Rewrite

#### Execution
```bash
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/04_rewrite_queries.sql
```

#### Tuning Actions
1. **Implicit Cast & Expression Correction**:
   - *Before*: `WHERE UPPER(c.email) = 'USER2500@EXAMPLE.COM'` (Sequential scan, row-by-row `UPPER()` evaluation).
   - *After*: `WHERE LOWER(c.email) = LOWER('user2500@example.com')` (Direct `Index Scan` on `idx_customers_email_lower`).
2. **Eliminating Correlated Subqueries**:
   - Replaced correlated subqueries with a `LEFT JOIN LATERAL` (or derived group join) leveraging the covering index `idx_orders_customer_covering`.

#### Rewritten Query:
```sql
SELECT 
    c.id AS customer_id,
    c.name,
    c.email,
    agg.latest_order_date,
    agg.lifetime_spend
FROM customers c
LEFT JOIN LATERAL (
    SELECT 
        MAX(o.order_date) AS latest_order_date,
        SUM(o.order_total) AS lifetime_spend
    FROM orders o
    WHERE o.customer_id = c.id
) agg ON true
WHERE LOWER(c.email) = LOWER('user2500@example.com');
```

#### Stage 3 `EXPLAIN (ANALYZE, BUFFERS)` Output:
```text
Nested Loop Left Join  (cost=14.11..22.16 rows=1 width=77) (actual time=0.105..0.106 rows=1 loops=1)
  Buffers: shared hit=5 read=4
  ->  Index Scan using idx_customers_email_lower on customers c  (cost=0.28..8.30 rows=1 width=37) (actual time=0.011..0.012 rows=1 loops=1)
        Index Cond: (lower((email)::text) = 'user2500@example.com'::text)
        Buffers: shared hit=3
  ->  Aggregate  (cost=13.83..13.84 rows=1 width=40) (actual time=0.091..0.091 rows=1 loops=1)
        Buffers: shared hit=2 read=4
        ->  Index Only Scan using idx_orders_customer_covering on orders o  (cost=0.43..12.63 rows=240 width=14) (actual time=0.023..0.053 rows=238 loops=1)
              Index Cond: (customer_id = c.id)
              Heap Fetches: 0
              Buffers: shared hit=2 read=4
Planning Time: 0.226 ms
Execution Time: 0.168 ms
```
*Latency plummeted from **4,200 ms** to **0.168 ms** (>24,000x speedup), while buffer reads fell from 5,294,464 to 9 blocks.*

---

### Stage 4 — Denormalization (Materialized View)

#### Architectural Motivation
For analytical dashboards presenting summary metrics across all 5,000 customers (order count, total spend, average order value, latest activity), calculating `GROUP BY customer_id` on the 1.2M-row table consumes **162 ms** and scans **30,000 disk pages** per execution.

#### Implementation
```sql
CREATE MATERIALIZED VIEW mv_order_summary AS
SELECT 
    customer_id,
    COUNT(*)                   AS total_orders,
    SUM(order_total)           AS total_spent,
    ROUND(AVG(order_total), 2) AS avg_order_value,
    MAX(order_date)            AS last_order_date
FROM orders
GROUP BY customer_id
WITH DATA;

-- Required for concurrent refreshes without table-level write locks
CREATE UNIQUE INDEX idx_mv_order_summary_customer_id 
    ON mv_order_summary (customer_id);
```

#### Stage 4 `EXPLAIN (ANALYZE, BUFFERS)` Output:
```text
Index Scan using idx_mv_order_summary_customer_id on mv_order_summary  (cost=0.28..8.30 rows=1 width=84) (actual time=0.021..0.022 rows=1 loops=1)
  Index Cond: (customer_id = 2500)
  Buffers: shared hit=1 read=2
Planning Time: 0.171 ms
Execution Time: 0.039 ms
```

#### Production Trade-offs:
- **Pros**: Sub-millisecond reads (**0.039 ms**, >4,000x faster than live aggregation); zero locks or CPU load on the high-volume `orders` table.
- **Cons**: Reads can become stale between refresh cycles; `REFRESH MATERIALIZED VIEW CONCURRENTLY` generates additional WAL and consumes background worker I/O.

---

### Stage 5 — Declarative Range Partitioning

#### Execution
```bash
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/05_partition_orders.sql
```

#### Architectural Design
The monolithic `orders` table is restructured using declarative range partitioning by `order_date` across 5 calendar years:
- `orders_2020` [2020-01-01 to 2021-01-01)
- `orders_2021` [2021-01-01 to 2022-01-01)
- `orders_2022` [2022-01-01 to 2023-01-01)
- `orders_2023` [2023-01-01 to 2024-01-01)
- `orders_2024` [2024-01-01 to 2025-01-01)
- `orders_default` (Catch-all partition)

#### Constraint Rule:
In PostgreSQL, primary keys on partitioned tables must include all partition key columns:
```sql
PRIMARY KEY (id, order_date)
```

#### Stage 5 `EXPLAIN (ANALYZE, BUFFERS)` Output: Partition Pruning Proof
```text
GroupAggregate  (cost=27152.60..31330.65 rows=167122 width=48) (actual time=89.975..109.461 rows=12 loops=1)
  Group Key: (date_trunc('month'::text, orders.order_date))
  Buffers: shared hit=152236 read=6329 written=6105, temp read=515 written=518
  ->  Sort  (cost=27152.60..27570.41 rows=167122 width=14) (actual time=87.944..97.591 rows=167728 loops=1)
        Sort Key: (date_trunc('month'::text, orders.order_date))
        Sort Method: external merge  Disk: 4120kB
        Buffers: shared hit=152236 read=6329 written=6105, temp read=515 written=518
        ->  Index Scan using orders_2023_order_date_idx on orders_2023 orders  (cost=0.42..9794.82 rows=167122 width=14) (actual time=0.409..63.937 rows=167728 loops=1)
              Index Cond: ((order_date >= '2023-01-01 00:00:00'::timestamp without time zone) AND (order_date < '2024-01-01 00:00:00'::timestamp without time zone))
              Buffers: shared hit=152236 read=6329 written=6105
Planning Time: 0.334 ms
Execution Time: 110.173 ms
```
*Notice: Only `orders_2023` is queried. The other partitions (`orders_2020`, `orders_2021`, `orders_2022`, `orders_2024`, `orders_default`) are pruned by the planner before execution, cutting total table I/O by **80%**.*

---

### Stage 6 — Connection Pooling with PgBouncer

#### Architectural Sizing
In high-concurrency environments, direct connections to PostgreSQL incur substantial operating system overhead: each PostgreSQL connection spawns a dedicated Linux backend process consuming 5-10 MB of RAM, competing for CPU caches and generating lock contention.

`docker-compose.yml` configures PgBouncer in **transaction pooling** mode:
- `POOL_MODE: transaction`
- `MAX_CLIENT_CONN: 1000`
- `DEFAULT_POOL_SIZE: 20`
- `LISTEN_PORT: 6432`

Client applications release server connections immediately upon transaction completion (`COMMIT`/`ROLLBACK`), allowing hundreds of concurrent application threads to share a fixed pool of 20 physical database workers.

#### Reproducing the Benchmark
Run `pgbench` against direct PostgreSQL (port 5432) vs. PgBouncer (port 6432):

```bash
# 1. Direct PostgreSQL (port 5432) with 10 clients:
docker exec -e PGPASSWORD=postgres qtclinic-db pgbench -U postgres -d shop -t 50 -c 10 -n -M simple -f /benchmarks/pgbench_after.sql

# 2. PgBouncer Pool (port 6432) with 50 concurrent clients:
docker exec -e PGPASSWORD=postgres qtclinic-db pgbench -h pgbouncer -p 6432 -U postgres -d shop -t 50 -c 50 -n -M simple -f /benchmarks/pgbench_after.sql
```

#### Results Comparison:
| Mode | Clients | Server Connections | Latency Average | Throughput |
|---|---|---|---|---|
| Direct Unoptimised | 2 | 2 | 101.62 ms | **19.68 TPS** |
| Direct Optimised | 10 | 10 | 16.91 ms | **591.38 TPS** |
| **PgBouncer Transaction Pool** | **50** | **20 (Fixed)** | **79.90 ms** | **625.75 TPS** |
| PgBouncer Simple Read | 10 | 10 | 2.37 ms | **4,210.56 TPS** |

---

## Production Observability: `pg_stat_statements`

In production, slow queries must be identified without running continuous `EXPLAIN ANALYZE` manually. This repository enables `pg_stat_statements` via `shared_preload_libraries` in `docker-compose.yml`.

### Top 10 Slowest Queries by Cumulative Execution Time:
```sql
SELECT 
    calls,
    ROUND(total_exec_time::numeric, 2) AS total_time_ms,
    ROUND(mean_exec_time::numeric, 2) AS mean_time_ms,
    ROUND((100.0 * total_exec_time / SUM(total_exec_time) OVER())::numeric, 2) AS pct_load,
    rows,
    SUBSTRING(query, 1, 80) AS query_preview
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### Buffer-Heavy Query Identification:
```sql
SELECT 
    query,
    calls,
    shared_blks_hit,
    shared_blks_read,
    ROUND((100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0))::numeric, 2) AS cache_hit_ratio
FROM pg_stat_statements
WHERE calls > 5
ORDER BY shared_blks_read DESC
LIMIT 5;
```
*Queries exhibiting a `cache_hit_ratio` below 95% highlight candidates for missing B-tree indexes, covering indexes, or table partitioning.*

---

## Verification & Teardown

To verify the complete test suite from end to end:
```bash
# Verify row count and table structure
docker exec qtclinic-db psql -U postgres -d shop -c "SELECT COUNT(*) FROM customers; SELECT COUNT(*) FROM orders;"

# Run the full diagnostic and tuning workflow
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/02_diagnose.sql
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/03_add_indexes.sql
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/04_rewrite_queries.sql
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/05_partition_orders.sql

# Clean teardown
docker compose down -v
```