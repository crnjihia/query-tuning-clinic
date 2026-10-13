-- 03_add_indexes.sql
-- Stage 2: Indexing
-- Adds production-grade indexes targeting bottlenecks identified in Stage 1.
-- Includes B-tree, Functional, GIN, Partial, Covering (Index-Only), and BRIN indexes.

-- -----------------------------------------------------------------------------
-- 1. Standard B-Tree Indexes
-- Reasoning:
--   - idx_orders_customer_email: Enables sub-millisecond point lookups on orders
--     by customer email without sequential scans.
--   - idx_orders_customer_id: Accelerates relational joins between customers and
--     orders, and prevents foreign key lock bottlenecks.
--   - idx_orders_total: Satisfies numerical range boundaries (order_total > 500.00)
--     via Bitmap Index Scans instead of inspecting all 1.2M rows.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_customer_email 
    ON orders (customer_email);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id 
    ON orders (customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_total 
    ON orders (order_total);

-- -----------------------------------------------------------------------------
-- 2. Functional B-Tree Indexes (Case-Insensitive)
-- Reasoning:
--   - Standard indexes on `email` cannot be used by queries using UPPER() or LOWER().
--   - Indexing the expression LOWER(email) stores normalised lowercase keys,
--     enabling direct Index Scan matching regardless of input casing.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_email_lower 
    ON customers (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_orders_customer_email_lower 
    ON orders (LOWER(customer_email));

-- -----------------------------------------------------------------------------
-- 3. GIN Index for Semi-Structured JSONB Payload
-- Reasoning:
--   - B-trees cannot index internal JSON keys or nested structures.
--   - GIN (Generalized Inverted Index) maps individual key/value pairs
--     inside order_details, enabling fast JSON containment queries (@>).
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_details_gin 
    ON orders USING GIN (order_details);

-- -----------------------------------------------------------------------------
-- 4. Partial Index (Filtered Index)
-- Reasoning:
--   - 70% of orders are 'completed'. Operational queries frequently filter for
--     active/completed status.
--   - By filtering WHERE order_status = 'completed', the index excludes pending
--     and shipped rows, keeping index size ~30% smaller and cache-resident.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_completed_date 
    ON orders (order_date) 
    WHERE order_status = 'completed';

-- -----------------------------------------------------------------------------
-- 5. Covering Index (Index-Only Scan via INCLUDE)
-- Reasoning:
--   - Standard composite indexes store (customer_id, order_date, order_total, order_status)
--     in the B-tree key space, increasing tree depth and sorting overhead.
--   - The INCLUDE clause stores payload columns (order_total, order_status) only in the
--     leaf pages. PostgreSQL can satisfy queries with an Index-Only Scan (Heap Fetches: 0).
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_customer_covering 
    ON orders (customer_id, order_date) 
    INCLUDE (order_total, order_status);

-- -----------------------------------------------------------------------------
-- 6. BRIN Index (Block Range Index)
-- Reasoning:
--   - Order data is sequentially inserted over time, creating high physical correlation
--     between disk block locations and order_date values.
--   - While a full B-tree requires ~26 MB of memory, BRIN stores only the min/max values
--     for each range of disk pages (128 pages per range), taking only ~24 kB (1,000x smaller).
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_date_brin 
    ON orders USING BRIN (order_date);

-- Update statistics for newly created indexes
ANALYZE customers;
ANALYZE orders;
