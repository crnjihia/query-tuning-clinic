-- 01_seed_broken_schema.sql
-- Creates an unoptimised e-commerce schema and populates it with 1.2M orders
-- Features intentional anti-patterns: missing indexes, implicit casts,
-- unindexed foreign keys, unindexed JSONB, and unpartitioned large tables.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- Customers table (5,000 customers)
CREATE TABLE customers (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255) NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Orders table (1.2M orders, deliberately lacking secondary indexes & partitioning)
CREATE TABLE orders (
    id              BIGSERIAL PRIMARY KEY,
    customer_id     INTEGER NOT NULL REFERENCES customers(id),
    customer_email  VARCHAR(255) NOT NULL,
    order_total     NUMERIC(10, 2) NOT NULL,
    order_date      TIMESTAMP NOT NULL,
    order_status    TEXT NOT NULL,
    order_details   JSONB NOT NULL
);

-- Seed customers (5,000 rows with mixed-case emails)
INSERT INTO customers (id, email, name, created_at)
SELECT
    g,
    CASE 
        WHEN g % 5 = 0 THEN UPPER('user' || g || '@example.com')
        ELSE 'user' || g || '@example.com'
    END AS email,
    'Customer ' || g AS name,
    ('2019-01-01'::timestamp + ((g * 137) % 1800 || ' days')::interval) AS created_at
FROM generate_series(1, 5000) AS g;

-- Seed 1,200,000 orders
-- Spanning 5 full years (2020 through 2024)
INSERT INTO orders (
    customer_id,
    customer_email,
    order_total,
    order_date,
    order_status,
    order_details
)
SELECT
    cust_id,
    CASE 
        WHEN cust_id % 5 = 0 THEN UPPER('user' || cust_id || '@example.com')
        ELSE 'user' || cust_id || '@example.com'
    END AS customer_email,
    ROUND((5.00 + (random() * 4995.00))::numeric, 2) AS order_total,
    -- Deterministic yet distributed dates across 2020-2024 for realistic BRIN clustering
    ('2020-01-01'::timestamp + ((g::numeric / 1200000.0) * 1826 || ' days')::interval + (random() * 86400 || ' seconds')::interval) AS order_date,
    CASE
        WHEN random() < 0.70 THEN 'completed'
        WHEN random() < 0.90 THEN 'shipped'
        ELSE 'pending'
    END AS order_status,
    jsonb_build_object(
        'sku', 'PROD-' || ((g % 500) + 1),
        'qty', (random() * 5)::int + 1,
        'priority', CASE WHEN random() < 0.05 THEN 'urgent' ELSE 'normal' END,
        'tracking', md5(g::text)
    ) AS order_details
FROM (
    SELECT 
        g,
        ((g * 7 + (random() * 100)::int) % 5000 + 1) AS cust_id
    FROM generate_series(1, 1200000) AS g
) s;

-- Run VACUUM ANALYZE so PostgreSQL has initial table statistics
VACUUM ANALYZE customers;
VACUUM ANALYZE orders;
