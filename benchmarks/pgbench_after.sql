-- pgbench_after.sql
-- Simulates the identical OLTP workload against the fully tuned and partitioned schema.
-- Leverages functional indexes, covering indexes, and partition pruning.

\set cid random(1, 5000)

BEGIN;

-- 1. Optimised customer lookup using functional index on LOWER(email)
SELECT id, name, email
FROM customers
WHERE LOWER(email) = LOWER('user' || :cid || '@example.com');

-- 2. Customer orders lookup satisfied completely by covering index (Index-Only Scan)
SELECT id, order_total, order_date, order_status
FROM orders
WHERE customer_id = :cid
ORDER BY order_date DESC
LIMIT 10;

-- 3. Monthly slice query with partition pruning (scans only orders_2023)
SELECT COUNT(*), SUM(order_total)
FROM orders
WHERE order_date >= '2023-01-01' AND order_date < '2023-02-01';

COMMIT;
