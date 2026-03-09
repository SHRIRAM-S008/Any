// ── Config ──────────────────────────────────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycbxBWyHjbgQk_r5R8PxlwiUjNyrXZN9Ct6TfXgU_Lz71r72ILB0LI4H6oIMcxR4l2yHWGA/exec';

// ── State ────────────────────────────────────────────────────────────────────
let allData = [];
let sortConfig = { key: null, direction: 'asc' };

// ── DOM Refs ─────────────────────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const dateFilter = document.getElementById('dateFilter');
const courseFilter = document.getElementById('courseFilter');
const scoreMinSlider = document.getElementById('scoreMinSlider');
const scoreMaxSlider = document.getElementById('scoreMaxSlider');
const scoreMinDisplay = document.getElementById('scoreMinDisplay');
const scoreMaxDisplay = document.getElementById('scoreMaxDisplay');
const scoreFill = document.getElementById('scoreFill');

const pctMinSlider = document.getElementById('pctMinSlider');
const pctMaxSlider = document.getElementById('pctMaxSlider');
const pctMinDisplay = document.getElementById('pctMinDisplay');
const pctMaxDisplay = document.getElementById('pctMaxDisplay');
const pctFill = document.getElementById('pctFill');
const resetBtn = document.getElementById('resetBtn');
const tableBody = document.getElementById('tableBody');
const loadingState = document.getElementById('loadingState');
const tableScroll = document.getElementById('tableScrollWrapper');
const noResults = document.getElementById('noResults');
const resultCount = document.getElementById('resultCount');
const totalCount = document.getElementById('totalCount');
const shownCount = document.getElementById('shownCount');
const activeFilters = document.getElementById('activeFilters');
const sortLegend = document.getElementById('sortLegend');
const sortLegendText = document.getElementById('sortLegendText');
const thElements = document.querySelectorAll('th[data-sort]');

// Quick-sort buttons
const qsButtons = document.querySelectorAll('.btn-quick-sort');

// ── Utilities ────────────────────────────────────────────────────────────────

// Parse "DD/MM/YYYY" or ISO back to Date
function parseDateStr(str) {
    if (!str || str === '-') return null;
    // Handle DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
        const [d, m, y] = str.split('/');
        return new Date(`${y}-${m}-${d}`);
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function toYYYYMMDD(dateObj) {
    if (!dateObj) return '';
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDisplayDate(str) {
    const d = parseDateStr(str);
    if (!d) return str || '-';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getPctColor(pct) {
    if (pct >= 75) return '#10b981';
    if (pct >= 50) return '#f59e0b';
    return '#ef4444';
}

function stringToColor(str) {
    if (!str) return '#6366f1';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hues = [220, 260, 20, 320, 160, 45, 120, 195, 280, 350];
    return `hsl(${hues[Math.abs(hash) % hues.length]}, 65%, 50%)`;
}

// ── Data Fetch ───────────────────────────────────────────────────────────────
async function init() {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();

        if (!raw || raw.length === 0) {
            loadingState.innerHTML = '<p style="color:var(--text-muted);padding:2rem;text-align:center;">No records found.</p>';
            return;
        }

        // Normalize keys (trim whitespace)
        const normalized = raw.map(row => {
            const clean = {};
            for (const k in row) {
                if (Object.prototype.hasOwnProperty.call(row, k)) {
                    clean[k.trim()] = row[k];
                }
            }
            return clean;
        });

        // Map to internal schema
        allData = normalized.map(row => {
            let parsedDate = '-';
            const rawDate = row['Timestamp'] || row['Date'];
            if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                    parsedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                } else {
                    parsedDate = rawDate.split('T')[0].split(' ')[0];
                }
            }

            const scoreVal = parseFloat(row['Score'] || row['score']);
            const maxScoreVal = parseFloat(row['Max Score'] || row['maxScore']);

            let percentageVal = null;
            if (!isNaN(scoreVal)) {
                if (!isNaN(maxScoreVal) && maxScoreVal > 0) {
                    percentageVal = (scoreVal / maxScoreVal) * 100;
                } else {
                    percentageVal = (scoreVal / 40) * 100; // default max score to 40
                }
            }

            return {
                Date: parsedDate,
                Name: row['Name'] || row['name'] || '-',
                Email: row['Email'] || row['email'] || '-',
                'Meritto ID': row['Meritto ID'] || row['Phone'] || '-',
                Course: row['Course'] || row['course'] || '-',
                Score: isNaN(scoreVal) ? null : scoreVal,
                'Max Score': isNaN(maxScoreVal) ? null : maxScoreVal,
                Percentage: percentageVal,
                Correct: parseInt(row['Correct'] || row['correctCount']) || 0,
                Incorrect: parseInt(row['Incorrect'] || row['incorrectCount']) || 0,
                'Analytical Score': parseFloat(row['Analytical'] || row['Analytical Score'] || row['analytical']) || null,
                'Programming Score': parseFloat(row['Programming'] || row['Programming Score'] || row['programming']) || null,
                'Communication Score': parseFloat(row['Communication'] || row['Communication Score'] || row['communication']) || null,
            };
        });

        // Populate course dropdown
        const courses = [...new Set(allData.map(d => d.Course).filter(c => c && c !== '-'))].sort();
        courses.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            courseFilter.appendChild(opt);
        });

        totalCount.textContent = allData.length;
        loadingState.style.display = 'none';
        tableScroll.style.display = 'block';

        initSliders();
        attachListeners();
        attachSliderListeners();
        applyFilters();

    } catch (err) {
        console.error(err);
        loadingState.innerHTML = `<p style="color:#ef4444;padding:2rem;text-align:center;">Failed to load data. Check console for details.</p>`;
    }
}

function initSliders() {
    // Set max score to 40
    const safeMax = 40;

    scoreMinSlider.max = safeMax;
    scoreMaxSlider.max = safeMax;
    scoreMinSlider.value = 0;
    scoreMaxSlider.value = safeMax;
    scoreMinDisplay.textContent = 0;
    scoreMaxDisplay.textContent = safeMax;
    updateFill(scoreMinSlider, scoreMaxSlider, scoreFill);

    pctMinSlider.value = 0;
    pctMaxSlider.value = 100;
    updateFill(pctMinSlider, pctMaxSlider, pctFill);
}

function updateFill(minSlider, maxSlider, fillEl) {
    const min = parseFloat(minSlider.min) || 0;
    const max = parseFloat(minSlider.max) || 100;
    const left = parseFloat(minSlider.value) || 0;
    const right = parseFloat(maxSlider.value) || 100;

    const leftPct = ((left - min) / (max - min)) * 100;
    const rightPct = ((right - min) / (max - min)) * 100;

    fillEl.style.left = `${leftPct}%`;
    fillEl.style.width = `${rightPct - leftPct}%`;
}

function attachSliderListeners() {
    // Score sliders
    function onScoreInput() {
        let minVal = parseFloat(scoreMinSlider.value);
        let maxVal = parseFloat(scoreMaxSlider.value);
        const gap = 1;

        if (minVal >= maxVal - gap) {
            if (this === scoreMinSlider) {
                scoreMinSlider.value = maxVal - gap;
                minVal = maxVal - gap;
            } else {
                scoreMaxSlider.value = minVal + gap;
                maxVal = minVal + gap;
            }
        }

        scoreMinDisplay.textContent = Math.round(minVal);
        scoreMaxDisplay.textContent = Math.round(maxVal);
        updateFill(scoreMinSlider, scoreMaxSlider, scoreFill);

        // Manage z-index when thumbs close to each other
        const totalRange = parseFloat(scoreMinSlider.max) - parseFloat(scoreMinSlider.min);
        const ratio = (minVal - parseFloat(scoreMinSlider.min)) / totalRange;
        scoreMinSlider.classList.toggle('on-top', ratio > 0.95);

        applyFilters();
    }

    scoreMinSlider.addEventListener('input', onScoreInput);
    scoreMaxSlider.addEventListener('input', onScoreInput);

    // Percentage sliders
    function onPctInput() {
        let minVal = parseFloat(pctMinSlider.value);
        let maxVal = parseFloat(pctMaxSlider.value);
        const gap = 1;

        if (minVal >= maxVal - gap) {
            if (this === pctMinSlider) {
                pctMinSlider.value = maxVal - gap;
                minVal = maxVal - gap;
            } else {
                pctMaxSlider.value = minVal + gap;
                maxVal = minVal + gap;
            }
        }

        pctMinDisplay.textContent = Math.round(minVal);
        pctMaxDisplay.textContent = Math.round(maxVal);
        updateFill(pctMinSlider, pctMaxSlider, pctFill);

        const ratio = minVal / 100;
        pctMinSlider.classList.toggle('on-top', ratio > 0.95);

        applyFilters();
    }

    pctMinSlider.addEventListener('input', onPctInput);
    pctMaxSlider.addEventListener('input', onPctInput);
}

// ── Event Listeners ──────────────────────────────────────────────────────────
function attachListeners() {
    searchInput.addEventListener('input', applyFilters);
    dateFilter.addEventListener('change', applyFilters);
    courseFilter.addEventListener('change', applyFilters);
    resetBtn.addEventListener('click', resetFilters);

    // Column header sort
    thElements.forEach(th => {
        if (th.classList.contains('sortable')) {
            th.addEventListener('click', () => handleSort(th.dataset.sort));
        }
    });

    // Quick sort buttons
    qsButtons.forEach(btn => {
        btn.addEventListener('click', () => handleSort(btn.dataset.sort));
    });
}

// ── Sorting ──────────────────────────────────────────────────────────────────
function handleSort(key) {
    if (sortConfig.key === key) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortConfig.key = key;
        sortConfig.direction = 'asc';
    }
    updateSortUI();
    applyFilters();
}

function updateSortUI() {
    // Column headers
    thElements.forEach(th => {
        th.classList.remove('sort-active');
        th.removeAttribute('data-dir');
    });

    if (sortConfig.key) {
        const activeTh = document.querySelector(`th[data-sort="${sortConfig.key}"]`);
        if (activeTh) {
            activeTh.classList.add('sort-active');
            activeTh.setAttribute('data-dir', sortConfig.direction);
        }

        // Legend
        sortLegend.style.display = 'flex';
        sortLegendText.textContent = `${sortConfig.key} (${sortConfig.direction === 'asc' ? '↑ Low→High' : '↓ High→Low'})`;

        // Quick-sort buttons
        qsButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === sortConfig.key);
            if (btn.dataset.sort === sortConfig.key) {
                btn.querySelector('.qs-arrow').textContent = sortConfig.direction === 'asc' ? '↑' : '↓';
            } else {
                btn.querySelector('.qs-arrow').textContent = '↕';
            }
        });
    } else {
        sortLegend.style.display = 'none';
        qsButtons.forEach(btn => {
            btn.classList.remove('active');
            btn.querySelector('.qs-arrow').textContent = '↕';
        });
    }
}

// ── Filtering & Rendering ────────────────────────────────────────────────────
function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    const dateQuery = dateFilter.value;
    const courseQuery = courseFilter.value;

    // Read from sliders now
    const sMin = parseFloat(scoreMinSlider.value);
    const sMax = parseFloat(scoreMaxSlider.value);
    const pMin = parseFloat(pctMinSlider.value);
    const pMax = parseFloat(pctMaxSlider.value);

    // Treat "full range" as no filter (so we don't filter on default state)
    const scoreFullRange = sMin <= parseFloat(scoreMinSlider.min) && sMax >= parseFloat(scoreMaxSlider.max);
    const pctFullRange = pMin <= 0 && pMax >= 100;

    let filtered = allData.filter(row => {
        if (dateQuery) {
            const dateObj = parseDateStr(row.Date);
            if (!dateObj || toYYYYMMDD(dateObj) !== dateQuery) return false;
        }
        if (courseQuery && row.Course !== courseQuery) return false;
        if (!scoreFullRange) {
            if (row.Score === null || row.Score < sMin || row.Score > sMax) return false;
        }
        if (!pctFullRange) {
            if (row.Percentage === null || row.Percentage < pMin || row.Percentage > pMax) return false;
        }
        if (query) {
            const haystack = [row.Date, row.Name, row.Email, row['Meritto ID'], row.Course]
                .join(' ').toLowerCase();
            if (!haystack.includes(query)) return false;
        }
        return true;
    });

    // Sort (unchanged from before)
    if (sortConfig.key) {
        const key = sortConfig.key;
        filtered.sort((a, b) => {
            let va = a[key], vb = b[key];
            if (typeof va === 'number' || typeof vb === 'number') {
                va = va ?? -Infinity; vb = vb ?? -Infinity;
                return sortConfig.direction === 'asc' ? va - vb : vb - va;
            }
            if (key === 'Date') {
                const da = parseDateStr(va)?.getTime() ?? 0;
                const db = parseDateStr(vb)?.getTime() ?? 0;
                return sortConfig.direction === 'asc' ? da - db : db - da;
            }
            va = (va || '').toString().toLowerCase();
            vb = (vb || '').toString().toLowerCase();
            return sortConfig.direction === 'asc'
                ? va < vb ? -1 : va > vb ? 1 : 0
                : va > vb ? -1 : va < vb ? 1 : 0;
        });
    }

    renderActiveFilterChips({ query, dateQuery, courseQuery, sMin, sMax, pMin, pMax, scoreFullRange, pctFullRange });
    renderTable(filtered);
    shownCount.textContent = filtered.length;
    resultCount.innerHTML = `Showing <strong>${filtered.length}</strong> of <strong>${allData.length}</strong> records`;
}

// ── Active Filter Chips ───────────────────────────────────────────────────────
function renderActiveFilterChips({ query, dateQuery, courseQuery, sMin, sMax, pMin, pMax, scoreFullRange, pctFullRange }) {
    activeFilters.innerHTML = '';
    const add = (label, clearFn) => {
        const chip = document.createElement('div');
        chip.className = 'filter-chip';
        chip.innerHTML = `${label} <button title="Remove">✕</button>`;
        chip.querySelector('button').addEventListener('click', clearFn);
        activeFilters.appendChild(chip);
    };

    if (query) add(`Search: "${query}"`, () => { searchInput.value = ''; applyFilters(); });
    if (dateQuery) add(`Date: ${formatDisplayDate(dateQuery)}`, () => { dateFilter.value = ''; applyFilters(); });
    if (courseQuery) add(`Course: ${courseQuery}`, () => { courseFilter.value = ''; applyFilters(); });

    if (!scoreFullRange) {
        add(`Score: ${Math.round(sMin)} – ${Math.round(sMax)}`, () => {
            scoreMinSlider.value = scoreMinSlider.min;
            scoreMaxSlider.value = scoreMaxSlider.max;
            scoreMinDisplay.textContent = scoreMinSlider.min;
            scoreMaxDisplay.textContent = scoreMaxSlider.max;
            updateFill(scoreMinSlider, scoreMaxSlider, scoreFill);
            applyFilters();
        });
    }
    if (!pctFullRange) {
        add(`Pct: ${Math.round(pMin)}% – ${Math.round(pMax)}%`, () => {
            pctMinSlider.value = 0;
            pctMaxSlider.value = 100;
            pctMinDisplay.textContent = '0';
            pctMaxDisplay.textContent = '100';
            updateFill(pctMinSlider, pctMaxSlider, pctFill);
            applyFilters();
        });
    }
}

// ── Render Table ─────────────────────────────────────────────────────────────
function renderTable(data) {
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableScroll.style.display = 'none';
        noResults.style.display = 'block';
        return;
    }

    tableScroll.style.display = 'block';
    noResults.style.display = 'none';

    const fragment = document.createDocumentFragment();

    data.forEach(row => {
        const tr = document.createElement('tr');

        const pct = row.Percentage;
        const pctColor = pct !== null ? getPctColor(pct) : '#94a3b8';
        const pctWidth = pct !== null ? Math.min(100, Math.max(0, pct)) : 0;
        const courseColor = stringToColor(row.Course);

        tr.innerHTML = `
            <td>
                <div class="cell-date">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    ${formatDisplayDate(row.Date)}
                </div>
            </td>
            <td><span class="cell-name">${row.Name || '-'}</span></td>
            <td><span class="cell-email">${row.Email || '-'}</span></td>
            <td><code class="cell-id">${row['Meritto ID'] || '-'}</code></td>
            <td>
                ${row.Course && row.Course !== '-'
                ? `<span class="badge" style="background:${courseColor}">${row.Course}</span>`
                : '-'}
            </td>
            <td class="numeric td-num">
                <span class="cell-score-main">${row.Score !== null ? row.Score : '-'}</span>
            </td>
            <td class="numeric td-num">${row['Max Score'] !== null ? row['Max Score'] : '-'}</td>
            <td class="numeric td-num">
                <div class="pct-cell">
                    <div class="pct-bar-track">
                        <div class="pct-bar-fill" style="width:${pctWidth}%;background:${pctColor};"></div>
                    </div>
                    <span class="pct-text" style="color:${pctColor};">
                        ${pct !== null ? pct.toFixed(1) + '%' : '-'}
                    </span>
                </div>
            </td>
            <td class="numeric td-num"><span class="cell-correct">+${row.Correct}</span></td>
            <td class="numeric td-num"><span class="cell-incorrect">−${row.Incorrect}</span></td>
            <td class="numeric td-num"><span class="cell-subscore">${row['Analytical Score'] !== null ? row['Analytical Score'] : '-'}</span></td>
            <td class="numeric td-num"><span class="cell-subscore">${row['Programming Score'] !== null ? row['Programming Score'] : '-'}</span></td>
            <td class="numeric td-num"><span class="cell-subscore">${row['Communication Score'] !== null ? row['Communication Score'] : '-'}</span></td>
        `;

        fragment.appendChild(tr);
    });

    tableBody.appendChild(fragment);
}

// ── Reset ────────────────────────────────────────────────────────────────────
function resetFilters() {
    searchInput.value = '';
    dateFilter.value = '';
    courseFilter.value = '';
    sortConfig = { key: null, direction: 'asc' };

    // Reset sliders
    scoreMinSlider.value = scoreMinSlider.min;
    scoreMaxSlider.value = scoreMaxSlider.max;
    scoreMinDisplay.textContent = scoreMinSlider.min;
    scoreMaxDisplay.textContent = scoreMaxSlider.max;
    updateFill(scoreMinSlider, scoreMaxSlider, scoreFill);

    pctMinSlider.value = 0;
    pctMaxSlider.value = 100;
    pctMinDisplay.textContent = '0';
    pctMaxDisplay.textContent = '100';
    updateFill(pctMinSlider, pctMaxSlider, pctFill);

    updateSortUI();
    applyFilters();
}
document.addEventListener('DOMContentLoaded', init);