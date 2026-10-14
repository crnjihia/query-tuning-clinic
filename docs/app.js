/**
 * Query Tuning Clinic — Interactive Showcase Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  initBenchmarkTabs();
  initStageNavigator();
  initPlanTreeInspector();
  initIndexFilters();
  initSimulator();
  initArchitectureTopology();
  initCodeCopyButtons();
  initLightbox();
});

// Toast notification helper
function showToast(message) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>✓</span> <span>${message}</span>`;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// Clipboard copy helper
function initCodeCopyButtons() {
  document.querySelectorAll('[data-copy-target]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute('data-copy-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        const textToCopy = targetEl.innerText || targetEl.textContent;
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast('Copied to clipboard!');
        }).catch(err => {
          console.error('Copy failed', err);
        });
      }
    });
  });

  // Also support inline command copy
  document.querySelectorAll('.term-cmd').forEach(cmdEl => {
    cmdEl.style.cursor = 'pointer';
    cmdEl.title = 'Click to copy command';
    cmdEl.addEventListener('click', () => {
      const codeText = cmdEl.querySelector('.cmd-text')?.innerText || cmdEl.innerText;
      navigator.clipboard.writeText(codeText.trim()).then(() => {
        showToast('Command copied: ' + codeText.trim().substring(0, 30) + '...');
      });
    });
  });
}

// -----------------------------------------------------------------------------
// Benchmark Chart & Metric Switcher
// -----------------------------------------------------------------------------
const benchmarkData = {
  latency: [
    { stage: 'Stage 1', name: 'Correlated Subquery', target: 'Customer Lifetime Spend', before: 4200.0, after: 0.17, unit: 'ms', speedup: '>24,000x' },
    { stage: 'Stage 2', name: 'Covering Index', target: 'Customer History (INCLUDE)', before: 104.8, after: 0.13, unit: 'ms', speedup: '806x' },
    { stage: 'Stage 2', name: 'B-Tree Lookup', target: 'Order by Email', before: 111.6, after: 1.65, unit: 'ms', speedup: '67x' },
    { stage: 'Stage 4', name: 'Materialized View', target: 'Summary Aggregation', before: 162.1, after: 0.04, unit: 'ms', speedup: '4,050x' },
    { stage: 'Stage 5', name: 'Range Partitioning', target: '1-Year Temporal Aggregation', before: 140.2, after: 110.1, unit: 'ms', speedup: '1.3x (80% I/O cut)' },
    { stage: 'Stage 6', name: 'Connection Pool', target: '50-Client Transaction Latency', before: 101.62, after: 79.9, unit: 'ms', speedup: '21% faster' }
  ],
  buffers: [
    { stage: 'Stage 1', name: 'Correlated Subquery', target: 'Shared Buffer Reads', before: 5294464, after: 9, unit: 'blocks', speedup: '99.999% reduction' },
    { stage: 'Stage 2', name: 'Covering Scan', target: 'Heap Page Fetches', before: 243, after: 0, unit: 'fetches', speedup: 'Zero heap fetches' },
    { stage: 'Stage 4', name: 'Materialized View', target: 'Pages Read vs Scanned', before: 30000, after: 3, unit: 'blocks', speedup: '99.99% reduction' },
    { stage: 'Stage 5', name: 'Range Partitioning', target: 'Blocks Read per Year Query', before: 30000, after: 6329, unit: 'blocks', speedup: '78.9% less I/O' }
  ],
  throughput: [
    { stage: 'Stage 6', name: 'Direct PostgreSQL (2 Clients)', target: 'Unoptimised Baseline TPS', before: 19.68, after: 19.68, unit: 'TPS', speedup: 'Baseline' },
    { stage: 'Stage 6', name: 'Direct PostgreSQL (10 Clients)', target: 'Optimised Schema TPS', before: 19.68, after: 644.17, unit: 'TPS', speedup: '32.7x TPS' },
    { stage: 'Stage 6', name: 'PgBouncer Pool (50 Clients)', target: 'Fixed 20 Workers Transaction TPS', before: 19.68, after: 609.38, unit: 'TPS', speedup: '31x TPS @ 50 Clients' },
    { stage: 'Stage 6', name: 'PgBouncer Simple Read (10 Clients)', target: 'Point Lookup OLTP Throughput', before: 19.68, after: 4210.56, unit: 'TPS', speedup: '214x TPS' }
  ]
};

function initBenchmarkTabs() {
  const tabBtns = document.querySelectorAll('.chart-controls .tab-btn');
  const container = document.getElementById('benchmark-bars-container');
  if (!container) return;

  function renderBenchmark(metric) {
    const list = benchmarkData[metric] || benchmarkData.latency;
    container.innerHTML = '';

    list.forEach(item => {
      const row = document.createElement('div');
      row.className = 'benchmark-row';

      // Scaling calculation for visual bar display (logarithmic for latency/buffers)
      let beforePct = 100;
      let afterPct = 4;

      if (metric === 'throughput') {
        const maxTPS = 4500;
        beforePct = Math.max(3, (item.before / maxTPS) * 100);
        afterPct = Math.max(4, (item.after / maxTPS) * 100);
      } else {
        // Logarithmic scale for massive differentials
        if (item.before > 0 && item.after > 0) {
          const logBefore = Math.log10(item.before + 1);
          const logAfter = Math.log10(item.after + 1);
          beforePct = 100;
          afterPct = Math.max(4, (logAfter / logBefore) * 100);
        }
      }

      row.innerHTML = `
        <div class="benchmark-meta">
          <span class="stage-badge">${item.stage}</span>
          <span class="stage-name">${item.name}</span>
          <span class="stage-target">${item.target}</span>
        </div>
        <div class="bar-wrapper">
          <div class="bar-track" title="Before: ${item.before.toLocaleString()} ${item.unit}">
            <div class="bar-fill before-bar" style="width: ${beforePct}%"></div>
            <span class="bar-text">Before: ${item.before.toLocaleString()} ${item.unit}</span>
          </div>
          <div class="bar-track" title="After: ${item.after.toLocaleString()} ${item.unit}">
            <div class="bar-fill after-bar" style="width: ${afterPct}%"></div>
            <span class="bar-text" style="color: #6ee7b7">After: ${item.after.toLocaleString()} ${item.unit}</span>
          </div>
        </div>
        <div class="benchmark-delta">
          <span class="speedup-badge">${item.speedup}</span>
        </div>
      `;
      container.appendChild(row);
    });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const metric = btn.getAttribute('data-metric');
      renderBenchmark(metric);
    });
  });

  // Initial render
  renderBenchmark('latency');
}

// -----------------------------------------------------------------------------
// Stage Navigator
// -----------------------------------------------------------------------------
function initStageNavigator() {
  const stageNavItems = document.querySelectorAll('.stage-nav-item');
  const stagePanels = document.querySelectorAll('.stage-detail-panel');

  stageNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const stageId = item.getAttribute('data-stage');
      stageNavItems.forEach(i => i.classList.remove('active'));
      stagePanels.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const targetPanel = document.getElementById(stageId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Interactive DBeaver Visual Plan Tree Inspector
// -----------------------------------------------------------------------------
const planNodeDetails = {
  'root': {
    title: 'Nested Loop Left Join (Root Plan Node)',
    cost: '28.99 .. 37.04',
    time: '0.198 ms',
    desc: 'The orchestrator node performing an ultra-fast nested loop join between the single indexed customer lookup and the pre-aggregated lateral partition scans. Total query execution finishes in sub-millisecond time.',
    highlight: 'Root join completed in 0.198 ms with zero disk spills.'
  },
  'cust-scan': {
    title: 'Index Scan on customers (idx_customers_email_lower)',
    cost: '0.28 .. 8.30',
    time: '0.022 ms',
    desc: 'Functional B-Tree index scan matching LOWER(c.email) = LOWER(\'user2500@example.com\'). Completely eliminates full table sequential scan across 5,000 customer rows.',
    highlight: 'Index Cond: lower((email)::text) = \'user2500@example.com\'::text (0.022 ms)'
  },
  'agg': {
    title: 'Aggregate (Latest Order & Lifetime Spend)',
    cost: '28.71 .. 28.72',
    time: '0.173 ms',
    desc: 'Calculates MAX(order_date) and SUM(order_total) over the customer orders directly within the lateral subquery context.',
    highlight: 'Runs once for the matched customer, consuming only 0.173 ms.'
  },
  'append': {
    title: 'Append (Partition Range Traversal)',
    cost: '0.42 .. 27.50',
    time: '0.144 ms',
    desc: 'Iterates through the child partition tables (orders_2020 through orders_2024). Because each partition contains a local covering index, each year is scanned via Index Only Scan with 0 heap fetches.',
    highlight: 'Scans all active partitions in parallel in 0.144 ms.'
  },
  'covering-scan': {
    title: 'Index Only Scan (orders_2020 .. orders_2024)',
    cost: '0.42 .. 5.26',
    time: '0.018 - 0.028 ms / partition',
    desc: 'Using covering index idx_orders_customer_covering (customer_id, order_date) INCLUDE (order_total, order_status). Because order_total is in the leaf page, Heap Fetches = 0. The engine does NOT read the underlying table pages!',
    highlight: 'Heap Fetches: 0 | Buffer reads bypassed.'
  }
};

function initPlanTreeInspector() {
  const treeItems = document.querySelectorAll('.tree-node-item');
  const detailTitle = document.getElementById('node-detail-title');
  const detailCost = document.getElementById('node-detail-cost');
  const detailTime = document.getElementById('node-detail-time');
  const detailDesc = document.getElementById('node-detail-desc');
  const detailHighlight = document.getElementById('node-detail-highlight');

  if (!treeItems.length || !detailTitle) return;

  treeItems.forEach(item => {
    item.addEventListener('click', () => {
      treeItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const nodeId = item.getAttribute('data-node-id');
      const details = planNodeDetails[nodeId] || planNodeDetails['root'];

      detailTitle.innerText = details.title;
      detailCost.innerText = `Cost: ${details.cost}`;
      detailTime.innerText = `Time: ${details.time}`;
      detailDesc.innerText = details.desc;
      detailHighlight.innerText = details.highlight;
    });
  });
}

// -----------------------------------------------------------------------------
// Index Engineering Filter
// -----------------------------------------------------------------------------
function initIndexFilters() {
  const filterBtns = document.querySelectorAll('.index-filter-bar .filter-btn');
  const indexCards = document.querySelectorAll('.index-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');
      indexCards.forEach(card => {
        if (filter === 'all' || card.getAttribute('data-index-type') === filter) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

// -----------------------------------------------------------------------------
// Interactive Query Simulator
// -----------------------------------------------------------------------------
const simScenarios = {
  'subquery': {
    name: 'Customer Lifetime Spend Analysis',
    unopt: {
      time: 4216.59,
      buffers: 5294464,
      fetches: 1200000,
      cost: '0.00 .. 9090232.97',
      plan: 'Seq Scan on customers -> SubPlan 1 (Seq Scan orders 1.2M) -> SubPlan 2 (Seq Scan orders 1.2M)',
      sql: `SELECT c.id, c.name, c.email,\n  (SELECT MAX(o.order_date) FROM orders o WHERE o.customer_id = c.id),\n  (SELECT SUM(o.order_total) FROM orders o WHERE o.customer_id = c.id)\nFROM customers c WHERE c.email LIKE '%user49%';`
    },
    opt: {
      time: 0.168,
      buffers: 9,
      fetches: 0,
      cost: '14.11 .. 22.16',
      plan: 'Nested Loop Left Join -> Index Scan idx_customers_email_lower -> LATERAL Index Only Scan idx_orders_customer_covering (Heap Fetches: 0)',
      sql: `SELECT c.id, c.name, c.email, agg.latest_order_date, agg.lifetime_spend\nFROM customers c\nLEFT JOIN LATERAL (\n  SELECT MAX(o.order_date) AS latest_order_date, SUM(o.order_total) AS lifetime_spend\n  FROM orders o WHERE o.customer_id = c.id\n) agg ON true\nWHERE LOWER(c.email) = LOWER('user2500@example.com');`
    }
  },
  'email-lookup': {
    name: 'Case-Insensitive Email Point Lookup',
    unopt: {
      time: 111.60,
      buffers: 30000,
      fetches: 1200000,
      cost: '0.00 .. 45000.00',
      plan: 'Parallel Seq Scan on orders (30,000 shared buffers, evaluates UPPER(email) row-by-row)',
      sql: `SELECT * FROM orders WHERE UPPER(customer_email) = 'USER2500@EXAMPLE.COM';`
    },
    opt: {
      time: 1.65,
      buffers: 4,
      fetches: 1,
      cost: '0.42 .. 8.44',
      plan: 'Bitmap Index Scan using idx_orders_customer_email_lower (Heap Fetches: 1)',
      sql: `SELECT * FROM orders WHERE LOWER(customer_email) = LOWER('user2500@example.com');`
    }
  },
  'covering': {
    name: 'Customer Order History & Status',
    unopt: {
      time: 104.80,
      buffers: 243,
      fetches: 243,
      cost: '0.42 .. 245.00',
      plan: 'Index Scan on orders -> Heap Table Page Lookups for order_total and order_status',
      sql: `SELECT customer_id, order_date, order_total, order_status FROM orders WHERE customer_id = 2500;`
    },
    opt: {
      time: 0.134,
      buffers: 6,
      fetches: 0,
      cost: '0.43 .. 12.61',
      plan: 'Index Only Scan Backward using idx_orders_customer_covering (INCLUDE order_total, order_status - Heap Fetches: 0)',
      sql: `SELECT customer_id, order_date, order_total, order_status FROM orders WHERE customer_id = 2500;`
    }
  },
  'partition': {
    name: '1-Year Temporal Revenue Aggregation',
    unopt: {
      time: 140.20,
      buffers: 30000,
      fetches: 1200000,
      cost: '45000.00 .. 58000.00',
      plan: 'Seq Scan on monolithic orders table (scans all 5 years: 1.2M rows across 30,000 disk blocks)',
      sql: `SELECT DATE_TRUNC('month', order_date), SUM(order_total) FROM orders\nWHERE order_date >= '2023-01-01' AND order_date < '2024-01-01' GROUP BY 1;`
    },
    opt: {
      time: 110.17,
      buffers: 6329,
      fetches: 167728,
      cost: '27152.60 .. 31330.65',
      plan: 'GroupAggregate -> Index Scan on orders_2023 only (Partitions 2020, 2021, 2022, 2024, default PRUNED)',
      sql: `SELECT DATE_TRUNC('month', order_date), SUM(order_total) FROM orders\nWHERE order_date >= '2023-01-01' AND order_date < '2024-01-01' GROUP BY 1;`
    }
  },
  'pgbouncer': {
    name: '50-Client Concurrent Connection Spike',
    unopt: {
      time: 101.62,
      buffers: 19.68, // TPS placeholder
      fetches: 50, // backend processes
      cost: 'Direct PG Connection Overhead',
      plan: 'Direct connection per client: 50 OS processes competing for CPU caches and lock manager slots',
      sql: `pgbench -U postgres -d shop -t 50 -c 50 -f /benchmarks/pgbench_before.sql`
    },
    opt: {
      time: 79.90,
      buffers: 609.38, // TPS placeholder
      fetches: 20, // fixed pool size
      cost: 'Transaction Pooling at Port 6432',
      plan: 'PgBouncer Transaction Pool: 50 clients multiplexed over 20 fixed server connections',
      sql: `pgbench -h pgbouncer -p 6432 -U postgres -d shop -t 50 -c 50 -f /benchmarks/pgbench_after.sql`
    }
  }
};

function initSimulator() {
  const scenarioSelect = document.getElementById('sim-scenario-select');
  const toggleUnopt = document.getElementById('btn-unopt');
  const toggleOpt = document.getElementById('btn-opt');
  const runBtn = document.getElementById('btn-run-sim');

  const valTime = document.getElementById('sim-val-time');
  const valBuffers = document.getElementById('sim-val-buffers');
  const valFetches = document.getElementById('sim-val-fetches');
  const valCost = document.getElementById('sim-val-cost');
  const simSql = document.getElementById('sim-sql-display');
  const simPlan = document.getElementById('sim-plan-display');

  if (!scenarioSelect || !valTime) return;

  let currentMode = 'unoptimized';

  function updateDisplay() {
    const scenarioKey = scenarioSelect.value;
    const scenario = simScenarios[scenarioKey] || simScenarios['subquery'];
    const data = currentMode === 'unoptimized' ? scenario.unopt : scenario.opt;

    valTime.innerText = `${data.time.toLocaleString()} ms`;
    valTime.style.color = currentMode === 'unoptimized' ? '#f87171' : '#34d399';

    if (scenarioKey === 'pgbouncer') {
      valBuffers.innerText = `${data.buffers.toLocaleString()} TPS`;
      valFetches.innerText = `${data.fetches} Conns`;
    } else {
      valBuffers.innerText = data.buffers.toLocaleString();
      valFetches.innerText = data.fetches.toLocaleString();
    }

    valCost.innerText = data.cost;
    simSql.textContent = data.sql;
    simPlan.textContent = data.plan;
  }

  toggleUnopt.addEventListener('click', () => {
    currentMode = 'unoptimized';
    toggleUnopt.className = 'toggle-btn active unoptimized';
    toggleOpt.className = 'toggle-btn';
    updateDisplay();
  });

  toggleOpt.addEventListener('click', () => {
    currentMode = 'optimized';
    toggleOpt.className = 'toggle-btn active optimized';
    toggleUnopt.className = 'toggle-btn';
    updateDisplay();
  });

  scenarioSelect.addEventListener('change', updateDisplay);

  // Simulated run animation
  runBtn.addEventListener('click', () => {
    runBtn.disabled = true;
    const originalText = runBtn.innerHTML;
    runBtn.innerHTML = `<span>⚡</span> Running EXPLAIN (ANALYZE, BUFFERS)...`;

    valTime.innerText = 'Calculating...';
    valBuffers.innerText = 'Counting...';

    setTimeout(() => {
      updateDisplay();
      runBtn.disabled = false;
      runBtn.innerHTML = originalText;
      showToast(`Simulation complete: ${currentMode.toUpperCase()} mode executed.`);
    }, 450);
  });

  // Initial update
  updateDisplay();
}

// -----------------------------------------------------------------------------
// Interactive Architecture Topology
// -----------------------------------------------------------------------------
const archInfo = {
  'client': {
    title: 'Client Tier (Application, pgbench, DBeaver)',
    details: 'Initiates database sessions. DBeaver connects directly to port 6432 for sub-millisecond query planning; pgbench simulates up to 50 concurrent OLTP transactions.'
  },
  'pgbouncer': {
    title: 'PgBouncer Connection Pooler (Port 6432)',
    details: 'Runs in Transaction Pooling mode. Allows up to 1,000 client connections to multiplex seamlessly over a fixed pool of 20 PostgreSQL server processes, eliminating connection fork overhead.'
  },
  'postgres': {
    title: 'PostgreSQL 15 Engine (Port 5432)',
    details: 'Configured with shared_preload_libraries=pg_stat_statements and pg_stat_statements.track=all. Manages shared buffer cache (128MB), WAL, query planner, and partition pruning.'
  },
  'partitions': {
    title: 'Partitioned orders Parent Table',
    details: 'Range-partitioned by order_date into yearly partitions (orders_2020 through orders_2024 plus default). Enables query planner to prune 80% of data pages on date-bounded scans.'
  },
  'mview': {
    title: 'Materialized View (mv_order_summary)',
    details: 'Denormalized customer order statistics (total_orders, total_spent, avg_order_value). Satisfies dashboard reads in 0.04 ms with non-blocking CONCURRENT REFRESH.'
  }
};

function initArchitectureTopology() {
  const nodes = document.querySelectorAll('.arch-node');
  const detailsBox = document.getElementById('arch-details-box');
  const detailsTitle = document.getElementById('arch-details-title');
  const detailsText = document.getElementById('arch-details-text');

  if (!nodes.length || !detailsBox) return;

  nodes.forEach(node => {
    node.addEventListener('click', () => {
      nodes.forEach(n => n.classList.remove('active'));
      node.classList.add('active');

      const targetKey = node.getAttribute('data-arch-key');
      const info = archInfo[targetKey];
      if (info) {
        detailsTitle.innerText = info.title;
        detailsText.innerText = info.details;
        detailsBox.style.display = 'block';
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Modal Lightbox for DBeaver Execution Plan
// -----------------------------------------------------------------------------
function initLightbox() {
  const modal = document.getElementById('plan-modal');
  const openBtn = document.getElementById('open-plan-modal');
  const closeBtn = document.getElementById('close-plan-modal');

  if (!modal || !openBtn) return;

  openBtn.addEventListener('click', () => {
    modal.classList.add('active');
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      modal.classList.remove('active');
    }
  });
}
