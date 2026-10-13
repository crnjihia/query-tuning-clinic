#!/usr/bin/env bash
# run_clinic.sh
# End-to-end automated runner for the Query Tuning Clinic portfolio study.
# Executes all 6 performance stages sequentially and reports timings.

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RESET='\033[0m'

echo -e "${BOLD}${CYAN}================================================================${RESET}"
echo -e "${BOLD}${CYAN}   QUERY TUNING CLINIC — AUTOMATED PERFORMANCE SUITE            ${RESET}"
echo -e "${BOLD}${CYAN}================================================================${RESET}"

echo -e "\n${YELLOW}[1/7] Bootstrapping Docker stack and waiting for DB health...${RESET}"
docker compose down -v
docker compose up -d

echo -e "Waiting for database to report healthy..."
until docker exec qtclinic-db pg_isready -U postgres -d shop > /dev/null 2>&1; do
    sleep 2
done

echo -e "Waiting for 1.2M rows seed insertion to complete..."
until [ "$(docker exec qtclinic-db psql -U postgres -d shop -t -A -c "SELECT COUNT(*) FROM orders;" 2>/dev/null || echo 0)" -ge 1200000 ]; do
    sleep 3
done
echo -e "${GREEN}✓ Baseline seeded: 5,000 customers, 1,200,000 orders${RESET}"

echo -e "\n${YELLOW}[2/7] Running Baseline Benchmark (Unoptimised Workload)...${RESET}"
docker exec -e PGPASSWORD=postgres qtclinic-db pgbench -U postgres -d shop -t 10 -c 2 -n -M simple -f /benchmarks/pgbench_before.sql

echo -e "\n${YELLOW}[3/7] Stage 1 — Running Diagnostic EXPLAIN (ANALYZE, BUFFERS)...${RESET}"
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/02_diagnose.sql

echo -e "\n${YELLOW}[4/7] Stage 2 — Applying Specialized Production Indexes...${RESET}"
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/03_add_indexes.sql
echo -e "${GREEN}✓ B-tree, Functional, GIN, Partial, Covering & BRIN indexes created${RESET}"

echo -e "\n${YELLOW}[5/7] Stage 3 & 4 — Query Rewrites & Materialized View...${RESET}"
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/04_rewrite_queries.sql
echo -e "${GREEN}✓ Correlated subqueries eliminated; Materialized View created${RESET}"

echo -e "\n${YELLOW}[6/7] Stage 5 — Declarative Yearly Range Partitioning...${RESET}"
docker exec -i qtclinic-db psql -U postgres -d shop -f /sql/05_partition_orders.sql
echo -e "${GREEN}✓ Orders partitioned by year; partition pruning verified${RESET}"

echo -e "\n${YELLOW}[7/7] Stage 6 — Benchmarking PgBouncer Transaction Pooling (50 clients)...${RESET}"
docker exec -e PGPASSWORD=postgres qtclinic-db pgbench -h pgbouncer -p 6432 -U postgres -d shop -t 50 -c 50 -n -M simple -f /benchmarks/pgbench_after.sql

echo -e "\n${BOLD}${GREEN}================================================================${RESET}"
echo -e "${BOLD}${GREEN}   QUERY TUNING CLINIC RUN COMPLETED SUCCESSFULLY!              ${RESET}"
echo -e "${BOLD}${GREEN}================================================================${RESET}"
