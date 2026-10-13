-- pgbench_before.sql
-- Simulates OLTP transaction workload on the unoptimised baseline schema.
-- Tests unindexed joins, unindexed case mismatches, and monolithic table scans.

\set cid random(1, 5000)

BEGIN;

-- 1. Unindexed customer lookup with case conversion mismatch (Seq Scan on customers)
SELECT id, name, email
FROM customers
WHERE UPPER(email) = UPPER('user' || :cid || '@example.com');

-- 2. Fetch customer's recent orders (Seq Scan on orders, unindexed customer_id)
SELECT id, order_total, order_date, order_status
FROM orders
WHERE customer_id = :cid
ORDER BY order_date DESC
LIMIT 10;

-- 3. Monthly slice query (Seq Scan across all 1.2M unpartitioned rows)
SELECT COUNT(*), SUM(order_total)
FROM orders
WHERE order_date >= '2023-01-01' AND order_date < '2023-02-01';

COMMIT;
