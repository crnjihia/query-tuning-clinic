-- 02_diagnose.sql
-- Stage 1: Diagnosis
-- Execute EXPLAIN (ANALYZE, BUFFERS) against the unoptimised baseline schema.
-- Demonstrates sequential scans, high shared buffer I/O, and poor planner estimates.

-- -----------------------------------------------------------------------------
-- Query 1: Order Lookup with Case-Insensitive Filter & Unindexed Total
-- Bottlenecks:
--   - Parallel Seq Scan on orders (30,000 shared buffers, ~240 MB)
--   - Seq Scan on customers evaluating UPPER(email) per row
--   - In-memory Sort on unindexed order_date
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    o.id AS order_id,
    o.customer_id,
    c.name AS customer_name,
    c.email AS customer_email,
    o.order_total,
    o.order_date,
    o.order_status,
    o.order_details->>'priority' AS priority
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE UPPER(c.email) = 'USER2500@EXAMPLE.COM'
  AND o.order_total > 500.00
ORDER BY o.order_date DESC
LIMIT 50;

-- -----------------------------------------------------------------------------
-- Query 2: Correlated Subquery Anti-Pattern
-- Bottlenecks:
--   - For each customer matching the filter, PostgreSQL executes two separate
--     full table sequential scans across 1.2M rows.
--   - Execution time explodes to ~4,200 ms with over 5,000,000 buffer hits/reads.
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    c.id AS customer_id,
    c.name,
    c.email,
    (SELECT MAX(o.order_date) FROM orders o WHERE o.customer_id = c.id) AS latest_order_date,
    (SELECT SUM(o.order_total) FROM orders o WHERE o.customer_id = c.id) AS lifetime_spend
FROM customers c
WHERE c.email LIKE '%user49%';

-- -----------------------------------------------------------------------------
-- Query 3: Date Range Aggregation on Monolithic Table
-- Bottlenecks:
--   - Without partitioning or indexing, a 1-year reporting query scans all 5 years
--     of data (1.2M rows) across all 30,000 disk pages.
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    DATE_TRUNC('month', order_date) AS order_month,
    COUNT(*) AS total_orders,
    SUM(order_total) AS monthly_revenue
FROM orders
WHERE order_date >= '2023-01-01' AND order_date < '2024-01-01'
  AND order_status = 'completed'
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY order_month;
