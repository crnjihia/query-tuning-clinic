-- 05_partition_orders.sql
-- Stage 5: Declarative Range Partitioning by Year
-- Migrates the 1.2M-row monolithic orders table into yearly range partitions
-- and proves partition pruning via EXPLAIN (ANALYZE, BUFFERS).

-- -----------------------------------------------------------------------------
-- 5.1 Stage Monolithic Table
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS orders_monolithic CASCADE;
ALTER TABLE orders RENAME TO orders_monolithic;

-- -----------------------------------------------------------------------------
-- 5.2 Create Partitioned Parent Table
-- Note: In PostgreSQL, any unique/primary key constraint on a partitioned table
-- must include all partitioning columns (order_date).
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
    id              BIGSERIAL,
    customer_id     INTEGER NOT NULL REFERENCES customers(id),
    customer_email  VARCHAR(255) NOT NULL,
    order_total     NUMERIC(10, 2) NOT NULL,
    order_date      TIMESTAMP NOT NULL,
    order_status    TEXT NOT NULL,
    order_details   JSONB NOT NULL,
    PRIMARY KEY (id, order_date)
) PARTITION BY RANGE (order_date);

-- -----------------------------------------------------------------------------
-- 5.3 Create Yearly Partitions (2020 - 2024) and Default Catch-All
-- -----------------------------------------------------------------------------
CREATE TABLE orders_2020 PARTITION OF orders
    FOR VALUES FROM ('2020-01-01 00:00:00') TO ('2021-01-01 00:00:00');

CREATE TABLE orders_2021 PARTITION OF orders
    FOR VALUES FROM ('2021-01-01 00:00:00') TO ('2022-01-01 00:00:00');

CREATE TABLE orders_2022 PARTITION OF orders
    FOR VALUES FROM ('2022-01-01 00:00:00') TO ('2023-01-01 00:00:00');

CREATE TABLE orders_2023 PARTITION OF orders
    FOR VALUES FROM ('2023-01-01 00:00:00') TO ('2024-01-01 00:00:00');

CREATE TABLE orders_2024 PARTITION OF orders
    FOR VALUES FROM ('2024-01-01 00:00:00') TO ('2025-01-01 00:00:00');

CREATE TABLE orders_default PARTITION OF orders DEFAULT;

-- -----------------------------------------------------------------------------
-- 5.4 Migrate Data from Monolithic to Partitioned Structure
-- -----------------------------------------------------------------------------
INSERT INTO orders (id, customer_id, customer_email, order_total, order_date, order_status, order_details)
SELECT id, customer_id, customer_email, order_total, order_date, order_status, order_details 
FROM orders_monolithic;

DROP TABLE orders_monolithic CASCADE;

-- -----------------------------------------------------------------------------
-- 5.5 Re-attach Production Indexes to Partitioned Parent Table
-- (In PostgreSQL 11+, indexes on parent tables automatically cascade to all partitions)
-- -----------------------------------------------------------------------------
CREATE INDEX idx_orders_customer_id ON orders (customer_id);
CREATE INDEX idx_orders_customer_email ON orders (customer_email);
CREATE INDEX idx_orders_customer_email_lower ON orders (LOWER(customer_email));
CREATE INDEX idx_orders_order_total ON orders (order_total);
CREATE INDEX idx_orders_customer_covering ON orders (customer_id, order_date) INCLUDE (order_total, order_status);
CREATE INDEX idx_orders_details_gin ON orders USING GIN (order_details);
CREATE INDEX idx_orders_completed_date ON orders (order_date) WHERE order_status = 'completed';
CREATE INDEX idx_orders_date_brin ON orders USING BRIN (order_date);

ANALYZE orders;

-- Recreate materialized view on the partitioned table
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_order_summary AS
SELECT 
    customer_id,
    COUNT(*)               AS total_orders,
    SUM(order_total)       AS total_spent,
    ROUND(AVG(order_total), 2) AS avg_order_value,
    MAX(order_date)        AS last_order_date
FROM orders
GROUP BY customer_id
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_order_summary_customer_id 
    ON mv_order_summary (customer_id);

-- -----------------------------------------------------------------------------
-- 5.6 Verify Partition Pruning with EXPLAIN ANALYZE
-- Only the orders_2023 partition should be scanned. All other partitions
-- (orders_2020, orders_2021, orders_2022, orders_2024, orders_default) are pruned.
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    DATE_TRUNC('month', order_date) AS order_month,
    COUNT(*) AS total_orders,
    SUM(order_total) AS total_revenue
FROM orders
WHERE order_date >= '2023-01-01' AND order_date < '2024-01-01'
  AND order_status = 'completed'
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY order_month;
