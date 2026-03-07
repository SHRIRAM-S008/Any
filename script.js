// script.js

// Using the provided Google Apps Script Web App URL
const API_URL = 'https://script.google.com/macros/s/AKfycbxBWyHjbgQk_r5R8PxlwiUjNyrXZN9Ct6TfXgU_Lz71r72ILB0LI4H6oIMcxR4l2yHWGA/exec';

let allData = [];
let sortConfig = { key: null, direction: 'asc' };

// DOM Elements
const searchInput = document.getElementById('searchInput');
const dateFilter = document.getElementById('dateFilter');
const courseFilter = document.getElementById('courseFilter');
const resetBtn = document.getElementById('resetBtn');
const tableBody = document.getElementById('tableBody');
const loadingEl = document.getElementById('loading');
const dataTable = document.getElementById('dataTable');
const noResults = document.getElementById('noResults');
const thElements = document.querySelectorAll('th[data-sort]');

// Utility to parse dates for sorting and filtering
function parseDateStr(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

// Convert date to YYYY-MM-DD for exact match
function toYYYYMMDD(dateObj) {
    if (!dateObj) return '';
    return dateObj.toISOString().split('T')[0];
}

// Initialization
async function init() {
    if (API_URL === 'YOUR_WEB_APP_URL_HERE') {
        loadingEl.innerHTML = '<span style="color:red">Please replace YOUR_WEB_APP_URL_HERE in script.js with your deployed Google Apps Script URL.</span>';
        return;
    }

    try {
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Ensure there is data
        if (!data || data.length === 0) {
            loadingEl.textContent = 'No records found in the Google Sheet.';
            return;
        }

        // The Apps Script might return keys with trailing spaces like "Date " and "Name "
        // Let's normalize the keys first by trimming them
        const normalizedData = data.map(row => {
            const cleanRow = {};
            for (const key in row) {
                if (Object.prototype.hasOwnProperty.call(row, key)) {
                    cleanRow[key.trim()] = row[key];
                }
            }
            return cleanRow;
        });

        // Map rows to our expected generic objects
        allData = normalizedData.map(row => {

            // Format the date to only show YYYY-MM-DD, omitting time
            let parsedDate = '-';
            let rawDate = row['Timestamp'] || row['Date'];
            if (rawDate) {
                const dateObj = new Date(rawDate);
                if (!isNaN(dateObj.getTime())) {
                    parsedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
                } else {
                    // Try removing time part manually if new Date fails
                    parsedDate = rawDate.split('T')[0].split(' ')[0];
                }
            }

            // Fallbacks for 'Name' logic
            let studentName = row['Name'] || row['name'] || '-';

            return {
                Date: parsedDate,
                Name: studentName,
                Email: row['Email'] || row['email'],
                'Meritto ID': row['Meritto ID'] || row['Phone'] || '-',
                Course: row['Course'] || row['course'],
                Score: row.score || row['Score'],
                'Max Score': row.maxScore || row['Max Score'],
                Percentage: row.percentage || row['Percentage'],
                Correct: row['Correct'] || row['correctCount'],
                Incorrect: row['Incorrect'] || row['incorrectCount'],
                'Analytical Score': row['Analytical'] || row.analytical || row['Analytical Score'],
                'Programming Score': row['Programming'] || row.programming || row['Programming Score'],
                'Communication Score': row['Communication'] || row.communication || row['Communication Score']
            };
        });

        // Populate course dropdown
        const courses = [...new Set(allData.map(d => d.Course).filter(Boolean))].sort();
        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course;
            option.textContent = course;
            courseFilter.appendChild(option);
        });

        loadingEl.style.display = 'none';
        dataTable.style.display = 'table';

        renderTable(allData);

    } catch (error) {
        console.error('Error fetching data:', error);
        loadingEl.textContent = 'Failed to load data. Please check the network tab or CORS policy.';
    }

    // Event Listeners
    searchInput.addEventListener('input', applyFilters);
    dateFilter.addEventListener('change', applyFilters);
    courseFilter.addEventListener('change', applyFilters);
    resetBtn.addEventListener('click', resetFilters);

    thElements.forEach(th => th.addEventListener('click', handleSort));
}

function handleSort(e) {
    const key = e.target.getAttribute('data-sort');
    if (sortConfig.key === key) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortConfig.key = key;
        sortConfig.direction = 'asc';
    }
    applyFilters();
}

function applyFilters() {
    const query = searchInput.value.toLowerCase();
    const dateQuery = dateFilter.value; // YYYY-MM-DD
    const courseQuery = courseFilter.value;

    let filtered = allData.filter(row => {
        // 1. Date Filter (Daywise)
        if (dateQuery) {
            const rowDateObj = parseDateStr(row.Date);
            if (!rowDateObj || toYYYYMMDD(rowDateObj) !== dateQuery) {
                return false;
            }
        }

        // 2. Course Filter
        if (courseQuery && row.Course !== courseQuery) {
            return false;
        }

        // 3. Search text (Date, Name, Email, Meritto ID, Course, Score)
        if (query) {
            const searchFields = [
                row.Date,
                row.Name,
                row.Email,
                row['Meritto ID'],
                row.Course,
                row.Score
            ].join(' ').toLowerCase();

            if (!searchFields.includes(query)) {
                return false;
            }
        }

        return true;
    });

    // Custom Sort
    if (sortConfig.key) {
        filtered.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            // Make numeric sorting work properly for numbers vs strings
            const numA = parseFloat(valA);
            const numB = parseFloat(valB);

            if (!isNaN(numA) && !isNaN(numB)) {
                return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
            }

            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    renderTable(filtered);
}

function renderTable(data) {
    tableBody.innerHTML = '';

    if (data.length === 0) {
        dataTable.style.display = 'none';
        noResults.style.display = 'block';
        return;
    }

    dataTable.style.display = 'table';
    noResults.style.display = 'none';

    data.forEach(row => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${row.Date || '-'}</td>
            <td style="font-weight: 500;">${row.Name || '-'}</td>
            <td>${row.Email || '-'}</td>
            <td><code style="background:#eef2f6;padding:2px 6px;border-radius:4px;font-size:0.8rem;">${row['Meritto ID'] || '-'}</code></td>
            <td>${row.Course ? `<span class="badge" style="background-color: ${stringToColor(row.Course)}">${row.Course}</span>` : '-'}</td>
            <td align="right" class="td-numeric" style="font-weight:600;color:var(--accent-primary);">${row.Score || '-'}</td>
            <td align="right" class="td-numeric">${row['Max Score'] || '-'}</td>
            <td align="right" class="td-numeric">${row.Percentage ? parseFloat(row.Percentage).toFixed(2) + '%' : '-'}</td>
            <td align="right" class="td-numeric" style="color:#10b981;">${row.Correct || '0'}</td>
            <td align="right" class="td-numeric" style="color:#ef4444;">${row.Incorrect || '0'}</td>
            <td align="right" class="td-numeric">${row['Analytical Score'] || '-'}</td>
            <td align="right" class="td-numeric">${row['Programming Score'] || '-'}</td>
            <td align="right" class="td-numeric">${row['Communication Score'] || '-'}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function resetFilters() {
    searchInput.value = '';
    dateFilter.value = '';
    courseFilter.value = '';
    sortConfig = { key: null, direction: 'asc' };
    applyFilters();
}

// Generate consistent beautiful colors for course badges
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorHues = [200, 260, 20, 320, 160, 45, 120];
    const index = Math.abs(hash) % colorHues.length;
    return `hsl(${colorHues[index]}, 70%, 55%)`;
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
