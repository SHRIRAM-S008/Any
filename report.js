// ── Config ────────────────────────────────────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycbxBWyHjbgQk_r5R8PxlwiUjNyrXZN9Ct6TfXgU_Lz71r72ILB0LI4H6oIMcxR4l2yHWGA/exec';

let allData = [];   // full parsed dataset
let filteredData = [];   // after global date filter
let charts = {};
let activeMetric = 'count';
let activeDayWindow = 30;    // days shown in daily chart (0 = all)
let globalRangeDays = 180;   // global filter preset (0 = all)
let customFrom = null;
let customTo = null;

// ── DOM ───────────────────────────────────────────────────────────────────────
const loadingState = document.getElementById('loadingState');
const chartsSection = document.getElementById('chartsSection');
const statsGrid = document.getElementById('statsGrid');
const filterBar = document.getElementById('filterBar');
const metricToggle = document.getElementById('metricToggle');
const refreshBtn = document.getElementById('refreshBtn');
const filterSummary = document.getElementById('filterSummary');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');

// ── Date Utils ────────────────────────────────────────────────────────────────
function parseDateStr(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val) ? null : val;
    const s = String(val).trim();
    // DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
        const [d, m, y] = s.split('/');
        const dt = new Date(`${y}-${m}-${d}T00:00:00`);
        return isNaN(dt) ? null : dt;
    }
    // DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
        const [d, m, y] = s.split('-');
        const dt = new Date(`${y}-${m}-${d}T00:00:00`);
        return isNaN(dt) ? null : dt;
    }
    const dt = new Date(s);
    return isNaN(dt) ? null : dt;
}

function toYMD(d) {
    // Returns "YYYY-MM-DD"
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

function p2(n) { return String(n).padStart(2, '0'); }

function fmtDate(d) {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Grouping Keys ─────────────────────────────────────────────────────────────
function getDayKey(d) { return toYMD(d); }
function getWeekKey(d) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const w = Math.ceil(d.getDate() / 7);
    return `${y}-${p2(m)}-W${w}`;
}
function getMonthKey(d) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; }

// ── Label Formatters ──────────────────────────────────────────────────────────
function fmtDayLabel(key) {
    const [y, m, d] = key.split('-');
    const dt = new Date(`${y}-${m}-${d}T00:00:00`);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
function fmtWeekLabel(key) {
    const [y, m, w] = key.split('-');
    const dt = new Date(`${y}-${m}-01T00:00:00`);
    const monthStr = dt.toLocaleDateString('en-IN', { month: 'short' });
    return `${monthStr}'${w}`;
}
function fmtMonthLabel(key) {
    const [y, m] = key.split('-');
    const dt = new Date(`${y}-${m}-01T00:00:00`);
    return dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

// ── Number Format ─────────────────────────────────────────────────────────────
function fmtNum(n, dec = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toLocaleString('en-IN', { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

// ── Global Date Filter ────────────────────────────────────────────────────────
function applyGlobalFilter() {
    if (!allData.length) { filteredData = []; return; }

    let from = null, to = null;

    if (customFrom && customTo) {
        from = customFrom;
        to = customTo;
    } else if (globalRangeDays > 0) {
        // Find actual max date in data, go back N days
        const maxDate = new Date(Math.max(...allData.map(d => d.DateObj)));
        to = new Date(maxDate); to.setHours(23, 59, 59, 999);
        from = new Date(maxDate);
        from.setDate(from.getDate() - globalRangeDays + 1);
        from.setHours(0, 0, 0, 0);
    }

    if (from && to) {
        filteredData = allData.filter(d => d.DateObj >= from && d.DateObj <= to);
        filterSummary.textContent =
            `Showing ${filteredData.length} of ${allData.length} admissions · ${fmtDate(from)} – ${fmtDate(to)}`;
    } else {
        filteredData = [...allData];
        filterSummary.textContent = `Showing all ${allData.length} admissions`;
    }
}

// ── Grouping ──────────────────────────────────────────────────────────────────
function groupData(data, keyFn, labelFn, metric) {
    const groups = {};
    data.forEach(item => {
        const key = keyFn(item.DateObj);
        if (!groups[key]) groups[key] = { count: 0, totalScore: 0, totalPct: 0, scoreCount: 0, pctCount: 0 };
        groups[key].count++;
        if (item.Score !== null) { groups[key].totalScore += item.Score; groups[key].scoreCount++; }
        if (item.Percentage !== null) { groups[key].totalPct += item.Percentage; groups[key].pctCount++; }
    });
    const sortedKeys = Object.keys(groups).sort();
    return {
        labels: sortedKeys.map(k => labelFn(k)),
        rawKeys: sortedKeys,
        values: sortedKeys.map(k => {
            const g = groups[k];
            if (metric === 'count') return g.count;
            if (metric === 'score') return g.scoreCount > 0 ? parseFloat((g.totalScore / g.scoreCount).toFixed(2)) : null;
            if (metric === 'percentage') return g.pctCount > 0 ? parseFloat((g.totalPct / g.pctCount).toFixed(2)) : null;
        }),
        totals: sortedKeys.map(k => groups[k].count)
    };
}

// ── Window slice for daily chart ──────────────────────────────────────────────
// Returns {labels,rawKeys,values,totals} sliced to last N entries
function sliceTail(grouped, n) {
    if (n === 0 || grouped.labels.length <= n) return grouped;
    const start = grouped.labels.length - n;
    return {
        labels: grouped.labels.slice(start),
        rawKeys: grouped.rawKeys.slice(start),
        values: grouped.values.slice(start),
        totals: grouped.totals.slice(start),
    };
}

// ── Chart Color Config ────────────────────────────────────────────────────────
const COLORS = {
    indigo: { solid: '#4f46e5', hover: '#3730a3', line: 'rgba(79,70,229,0.15)' },
    emerald: { solid: '#10b981', hover: '#059669', line: 'rgba(16,185,129,0.15)' },
    amber: { solid: '#f59e0b', hover: '#d97706', line: 'rgba(245,158,11,0.15)' },
    rose: { solid: '#f43f5e', hover: '#e11d48', line: 'rgba(244,63,94,0.15)' },
};

function makeGradient(ctx, colorKey, height) {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, COLORS[colorKey].solid + 'bb');
    g.addColorStop(1, COLORS[colorKey].solid + '22');
    return g;
}

// ── Tooltip callback ──────────────────────────────────────────────────────────
function makeTooltipCallbacks(data, metricKey) {
    return {
        title(items) {
            const idx = items[0].dataIndex;
            return data.rawKeys ? data.rawKeys[idx] : items[0].label;
        },
        label(item) {
            const idx = item.dataIndex;
            const val = data.values[idx];
            if (val === null || val === undefined) return 'No data';
            const cnt = data.totals ? ` (${data.totals[idx]} admissions)` : '';
            if (metricKey === 'count') return `🎓 ${fmtNum(val)} admissions`;
            if (metricKey === 'score') return `🎯 ${fmtNum(val, 2)} avg score${cnt}`;
            if (metricKey === 'percentage') return `📊 ${fmtNum(val, 2)}% avg${cnt}`;
        }
    };
}

const TOOLTIP_BASE = {
    backgroundColor: '#1e293b',
    titleColor: '#f8fafc',
    bodyColor: '#94a3b8',
    padding: 12,
    cornerRadius: 10,
    displayColors: false,
    titleFont: { family: 'Inter', size: 13, weight: 'bold' },
    bodyFont: { family: 'Inter', size: 12 },
};

const TICK_STYLE = { font: { family: 'Inter', size: 11 }, color: '#94a3b8' };

// ── Render: Daily LINE chart ──────────────────────────────────────────────────
function renderDayChart(data, metricKey, metricLabel) {
    const wrapEl = document.getElementById('dayChartWrap');
    const canvas = document.getElementById('dayChart');
    wrapEl.querySelectorAll('.no-data-overlay').forEach(e => e.remove());

    const hasData = data.values.some(v => v !== null);
    if (!hasData) {
        if (charts.dayChart) { charts.dayChart.destroy(); delete charts.dayChart; }
        const ol = document.createElement('div'); ol.className = 'no-data-overlay';
        ol.innerHTML = '<div class="nd-icon">📭</div><div>No data for selected range</div>';
        wrapEl.appendChild(ol); return;
    }

    const ctx = canvas.getContext('2d');
    if (charts.dayChart) charts.dayChart.destroy();

    const n = data.labels.length;
    const col = COLORS.indigo;

    charts.dayChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: metricLabel,
                data: data.values,
                borderColor: col.solid,
                borderWidth: 2,
                pointRadius: n <= 30 ? 4 : (n <= 60 ? 2 : 0),
                pointHoverRadius: 6,
                pointBackgroundColor: col.solid,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                fill: true,
                backgroundColor(ctx2) {
                    const chart = ctx2.chart;
                    const { ctx: c, chartArea } = chart;
                    if (!chartArea) return col.line;
                    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    g.addColorStop(0, 'rgba(79,70,229,0.25)');
                    g.addColorStop(1, 'rgba(79,70,229,0.01)');
                    return g;
                },
                tension: 0.35,
                spanGaps: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: { ...TOOLTIP_BASE, callbacks: makeTooltipCallbacks(data, metricKey) },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        ...TICK_STYLE,
                        maxRotation: 45,
                        // Auto-thin: show every Nth label based on count
                        callback(val, idx) {
                            const step = n <= 20 ? 1 : n <= 40 ? 2 : n <= 70 ? 3 : n <= 120 ? 7 : 14;
                            return idx % step === 0 ? this.getLabelForValue(val) : '';
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    border: { display: false },
                    ticks: {
                        ...TICK_STYLE,
                        maxTicksLimit: 6,
                        callback(v) {
                            if (metricKey === 'percentage') return v + '%';
                            return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v;
                        }
                    }
                }
            }
        }
    });

    // Info text
    document.getElementById('dayInfoText').innerHTML =
        `<strong>${n} data points</strong> · ${data.rawKeys[0]} → ${data.rawKeys[n - 1]}`;
}

// ── Render: Weekly / Monthly BAR chart ───────────────────────────────────────
function renderBarChart(ctxId, wrapId, data, colorKey, metricKey, metricLabel) {
    const wrapEl = document.getElementById(wrapId);
    const canvas = document.getElementById(ctxId);
    wrapEl.querySelectorAll('.no-data-overlay').forEach(e => e.remove());

    const hasData = data.values.some(v => v !== null);
    if (!hasData) {
        if (charts[ctxId]) { charts[ctxId].destroy(); delete charts[ctxId]; }
        const ol = document.createElement('div'); ol.className = 'no-data-overlay';
        ol.innerHTML = '<div class="nd-icon">📭</div><div>No data for selected range</div>';
        wrapEl.appendChild(ol); return;
    }

    const ctx = canvas.getContext('2d');
    if (charts[ctxId]) charts[ctxId].destroy();

    const n = data.labels.length;
    const col = COLORS[colorKey];

    charts[ctxId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: metricLabel,
                data: data.values,
                backgroundColor(ctx2) {
                    const chart = ctx2.chart;
                    const { ctx: c, chartArea } = chart;
                    if (!chartArea) return col.solid + '99';
                    return makeGradient(c, colorKey, chartArea.bottom - chartArea.top);
                },
                hoverBackgroundColor: col.hover,
                borderRadius: { topLeft: 5, topRight: 5 },
                borderSkipped: 'bottom',
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: { ...TOOLTIP_BASE, callbacks: makeTooltipCallbacks(data, metricKey) },
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        ...TICK_STYLE,
                        maxRotation: 45,
                        // For weekly: if >16 weeks, thin out labels
                        callback(val, idx) {
                            const step = n <= 16 ? 1 : n <= 26 ? 2 : 3;
                            return idx % step === 0 ? this.getLabelForValue(val) : '';
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    border: { display: false },
                    ticks: {
                        ...TICK_STYLE,
                        maxTicksLimit: 6,
                        callback(v) {
                            if (metricKey === 'percentage') return v + '%';
                            return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v;
                        }
                    }
                }
            }
        }
    });
}

function groupDistributionData(data) {
    const labels = ['0–20%', '21–40%', '41–60%', '61–80%', '81–100%'];
    const counts = [0, 0, 0, 0, 0];

    data.forEach(item => {
        if (item.Percentage !== null && item.Percentage !== undefined) {
            const p = item.Percentage;
            if (p <= 20) counts[0]++;
            else if (p <= 40) counts[1]++;
            else if (p <= 60) counts[2]++;
            else if (p <= 80) counts[3]++;
            else counts[4]++;
        }
    });

    return {
        labels: labels,
        values: counts,
        totals: counts, // to match tooltip format
        rawKeys: labels
    };
}

// ── Render: Course Demand Doughnut chart ─────────────────────────────────────
function buildCourseDemand(data) {
    const courseCounts = {};
    data.forEach(student => {
        const course = student.Course;
        if (!course || course.trim() === '') return;
        courseCounts[course] = (courseCounts[course] || 0) + 1;
    });
    return courseCounts;
}

function renderCourseChart(data) {
    const wrapEl = document.getElementById('courseChartWrap');
    if (!wrapEl) return;
    const canvas = document.getElementById('courseChart');
    wrapEl.querySelectorAll('.no-data-overlay').forEach(e => e.remove());

    const courseData = buildCourseDemand(data);
    const labels = Object.keys(courseData);
    const values = Object.values(courseData);

    if (labels.length === 0) {
        if (charts.courseChart) { charts.courseChart.destroy(); delete charts.courseChart; }
        const ol = document.createElement('div'); ol.className = 'no-data-overlay';
        ol.innerHTML = '<div class="nd-icon">📭</div><div>No data for selected range</div>';
        wrapEl.appendChild(ol); return;
    }

    const ctx = canvas.getContext('2d');
    if (charts.courseChart) charts.courseChart.destroy();

    charts.courseChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    '#6366f1', '#10b981', '#f59e0b', '#ef4444',
                    '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
                ],
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { font: { family: 'Inter', size: 11 }, color: '#475569', boxWidth: 12, usePointStyle: true }
                },
                tooltip: {
                    ...TOOLTIP_BASE,
                    callbacks: { label: c => ` ${c.label}: ${c.raw} students` }
                }
            }
        },
        plugins: [{
            id: 'centerText',
            beforeDraw: function (chart) {
                const ctx = chart.ctx;
                ctx.restore();
                const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);

                const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
                const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;

                ctx.font = "600 14px Inter";
                ctx.textBaseline = "middle";
                ctx.textAlign = "center";
                ctx.fillStyle = "#94a3b8";
                ctx.fillText("TOTAL", centerX, centerY - 18);

                ctx.font = "800 48px Inter";
                ctx.fillStyle = "#0f172a";
                ctx.fillText(total, centerX, centerY + 16);
                ctx.save();
            }
        }]
    });
}

// ── updateCharts ──────────────────────────────────────────────────────────────
function updateCharts() {
    const m = activeMetric;
    const metricLabel =
        m === 'count' ? 'Admissions' :
            m === 'score' ? 'Avg Score' :
                'Avg Percentage (%)';

    const sub =
        m === 'count' ? 'Number of admissions per period' :
            m === 'score' ? 'Average score per period' :
                'Average percentage per period';

    document.getElementById('daySubtitle').textContent = sub;
    document.getElementById('weekSubtitle').textContent = sub;
    document.getElementById('monthSubtitle').textContent = sub;

    // Daily: full group then slice to window
    const allDayData = groupData(filteredData, getDayKey, fmtDayLabel, m);
    const dayData = sliceTail(allDayData, activeDayWindow);

    // Weekly and Monthly: group filtered data directly
    const weekData = groupData(filteredData, getWeekKey, fmtWeekLabel, m);
    const monthData = groupData(filteredData, getMonthKey, fmtMonthLabel, m);
    const distData = groupDistributionData(filteredData);

    renderDayChart(dayData, m, metricLabel);
    renderBarChart('weekChart', 'weekChartWrap', weekData, 'emerald', m, metricLabel);
    renderBarChart('monthChart', 'monthChartWrap', monthData, 'amber', m, metricLabel);
    renderBarChart('distChart', 'distChartWrap', distData, 'rose', 'count', 'Students');
    renderCourseChart(filteredData);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function populateStats() {
    const n = filteredData.length;
    const dates = filteredData.map(d => d.DateObj).sort((a, b) => a - b);
    const first = dates[0], last = dates[dates.length - 1];
    const scores = filteredData.map(d => d.Score).filter(s => s !== null);
    const pcts = filteredData.map(d => d.Percentage).filter(p => p !== null);

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    document.getElementById('statTotal').textContent = fmtNum(n);
    document.getElementById('statDateRange').textContent = first && last
        ? `${fmtDate(first)} – ${fmtDate(last)}` : '—';

    document.getElementById('statAvgScore').textContent = avg(scores) !== null ? fmtNum(avg(scores), 1) : '—';
    document.getElementById('statScoreRange').textContent = scores.length
        ? `Min ${fmtNum(Math.min(...scores), 1)}  ·  Max ${fmtNum(Math.max(...scores), 1)}` : 'No score data';

    document.getElementById('statAvgPct').textContent = avg(pcts) !== null ? fmtNum(avg(pcts), 1) + '%' : '—';
    document.getElementById('statPctRange').textContent = pcts.length
        ? `Min ${fmtNum(Math.min(...pcts), 1)}%  ·  Max ${fmtNum(Math.max(...pcts), 1)}%` : 'No % data';

    const dayGroups = {};
    filteredData.forEach(d => {
        const k = getDayKey(d.DateObj); dayGroups[k] = (dayGroups[k] || 0) + 1;
    });
    const bestKey = Object.keys(dayGroups).sort((a, b) => dayGroups[b] - dayGroups[a])[0];
    document.getElementById('statActiveDays').textContent = fmtNum(Object.keys(dayGroups).length);
    document.getElementById('statBestDay').textContent = bestKey
        ? `Peak: ${fmtDayLabel(bestKey)} (${dayGroups[bestKey]} admissions)` : '—';
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchData() {
    setRefreshState(true);
    try {
        const res = await fetch(API_URL + '?t=' + Date.now());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();

        if (!raw || raw.length === 0) { showError('No admissions found.', false); return; }

        allData = raw.map(row => {
            const rawDate = row['Timestamp'] || row['Date'] || row['date'] || row['timestamp'];
            const dateObj = parseDateStr(rawDate);
            const score = parseFloat(row['Score'] ?? row['score'] ?? 'NaN');
            const pct = parseFloat(row['Percentage'] ?? row['percentage'] ?? 'NaN');
            return {
                DateObj: dateObj,
                Score: isNaN(score) ? null : score,
                Percentage: isNaN(pct) ? null : pct,
                Course: row['Course'] || row['course'] || row['Program'] || row['program'] || ''
            };
        }).filter(d => d.DateObj !== null);

        if (!allData.length) { showError('No valid dates parsed.', false); return; }

        // Set date input bounds
        const minD = new Date(Math.min(...allData.map(d => d.DateObj)));
        const maxD = new Date(Math.max(...allData.map(d => d.DateObj)));
        dateFrom.min = dateTo.min = toYMD(minD);
        dateFrom.max = dateTo.max = toYMD(maxD);

        // Show UI
        loadingState.style.display = 'none';
        statsGrid.style.display = 'grid';
        filterBar.style.display = 'flex';
        chartsSection.style.display = 'flex';

        applyGlobalFilter();
        populateStats();
        updateCharts();
        updateLastUpdated();

    } catch (err) {
        console.error(err);
        showError('Failed to load data. Check your connection.', true);
    } finally {
        setRefreshState(false);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setRefreshState(loading) {
    refreshBtn.classList.toggle('spinning', loading);
    refreshBtn.disabled = loading;
}

function showError(msg, showRetry) {
    loadingState.innerHTML = `
      <div class="error-box">
        <div class="error-icon">⚠️</div>
        <div><strong>Something went wrong</strong><p>${msg}</p></div>
        ${showRetry ? '<button class="btn-retry" onclick="init()">Try Again</button>' : ''}
      </div>`;
}

function updateLastUpdated() {
    const el = document.getElementById('lastUpdated');
    document.getElementById('lastUpdatedTime').textContent =
        new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    el.style.display = 'flex';
}

// ── Events ────────────────────────────────────────────────────────────────────
// Metric toggle
metricToggle.addEventListener('click', e => {
    const btn = e.target.closest('.metric-btn');
    if (!btn) return;
    metricToggle.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMetric = btn.dataset.metric;
    updateCharts();
});

// Refresh
refreshBtn.addEventListener('click', () => { if (!refreshBtn.disabled) fetchData(); });

// Global range preset pills
document.getElementById('rangePills').addEventListener('click', e => {
    const pill = e.target.closest('.range-pill');
    if (!pill) return;
    document.querySelectorAll('.range-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    globalRangeDays = parseInt(pill.dataset.days);
    customFrom = null; customTo = null;
    dateFrom.value = ''; dateTo.value = '';
    applyGlobalFilter();
    populateStats();
    updateCharts();
});

// Custom date range
document.getElementById('applyCustomRange').addEventListener('click', () => {
    const f = dateFrom.value, t = dateTo.value;
    if (!f || !t) return;
    customFrom = new Date(f + 'T00:00:00');
    customTo = new Date(t + 'T23:59:59');
    if (customFrom > customTo) { alert('Start date must be before end date'); return; }
    // Deactivate preset pills
    document.querySelectorAll('.range-pill').forEach(p => p.classList.remove('active'));
    globalRangeDays = 0;
    applyGlobalFilter();
    populateStats();
    updateCharts();
});

// Daily window pills
document.getElementById('dayWindowPills').addEventListener('click', e => {
    const pill = e.target.closest('.window-pill');
    if (!pill) return;
    document.querySelectorAll('.window-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeDayWindow = parseInt(pill.dataset.window);
    updateCharts();
});

// Reset zoom
document.getElementById('resetDayZoom').addEventListener('click', () => {
    if (charts.dayChart) charts.dayChart.resetZoom();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
function init() {
    loadingState.innerHTML = `
      <div class="skeleton-stats">
        <div class="skeleton-card shimmer"></div>
        <div class="skeleton-card shimmer"></div>
        <div class="skeleton-card shimmer"></div>
        <div class="skeleton-card shimmer"></div>
      </div>
      <div class="skeleton-chart-card h1 shimmer"></div>
      <div class="skeleton-chart-card h2 shimmer"></div>
      <div class="skeleton-chart-card h3 shimmer"></div>
      <div class="skeleton-chart-card h2 shimmer"></div>`;

    loadingState.style.display = 'block';
    statsGrid.style.display = 'none';
    filterBar.style.display = 'none';
    chartsSection.style.display = 'none';
    fetchData();
}

document.addEventListener('DOMContentLoaded', init);
