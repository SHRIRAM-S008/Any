// ── Config ──────────────────────────────────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycbxBWyHjbgQk_r5R8PxlwiUjNyrXZN9Ct6TfXgU_Lz71r72ILB0LI4H6oIMcxR4l2yHWGA/exec';

let allData = [];
let charts = {};

const loadingState = document.getElementById('loadingState');
const chartsSection = document.getElementById('chartsSection');
const metricSelect = document.getElementById('metricSelect');

// Utility to parse dates "DD/MM/YYYY" or ISO back to Date
function parseDateStr(str) {
    if (!str || str === '-') return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
        const [d, m, y] = str.split('/');
        return new Date(`${y}-${m}-${d}`);
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

// Grouping Keys
function getDayKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getWeekKey(dateObj) {
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getMonthKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

async function init() {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();

        if (!raw || raw.length === 0) {
            loadingState.innerHTML = '<p style="color:var(--text-muted);padding:2rem;text-align:center;">No records found.</p>';
            return;
        }

        // Map to internal schema
        allData = raw.map(row => {
            const rawDate = row['Timestamp'] || row['Date'];
            let parsedDate = null;
            if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) parsedDate = d;
            }

            return {
                DateObj: parsedDate,
                Score: parseFloat(row['Score'] || row['score']) || 0,
                Percentage: parseFloat(row['Percentage'] || row['percentage']) || 0,
            };
        }).filter(d => d.DateObj !== null);

        loadingState.style.display = 'none';
        chartsSection.style.display = 'flex';

        metricSelect.addEventListener('change', updateCharts);
        updateCharts();

    } catch (err) {
        console.error(err);
        loadingState.innerHTML = '<p style="color:#ef4444;padding:2rem;text-align:center;">Failed to load data. Check console for details.</p>';
    }
}

function groupData(data, keyFn, metric) {
    const groups = {};
    data.forEach(item => {
        const key = keyFn(item.DateObj);
        if (!groups[key]) {
            groups[key] = { count: 0, totalScore: 0, totalPct: 0 };
        }
        groups[key].count += 1;
        groups[key].totalScore += item.Score;
        groups[key].totalPct += item.Percentage;
    });

    const sortedKeys = Object.keys(groups).sort();
    return {
        labels: sortedKeys,
        values: sortedKeys.map(k => {
            if (metric === 'count') return groups[k].count;
            if (metric === 'score') return parseFloat((groups[k].totalScore / groups[k].count).toFixed(2));
            if (metric === 'percentage') return parseFloat((groups[k].totalPct / groups[k].count).toFixed(2));
        })
    };
}

function renderChart(ctxId, label, data, color) {
    const canvas = document.getElementById(ctxId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (charts[ctxId]) {
        charts[ctxId].destroy();
    }

    charts[ctxId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: label,
                data: data.values,
                backgroundColor: color,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: color
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: "#e2e8f0" },
                    ticks: { font: { family: 'Inter', size: 12 }, color: "#64748b" }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 12 }, color: "#64748b" }
                }
            }
        }
    });

    // Update Y axis title
    charts[ctxId].options.plugins.title = {
        display: true,
        text: label,
        color: "#475569",
        font: { family: 'Inter', size: 14, weight: 'bold' }
    };
    charts[ctxId].update();
}

function updateCharts() {
    const metric = metricSelect.value;
    let label = 'Number of Records';
    if (metric === 'score') label = 'Average Score';
    if (metric === 'percentage') label = 'Average Percentage (%)';

    const dayData = groupData(allData, getDayKey, metric);
    const weekData = groupData(allData, getWeekKey, metric);
    const monthData = groupData(allData, getMonthKey, metric);

    // Primary, emerald (success), and amber arrays
    renderChart('dayChart', label, dayData, '#4f46e5');
    renderChart('weekChart', label, weekData, '#10b981');
    renderChart('monthChart', label, monthData, '#f59e0b');
}

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
