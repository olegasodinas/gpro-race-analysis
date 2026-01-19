/*
    GPRO Race Analysis
    Copyright (C) 2026 Olegas Spausdinimas

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

        let chartInstance = null;
        let allRaceData = [];
        const DB_NAME = 'GPROAnalysisDB';
        const STORE_NAME = 'raceData';
        
        let currentChartPage = 0;
        const RACES_PER_CHART = 4;
        let currentChartRaces = [];

        function renderChart(races) {
            currentChartRaces = races;
            currentChartPage = 0;
            updateChartDisplay();
        }

        function changeChartPage(delta) {
            currentChartPage += delta;
            updateChartDisplay();
        }

        function updateChartDisplay() {
            const totalPages = Math.ceil(currentChartRaces.length / RACES_PER_CHART);
            
            if (currentChartPage < 0) currentChartPage = 0;
            if (currentChartPage >= totalPages && totalPages > 0) currentChartPage = totalPages - 1;

            const start = currentChartPage * RACES_PER_CHART;
            const end = start + RACES_PER_CHART;
            const visibleRaces = currentChartRaces.slice(start, end);
            
            updateChartControls(totalPages);
            drawChart(visibleRaces);
        }

        function updateChartControls(totalPages) {
            let container = document.getElementById('chartControls');
            if (!container) {
                container = document.createElement('div');
                container.id = 'chartControls';
                container.style.textAlign = 'center';
                container.style.marginBottom = '10px';
                container.style.color = 'var(--text-secondary)';
                const chartSection = document.querySelector('.chart-section');
                const canvas = document.getElementById('posChart');
                chartSection.insertBefore(container, canvas);
            }
            
            if (totalPages <= 1) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'block';
            
            container.innerHTML = `
                <button onclick="changeChartPage(-1)" ${currentChartPage === 0 ? 'disabled' : ''} style="cursor:pointer; padding:4px 12px; background:var(--card-bg); border:1px solid var(--border); color:var(--text-primary); border-radius:4px;">&lt;</button>
                <span style="margin:0 15px; font-size:0.9rem;">Page ${currentChartPage + 1} of ${totalPages}</span>
                <button onclick="changeChartPage(1)" ${currentChartPage >= totalPages - 1 ? 'disabled' : ''} style="cursor:pointer; padding:4px 12px; background:var(--card-bg); border:1px solid var(--border); color:var(--text-primary); border-radius:4px;">&gt;</button>
            `;
        }

        const partLabels = {
            'chassis': 'Chassis',
            'engine': 'Engine',
            'FWing': 'F.Wing',
            'RWing': 'R.Wing',
            'underbody': 'Underbody',
            'sidepods': 'Sidepods',
            'cooling': 'Cooling',
            'gear': 'Gearbox',
            'brakes': 'Brakes',
            'susp': 'Suspension',
            'electronics': 'Electronics'
        };

        Chart.defaults.color = '#b0b3b8';
        Chart.defaults.borderColor = '#3e4042';

        function sortTable(table, col) {
            const tbody = table.tBodies[0];
            const rows = Array.from(tbody.rows);
            const dir = table.getAttribute('data-sort-dir') === 'asc' ? 'desc' : 'asc';
            table.setAttribute('data-sort-dir', dir);
            
            const getVal = (row, idx) => {
                const cell = row.cells[idx];
                if (!cell) return '';
                let txt = cell.innerText.trim();
                
                // Handle Season/Race format (e.g., S96 R4 or S96 R4: Track)
                const raceMatch = txt.match(/^S(\d+)\s+R(\d+)/);
                if (raceMatch) {
                    return parseInt(raceMatch[1]) * 1000 + parseInt(raceMatch[2]);
                }

                // Handle Position format (e.g., P1, P10)
                const posMatch = txt.match(/^P(\d+)$/);
                if (posMatch) {
                     return parseInt(posMatch[1]);
                }

                const num = parseFloat(txt.replace(/[°%L]/g, ''));
                if (!isNaN(num) && isFinite(num) && !txt.startsWith('S')) return num;
                return txt.toLowerCase();
            };

            rows.sort((a, b) => {
                const valA = getVal(a, col);
                const valB = getVal(b, col);
                if (valA < valB) return dir === 'asc' ? -1 : 1;
                if (valA > valB) return dir === 'asc' ? 1 : -1;
                return 0;
            });

            rows.forEach(row => tbody.appendChild(row));
        }

        function showTooltip(e, content) {
            const el = document.getElementById('customTooltip');
            el.innerHTML = content;
            el.style.display = 'block';
            moveTooltip(e);
        }
        function moveTooltip(e) {
            const el = document.getElementById('customTooltip');
            if (el.style.display === 'block') {
                const offset = 20;
                const elWidth = el.offsetWidth;
                const elHeight = el.offsetHeight;
                const winW = window.innerWidth;
                const winH = window.innerHeight;
                const scrollX = window.scrollX;
                const scrollY = window.scrollY;

                let left = e.pageX + offset;
                let top = e.pageY + offset;

                if (left + elWidth > scrollX + winW - 10) {
                    left = e.pageX - elWidth - offset;
                }
                if (left < scrollX + 10) {
                    left = scrollX + 10;
                }
                if (top + elHeight > scrollY + winH - 10) {
                    top = e.pageY - elHeight - offset;
                }

                el.style.left = left + 'px';
                el.style.top = top + 'px';
            }
        }
        function hideTooltip() {
            document.getElementById('customTooltip').style.display = 'none';
        }

        function createTooltipAttr(content) {
            const safeTooltip = content.replace(/"/g, '&quot;').replace(/'/g, "\\'");
            return `onmouseenter="showTooltip(event, '${safeTooltip}')" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()" style="cursor:help;"`;
        }

        function openRainAnalysis() {
            if (allRaceData.length === 0) return;
            const r = allRaceData[0];
            const dId = r.driver && r.driver.id ? r.driver.id : 'unknown';
            const uid = `${r.selSeasonNb}-${r.selRaceNb}-${dId}`;
            filterByForecast(uid, 'rain');
        }

        function openComparisonTool() {
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'card';
            card.style.gridColumn = '1 / -1';
            
            let raceListHTML = `
                <table class="setup-table" style="text-align:left;">
                    <thead>
                        <tr>
                            <th style="width:30px"></th>
                            <th onclick="sortTable(this.closest('table'), 1)">Race</th>
                            <th onclick="sortTable(this.closest('table'), 2)">Track</th>
                            <th onclick="sortTable(this.closest('table'), 3)">Pos</th>
                            <th onclick="sortTable(this.closest('table'), 4)">Driver</th>
                            <th onclick="sortTable(this.closest('table'), 5)">Weather</th>
                            <th onclick="sortTable(this.closest('table'), 6)">Tyres</th>
                            <th onclick="sortTable(this.closest('table'), 7)">Problems</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            const sortedRaces = [...allRaceData].sort((a, b) => {
                if (a.selSeasonNb != b.selSeasonNb) return b.selSeasonNb - a.selSeasonNb;
                return b.selRaceNb - a.selRaceNb;
            });

            sortedRaces.forEach(r => {
                const driverName = r.driver ? r.driver.name.replace(/['"]/g, '') : 'Unknown';
                const uid = `${r.selSeasonNb}-${r.selRaceNb}-${r.driver ? r.driver.id : 'u'}`;
                
                let hasRain = false, hasDry = false, hasCloud = false;
                let problems = 0;
                const usedTyres = new Set();

                (r.laps || []).forEach(l => {
                    if (l.weather) {
                        const w = l.weather.toLowerCase();
                        if (w.includes('rain')) hasRain = true;
                        else { hasDry = true; if (w.includes('cloud')) hasCloud = true; }
                    }
                    if (l.tyres) usedTyres.add(l.tyres.replace(/\(W\)/g, '').trim());
                    if (l.events && l.events.some(e => e.event.includes('Car problem'))) problems++;
                });

                let wIcon = '☀️';
                if (hasRain && hasDry) wIcon = '🌦️';
                else if (hasRain) wIcon = '🌧️';
                else if (hasCloud) wIcon = '☁️';

                const finishPos = r.laps && r.laps.length > 0 ? r.laps[r.laps.length - 1].pos : '-';
                const problemStr = problems > 0 ? '🔧' : '';

                raceListHTML += `
                    <tr style="cursor:pointer;" onclick="const cb = this.querySelector('input'); if(event.target !== cb) cb.checked = !cb.checked;">
                        <td style="text-align:center;"><input type="checkbox" class="race-compare-checkbox" value="${uid}"></td>
                        <td>S${r.selSeasonNb} R${r.selRaceNb}</td>
                        <td>${r.trackName}</td>
                        <td style="color:var(--accent); font-weight:bold;">P${finishPos}</td>
                        <td>${driverName}</td>
                        <td style="text-align:center;">${wIcon}</td>
                        <td>${Array.from(usedTyres).join('/')}</td>
                        <td style="text-align:center;">${problemStr}</td>
                    </tr>
                `;
            });
            raceListHTML += '</tbody></table>';

            card.innerHTML = `
                <div class="card-header">
                    <h3>Select Races to Compare</h3>
                    <button onclick="returnToDashboard()" style="margin-top:10px; padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
                    <button onclick="generateComparison()" style="margin-top:10px; padding:5px 10px; cursor:pointer; background:#4caf50; color:white; border:none; border-radius:4px; margin-left:10px;">Compare Selected</button>
                </div>
                <div style="max-height: 500px; overflow-y: auto; padding: 10px;">
                    ${raceListHTML}
                </div>
            `;
            container.appendChild(card);
        }

        function generateComparison() {
            const checkboxes = document.querySelectorAll('.race-compare-checkbox:checked');
            if (checkboxes.length < 2) {
                alert("Please select at least 2 races to compare.");
                return;
            }
            
            const selectedUids = Array.from(checkboxes).map(cb => cb.value);
            const selectedRaces = allRaceData.filter(r => {
                const uid = `${r.selSeasonNb}-${r.selRaceNb}-${r.driver ? r.driver.id : 'u'}`;
                return selectedUids.includes(uid);
            });
            
            renderComparisonTable(selectedRaces);
        }

        function getColor(val, min, max, type) {
            if (min === max) return 'inherit';
            let ratio = (val - min) / (max - min);
            if (type === 'low') ratio = 1 - ratio;
            const hue = Math.round(ratio * 120);
            return `hsl(${hue}, 70%, 60%)`;
        }

        function renderComparisonTable(races) {
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'card';
            card.style.gridColumn = '1 / -1';
            
            const getVal = (obj, path) => {
                return path.split('.').reduce((acc, part) => acc && acc[part], obj);
            };

            const stats = races.map(r => {
                let totalLaps = r.laps.length - 1;
                let stintStats = [];
                let currentFuel = r.startFuel;
                let startLap = 1;
                
                const pits = r.pits || [];
                const allStops = [...pits, { lap: totalLaps, fuelLeft: (r.finishFuel/180)*100, tyreCond: r.finishTyres, refilledTo: 0, isFinish: true }];
                
                allStops.forEach((stop, idx) => {
                    const endLap = stop.lap;
                    const lapsInStint = endLap - startLap + 1;
                    
                    let fuelAtEnd = stop.isFinish ? r.finishFuel : (stop.fuelLeft / 100) * 180;
                    const fuelConsumed = currentFuel - fuelAtEnd;
                    const tyreConsumed = 100 - stop.tyreCond;
                    
                    if (lapsInStint > 0) {
                        stintStats.push({
                            laps: lapsInStint,
                            fuel: fuelConsumed,
                            tyre: tyreConsumed
                        });
                    }
                    
                    if (!stop.isFinish) {
                        currentFuel = stop.refilledTo;
                        startLap = endLap + 1;
                    }
                });
                
                let totalF = 0, totalT = 0, totalL = 0;
                stintStats.forEach(s => {
                    totalF += s.fuel;
                    totalT += s.tyre;
                    totalL += s.laps;
                });
                
                const avgFuel = totalL > 0 ? totalF / totalL : 0;
                const avgTyre = totalL > 0 ? totalT / totalL : 0;
                
                let tSum = 0, hSum = 0, wCnt = 0;
                let rainLaps = 0;
                (r.laps || []).forEach(l => {
                    if (l.temp) { tSum += l.temp; hSum += l.hum; wCnt++; }
                    if (l.weather && l.weather.toLowerCase().includes('rain')) rainLaps++;
                });
                
                return {
                    avgFuel: avgFuel,
                    avgTyre: avgTyre,
                    avgTemp: wCnt ? (tSum/wCnt) : null,
                    avgHum: wCnt ? (hSum/wCnt) : null,
                    rainLaps: rainLaps
                };
            });

            const rows = [
                { label: 'Track', path: 'trackName' },
                { label: 'Driver', path: 'driver.name' },
                { label: 'Group', path: 'group' },
                { label: 'Position', path: (r) => (r.laps && r.laps.length > 0) ? r.laps[r.laps.length-1].pos : null, format: v => `P${v}`, color: 'low' },
                { label: 'Avg Temp', val: (i) => stats[i].avgTemp, format: v => v !== null ? v.toFixed(1) + '°' : '-' },
                { label: 'Avg Hum', val: (i) => stats[i].avgHum, format: v => v !== null ? v.toFixed(1) + '%' : '-' },
                { label: 'Rain Laps', val: (i) => stats[i].rainLaps },
                { label: 'Avg Fuel/Lap', val: (i) => stats[i].avgFuel, format: v => v.toFixed(3) + ' L', color: 'low' },
                { label: 'Avg Tyre Wear/Lap', val: (i) => stats[i].avgTyre, format: v => v.toFixed(3) + '%', color: 'low' },
                { label: 'Tyre Supplier', path: 'tyreSupplier.name' },
                { label: 'Car Power', path: 'carPower', color: 'high' },
                { label: 'Car Handling', path: 'carHandl', color: 'high' },
                { label: 'Car Accel', path: 'carAccel', color: 'high' },
                { label: 'Driver OA', path: 'driver.OA', color: 'high' },
                { label: 'Concentration', path: 'driver.con', color: 'high' },
                { label: 'Talent', path: 'driver.tal', color: 'high' },
                { label: 'Aggressiveness', path: 'driver.agr', color: 'high' },
                { label: 'Experience', path: 'driver.exp', color: 'high' },
                { label: 'Tech Insight', path: 'driver.tei', color: 'high' },
                { label: 'Weight', path: 'driver.wei', color: 'low' }
            ];

            let tableHTML = '<table class="setup-table"><thead><tr><th>Metric</th>';
            races.forEach(r => { tableHTML += `<th>S${r.selSeasonNb} R${r.selRaceNb}<br>${r.trackName}</th>`; });
            tableHTML += '</tr></thead><tbody>';

            rows.forEach(row => {
                tableHTML += `<tr><td style="text-align:left; font-weight:bold;">${row.label}</td>`;
                
                // Extract values for coloring
                const values = races.map((r, idx) => {
                    let val = null;
                    if (row.path) {
                        if (typeof row.path === 'function') val = row.path(r);
                        else val = getVal(r, row.path);
                    } else if (row.val) {
                        val = row.val(idx);
                    }
                    if (row.color && typeof val === 'string') val = parseFloat(val);
                    return val;
                });

                let min = Infinity, max = -Infinity;
                if (row.color) {
                    values.forEach(v => {
                        if (v !== null && !isNaN(v)) {
                            if (v < min) min = v;
                            if (v > max) max = v;
                        }
                    });
                }

                races.forEach((r, idx) => {
                    let val = values[idx];
                    let displayVal = val;
                    
                    if (row.format) displayVal = row.format(val);
                    else if (val === null || val === undefined) displayVal = '-';
                    
                    let style = '';
                    if (row.color && val !== null && !isNaN(val) && min !== Infinity) {
                        const c = getColor(val, min, max, row.color);
                        style = `style="color:${c}; font-weight:bold;"`;
                    }
                    
                    tableHTML += `<td ${style}>${displayVal}</td>`;
                });
                tableHTML += '</tr>';
            });
            
            tableHTML += '</tbody></table>';

            card.innerHTML = `
                <div class="card-header">
                    <h3>Race Comparison</h3>
                    <button onclick="openComparisonTool()" style="margin-top:10px; padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Selection</button>
                </div>
                <div style="overflow-x:auto;">${tableHTML}</div>
            `;
            container.appendChild(card);
        }

        function openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                request.onupgradeneeded = (e) => {
                    e.target.result.createObjectStore(STORE_NAME);
                };
            });
        }

        async function saveToDB(data) {
            try {
                const db = await openDB();
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(data, 'currentData');
                logDebug('Data saved to browser storage.');
            } catch (e) {
                logDebug('Error saving data: ' + e.message);
            }
        }

        async function clearData() {
            if (!confirm("Are you sure you want to clear all saved data?")) return;
            try {
                const db = await openDB();
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).clear();
                allRaceData = [];
                document.getElementById('trackSelectorContainer').style.display = 'none';
                document.getElementById('cardsContainer').innerHTML = '';
                if (chartInstance) {
                    chartInstance.destroy();
                    chartInstance = null;
                }
                logDebug('Saved data cleared.');
            } catch (e) {
                logDebug('Error clearing data: ' + e.message);
            }
        }

        function logDebug(msg) {
            const el = document.getElementById('debugLog');
            if (!el) return;
            el.style.display = 'block';
            const time = new Date().toLocaleTimeString();
            const div = document.createElement('div');
            div.style.borderBottom = '1px solid #555';
            div.style.padding = '2px 0';
            div.innerText = `[${time}] ${msg}`;
            el.appendChild(div);
        }

        async function handleFiles(files) {
            if (files.length === 0) return;

            const debugEl = document.getElementById('debugLog');
            if (debugEl) {
                debugEl.innerHTML = '<h3>Debug Log <button onclick="document.getElementById(\'debugLog\').innerHTML=\'<h3>Debug Log</h3>\';return false;" style="float:right;font-size:0.8rem;cursor:pointer;background:#444;color:#fff;border:1px solid #666;padding:2px 5px;">Clear</button></h3>';
            }
            logDebug(`--- Starting processing of ${files.length} files ---`);

            // Check for pako availability for tar.gz files
            const hasGz = Array.from(files).some(f => f.name.toLowerCase().endsWith('.tar.gz') || f.name.toLowerCase().endsWith('.tgz'));
            if (hasGz && typeof pako === 'undefined' && typeof DecompressionStream === 'undefined') {
                alert("Error: 'pako' library not loaded and Secure Context (HTTPS) not detected.\nCannot decompress .tar.gz files.");
                logDebug("Error: 'pako' library missing and no DecompressionStream.");
            }
            
            const hasZip = Array.from(files).some(f => f.name.toLowerCase().endsWith('.zip'));
            if (hasZip && typeof JSZip === 'undefined') {
                alert("Error: 'JSZip' library not loaded.\nCannot extract .zip files.");
                logDebug("Error: 'JSZip' library missing.");
            }

            const raceData = [];
            // Reset global data on new upload
            allRaceData = [];

            const processFileContent = (fname, content) => {
                try {
                    logDebug(`Parsing content: ${fname}`);
                    let textContent = content;
                    // Handle Uint8Array from untar
                    if (typeof content !== 'string') {
                        const name = fname.toLowerCase();
                        if (name.endsWith('.json') || name.endsWith('.html') || name.endsWith('.htm')) {
                            textContent = new TextDecoder().decode(content);
                        } else {
                            logDebug(`Skipping non-text file in archive: ${fname}`);
                            return; // Skip binary/other files
                        }
                    }

                    let json;
                    if (fname.toLowerCase().endsWith('.html') || fname.toLowerCase().endsWith('.htm')) {
                        json = parseHTML(textContent);
                    } else if (fname.toLowerCase().endsWith('.json')) {
                        json = JSON.parse(textContent);
                    }
                    if (json) {
                        raceData.push(json);
                        logDebug(`Success: S${json.selSeasonNb} R${json.selRaceNb} ${json.trackName}`);
                    }
                } catch (err) {
                    console.error("Error parsing file:", fname, err);
                    logDebug(`Error parsing ${fname}: ${err.message}`);
                }
            };

            const readFile = (file) => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    const fname = file.name.toLowerCase();
                    if (fname.endsWith('.tar.gz') || fname.endsWith('.tgz') || fname.endsWith('.zip') || fname.endsWith('.tar')) {
                        reader.readAsArrayBuffer(file);
                    } else {
                        reader.readAsText(file);
                    }
                });
            };

            const untar = (buffer) => {
                const files = [];
                let offset = 0;
                const view = new DataView(buffer);
                const decoder = new TextDecoder();

                logDebug(`Untar: Buffer size ${buffer.byteLength} bytes.`);
                
                if (buffer.byteLength >= 2) {
                    const magic = view.getUint16(0, false);
                    if (magic === 0x1f8b) {
                        logDebug("Untar: Warning - Buffer starts with 0x1F8B (GZIP magic). Decompression likely failed or was skipped.");
                    }
                }

                while (offset + 512 <= buffer.byteLength) {
                    if (view.getUint32(offset, true) === 0) {
                        offset += 512;
                        continue;
                    }

                    const nameBytes = new Uint8Array(buffer, offset, 100);
                    let nameEnd = 0;
                    while (nameEnd < 100 && nameBytes[nameEnd] !== 0) nameEnd++;
                    const name = decoder.decode(nameBytes.subarray(0, nameEnd)).trim();

                    const sizeBytes = new Uint8Array(buffer, offset + 124, 12);
                    const sizeStr = decoder.decode(sizeBytes).replace(/\u0000/g, '').trim();
                    const size = parseInt(sizeStr, 8);
                    
                    if (isNaN(size)) {
                        logDebug(`Untar: Invalid size at offset ${offset} for "${name}"`);
                        offset += 512;
                        continue;
                    }
                    
                    if (offset === 0) {
                        logDebug(`Untar: First block - Name: "${name}", Size: ${size}, Type: "${String.fromCharCode(view.getUint8(offset + 156))}"`);
                    }

                    const typeFlag = String.fromCharCode(view.getUint8(offset + 156));
                    const contentOffset = offset + 512;
                    const nextOffset = contentOffset + Math.ceil(size / 512) * 512;

                    if (typeFlag === '0' || typeFlag === '\0' || typeFlag === ' ') {
                        if (name) {
                            const content = new Uint8Array(buffer, contentOffset, size);
                            files.push({ name, content });
                            // logDebug(`Untar: Found ${name} (${size} bytes)`);
                        }
                    } else {
                        logDebug(`Untar: Skipping ${name} (type '${typeFlag}')`);
                    }

                    offset = nextOffset;
                }
                return files;
            };

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file.size === 0) continue;
                logDebug(`Reading file: ${file.name} (${file.size} bytes)`);
                const fname = file.name.toLowerCase();

                try {
                    if (fname.endsWith('.tar.gz') || fname.endsWith('.tgz')) {
                        try {
                            const arrayBuffer = await readFile(file);
                            let output;
                            let decompressed = false;

                            // Try pako first for better compatibility (works in non-secure contexts)
                            if (typeof pako !== 'undefined') {
                                try {
                                    const u8 = pako.ungzip(new Uint8Array(arrayBuffer));
                                    output = new Uint8Array(u8).buffer;
                                    decompressed = true;
                                    logDebug(`Decompressed ${file.name} using pako. Size: ${output.byteLength}`);
                                } catch (err) {
                                    logDebug(`Pako decompression failed: ${err.message}`);
                                }
                            } else {
                                logDebug("Pako library not found. Trying native DecompressionStream.");
                            }

                            if (!decompressed && typeof DecompressionStream !== 'undefined') {
                                try {
                                    const ds = new DecompressionStream('gzip');
                                    const writer = ds.writable.getWriter();
                                    await writer.write(arrayBuffer);
                                    await writer.close();
                                    output = await new Response(ds.readable).arrayBuffer();
                                    decompressed = true;
                                    logDebug(`Decompressed ${file.name} using native stream. Size: ${output.byteLength}`);
                                } catch (err) {
                                    logDebug(`Native decompression failed: ${err.message}`);
                                }
                            }

                            if (!decompressed) {
                                throw new Error("GZIP decompression failed. Please ensure pako library is loaded or use HTTPS.");
                            }

                            const extracted = untar(output);
                            extracted.forEach(f => processFileContent(f.name, f.content));
                            logDebug(`Extracted ${extracted.length} files from ${file.name}`);
                        } catch (e) {
                            alert(`Failed to process ${file.name}: ${e.message}`);
                            logDebug(`Error decompressing ${file.name}: ${e.message}`);
                        }
                    } else if (fname.endsWith('.tar')) {
                        const arrayBuffer = await readFile(file);
                        const extracted = untar(arrayBuffer);
                        extracted.forEach(f => processFileContent(f.name, f.content));
                        logDebug(`Extracted ${extracted.length} files from ${file.name}`);
                    } else if (fname.endsWith('.zip')) {
                        if (typeof JSZip !== 'undefined') {
                            try {
                                const arrayBuffer = await readFile(file);
                                const zip = await JSZip.loadAsync(arrayBuffer);
                                const entries = [];
                                zip.forEach((relativePath, zipEntry) => {
                                    if (!zipEntry.dir) entries.push(zipEntry);
                                });
                                for (const entry of entries) {
                                    const ename = entry.name.toLowerCase();
                                    if (ename.endsWith('.json') || ename.endsWith('.html') || ename.endsWith('.htm')) {
                                        const content = await entry.async("string");
                                        logDebug(`Zip: Extracting ${entry.name}`);
                                        processFileContent(entry.name, content);
                                    }
                                }
                                logDebug(`Extracted ${entries.length} files from ${file.name}`);
                            } catch (e) {
                                alert(`Failed to process zip ${file.name}: ${e.message}`);
                                logDebug(`Error reading zip ${file.name}: ${e.message}`);
                            }
                        }
                    } else if (fname.endsWith('.json') || fname.endsWith('.html') || fname.endsWith('.htm')) {
                        const content = await readFile(file);
                        processFileContent(file.name, content);
                    } else {
                        logDebug(`Skipping unsupported file: ${file.name}`);
                    }
                } catch (e) {
                    logDebug(`Error reading ${file.name}: ${e.message}`);
                }
            }

            // Deduplicate based on Season, Race ID and Driver ID
            const uniqueRaces = new Map();
            raceData.forEach(r => {
                const driverId = r.driver && r.driver.id ? r.driver.id : 'unknown';
                const key = `${r.selSeasonNb}-${r.selRaceNb}-${driverId}`;
                if (!uniqueRaces.has(key)) uniqueRaces.set(key, r);
            });
            allRaceData = Array.from(uniqueRaces.values());
            logDebug(`Processed ${allRaceData.length} unique races (found ${raceData.length} files).`);
            saveToDB(allRaceData);
            populateTrackSelector();
        }

        function populateTrackSelector() {
            const tracks = [...new Set(allRaceData.map(r => r.trackName))].sort();
            const select = document.getElementById('trackSelect');
            select.innerHTML = '<option value="all">All Tracks</option>';
            
            tracks.forEach(t => {
                const option = document.createElement('option');
                option.value = t;
                option.textContent = t;
                select.appendChild(option);
            });

            document.getElementById('trackSelectorContainer').style.display = 'flex';
            select.onchange = (e) => filterAndRender(e.target.value);

            // Auto-select first track if available
            if (tracks.length > 0) {
                select.value = tracks[0];
                filterAndRender(tracks[0]);
            } else {
                filterAndRender('all');
            }
        }

        function returnToDashboard() {
            const select = document.getElementById('trackSelect');
            if (select) {
                filterAndRender(select.value);
            } else {
                renderDashboard(allRaceData);
            }
        }

        function goToTrack(trackName) {
            const select = document.getElementById('trackSelect');
            if (select) {
                select.value = trackName;
                filterAndRender(trackName);
            }
        }

        function filterAndRender(trackName) {
            const filtered = trackName === 'all' 
                ? allRaceData 
                : allRaceData.filter(r => r.trackName === trackName);
            
            // Sort by Season then Race Number descending
            filtered.sort((a, b) => {
                if (a.selSeasonNb != b.selSeasonNb) return b.selSeasonNb - a.selSeasonNb;
                return b.selRaceNb - a.selRaceNb;
            });

            try {
                renderDashboard(filtered);
            } catch (e) {
                logDebug(`Global Error: ${e.message}`);
            }
        }

        function filterByForecast(uid, metric) {
            const refRace = allRaceData.find(r => {
                const dId = r.driver && r.driver.id ? r.driver.id : 'unknown';
                return `${r.selSeasonNb}-${r.selRaceNb}-${dId}` === uid;
            });
            
            if (!refRace || !refRace.weather) return;
            
            const w = refRace.weather;
            const filtered = allRaceData.filter(r => {
                if (!r.weather) return false;
                const rw = r.weather;
                
                if (metric === 'temp') {
                    return rw.raceQ1TempLow === w.raceQ1TempLow && rw.raceQ1TempHigh === w.raceQ1TempHigh &&
                           rw.raceQ2TempLow === w.raceQ2TempLow && rw.raceQ2TempHigh === w.raceQ2TempHigh &&
                           rw.raceQ3TempLow === w.raceQ3TempLow && rw.raceQ3TempHigh === w.raceQ3TempHigh &&
                           rw.raceQ4TempLow === w.raceQ4TempLow && rw.raceQ4TempHigh === w.raceQ4TempHigh;
                }
                if (metric === 'hum') {
                    return rw.raceQ1HumLow === w.raceQ1HumLow && rw.raceQ1HumHigh === w.raceQ1HumHigh &&
                           rw.raceQ2HumLow === w.raceQ2HumLow && rw.raceQ2HumHigh === w.raceQ2HumHigh &&
                           rw.raceQ3HumLow === w.raceQ3HumLow && rw.raceQ3HumHigh === w.raceQ3HumHigh &&
                           rw.raceQ4HumLow === w.raceQ4HumLow && rw.raceQ4HumHigh === w.raceQ4HumHigh;
                }
                if (metric === 'rain') {
                    return rw.raceQ1RainPLow === w.raceQ1RainPLow && rw.raceQ1RainPHigh === w.raceQ1RainPHigh &&
                           rw.raceQ2RainPLow === w.raceQ2RainPLow && rw.raceQ2RainPHigh === w.raceQ2RainPHigh &&
                           rw.raceQ3RainPLow === w.raceQ3RainPLow && rw.raceQ3RainPHigh === w.raceQ3RainPHigh &&
                           rw.raceQ4RainPLow === w.raceQ4RainPLow && rw.raceQ4RainPHigh === w.raceQ4RainPHigh;
                }
                return false;
            });
            
            logDebug(`Filtered by ${metric} forecast. Found ${filtered.length} matches.`);
            
            // Render filtered data directly
            renderForecastView(filtered, metric);
        }

        function filterByPart(partKey, level) {
            const filtered = allRaceData.filter(r => r[partKey] && r[partKey].lvl == level);
            logDebug(`Filtered by part ${partKey} level ${level}. Found ${filtered.length} matches.`);
            renderPartsAnalysis(filtered, partKey, level);
        }

        function renderAllPartsAnalysis(level) {
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'card';
            card.style.gridColumn = '1 / -1';
            
            // Generate Dropdown for Levels
            let variationSelectHTML = '';
            const levels = new Set();
            allRaceData.forEach(r => {
                Object.keys(partLabels).forEach(key => {
                    if (r[key]) levels.add(r[key].lvl);
                });
            });
            const sortedLevels = Array.from(levels).sort((a, b) => a - b);
            
            let options = `<option value="mix" ${level === 'mix' ? 'selected' : ''}>Mix (All Levels)</option>`;
            sortedLevels.forEach(lvl => {
                options += `<option value="${lvl}" ${level == lvl ? 'selected' : ''}>Level ${lvl}</option>`;
            });

            variationSelectHTML = `
                <div style="margin-top: 10px;">
                    <label style="font-weight:bold; margin-right:5px;">Select Level:</label>
                    <select onchange="renderAllPartsAnalysis(this.value)" style="padding: 5px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-color); color: var(--text-primary);">
                        ${options}
                    </select>
                </div>
            `;

            // Generate Rows
            let rows = '';
            let count = 0;
            
            const sortedRaces = [...allRaceData].sort((a, b) => {
                if (a.selSeasonNb != b.selSeasonNb) return b.selSeasonNb - a.selSeasonNb;
                return b.selRaceNb - a.selRaceNb;
            });

            sortedRaces.forEach(r => {
                const trackStr = `S${r.selSeasonNb} R${r.selRaceNb}: ${r.trackName}`;
                
                let hasRain = false;
                let hasDry = false;
                let hasCloud = false;
                let hasCarProblem = false;
                (r.laps || []).forEach(l => {
                    if (l.events && l.events.some(e => e.event.includes('Car problem'))) hasCarProblem = true;
                    if (!l.weather) return;
                    const w = l.weather.toLowerCase();
                    if (w.includes('rain')) hasRain = true;
                    else {
                        hasDry = true;
                        if (w.includes('cloud')) hasCloud = true;
                    }
                });
                let rWeather = 'Sunny';
                if (hasRain && hasDry) rWeather = 'Mix';
                else if (hasRain) rWeather = 'Rain';
                else if (hasCloud) rWeather = 'Cloudy';

                let wIcon = '☀️';
                if (rWeather === 'Mix') wIcon = '🌦️';
                else if (rWeather === 'Rain') wIcon = '🌧️';
                else if (rWeather === 'Cloudy') wIcon = '☁️';

                const driverName = r.driver ? r.driver.name.replace(/['"]/g, '') : 'Unknown';
                const risks = `St:${r.startRisk} Ov:${r.overtakeRisk} Df:${r.defendRisk||'-'} Cl:${r.clearDryRisk||'-'}/${r.clearWetRisk||'-'} Pr:${r.problemRisk||'-'}`;

                Object.keys(partLabels).forEach(key => {
                    const part = r[key];
                    if (!part) return;
                    if (level !== 'mix' && part.lvl != level) return;
                    
                    const wear = part.finishWear - part.startWear;
                    const partName = partLabels[key];
                    
                    const tooltipContent = `<div><strong>S${r.selSeasonNb}R${r.selRaceNb}</strong> ${wIcon} (${driverName})<br>Wear: ${wear}%<br><span style="color:#aaa">Risks: ${risks}</span></div>`;
                    const cellAttr = createTooltipAttr(tooltipContent);
                    
                    let wearDisplay = wear + '%';
                    if (hasCarProblem) wearDisplay += ' 🔧';
                    if (hasRain) wearDisplay += ' 🌧️';

                    rows += `
                        <tr style="background-color: var(--bg-color); color: var(--text-secondary); font-size: 0.85rem;">
                            <td class="clickable-label" style="font-weight:bold; text-align:left;" onclick="goToTrack('${r.trackName.replace(/'/g, "\\'")}')">${trackStr}</td>
                            <td>${partName}</td>
                            <td>${part.lvl}</td>
                            <td>${part.startWear}%</td>
                            <td>${part.finishWear}%</td>
                            <td ${cellAttr}>${wearDisplay}</td>
                        </tr>
                    `;
                    count++;
                });
            });

            card.innerHTML = `
                <div class="card-header">
                    <h3>All Parts Analysis</h3>
                    <div class="subtitle">Found ${count} matching parts</div>
                    ${variationSelectHTML}
                    <button onclick="returnToDashboard()" style="margin-top:10px; padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
                </div>
                <table class="setup-table">
                    <thead>
                        <tr>
                            <th onclick="sortTable(this.closest('table'), 0)">Track</th>
                            <th onclick="sortTable(this.closest('table'), 1)">Part</th>
                            <th onclick="sortTable(this.closest('table'), 2)">Level</th>
                            <th onclick="sortTable(this.closest('table'), 3)">Start Wear</th>
                            <th onclick="sortTable(this.closest('table'), 4)">Finish Wear</th>
                            <th onclick="sortTable(this.closest('table'), 5)">Used</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
            
            container.appendChild(card);
        }

        function renderTrackPartsMatrix() {
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';
            
            const backBtn = document.createElement('div');
            backBtn.style.gridColumn = '1 / -1';
            backBtn.style.textAlign = 'center';
            backBtn.style.marginBottom = '10px';
            backBtn.innerHTML = `<button onclick="returnToDashboard()" style="padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>`;
            container.appendChild(backBtn);

            // Group by track
            const tracks = {};
            allRaceData.forEach(r => {
                if (!tracks[r.trackName]) tracks[r.trackName] = [];
                tracks[r.trackName].push(r);
            });

            const sortedTrackNames = Object.keys(tracks).sort();

            sortedTrackNames.forEach(trackName => {
                const races = tracks[trackName];
                const partData = {};
                
                const weatherStates = new Set();
                races.forEach(r => {
                    let hasRain = false;
                    let hasDry = false;
                    let hasCloud = false;
                    (r.laps || []).forEach(l => {
                        if (!l.weather) return;
                        const w = l.weather.toLowerCase();
                        if (w.includes('rain')) hasRain = true;
                        else {
                            hasDry = true;
                            if (w.includes('cloud')) hasCloud = true;
                        }
                    });
                    if (hasRain && hasDry) weatherStates.add('Mix');
                    else if (hasRain) weatherStates.add('Rain');
                    else if (hasDry) {
                        if (hasCloud) weatherStates.add('Cloudy');
                        else weatherStates.add('Sunny');
                    }
                });
                
                let wIcons = '';
                if (weatherStates.has('Sunny')) wIcons += ' ☀️';
                if (weatherStates.has('Cloudy')) wIcons += ' ☁️';
                if (weatherStates.has('Mix')) wIcons += ' 🌦️';
                if (weatherStates.has('Rain')) wIcons += ' 🌧️';
                
                Object.keys(partLabels).forEach(key => {
                    partData[key] = {};
                    for (let i = 1; i <= 9; i++) partData[key][i] = { sum: 0, count: 0, weathers: new Set(), races: [], hasCarProblem: false };
                });

                races.forEach(r => {
                    let hasRain = false;
                    let hasDry = false;
                    let hasCloud = false;
                    let hasCarProblem = false;
                    (r.laps || []).forEach(l => {
                        if (l.events && l.events.some(e => e.event.includes('Car problem'))) hasCarProblem = true;
                        if (!l.weather) return;
                        const w = l.weather.toLowerCase();
                        if (w.includes('rain')) hasRain = true;
                        else {
                            hasDry = true;
                            if (w.includes('cloud')) hasCloud = true;
                        }
                    });
                    let rWeather = 'Sunny';
                    if (hasRain && hasDry) rWeather = 'Mix';
                    else if (hasRain) rWeather = 'Rain';
                    else if (hasCloud) rWeather = 'Cloudy';

                    let wIcon = '☀️';
                    if (rWeather === 'Mix') wIcon = '🌦️';
                    else if (rWeather === 'Rain') wIcon = '🌧️';
                    else if (rWeather === 'Cloudy') wIcon = '☁️';

                    Object.keys(partLabels).forEach(key => {
                        const part = r[key];
                        if (part && part.lvl >= 1 && part.lvl <= 9) {
                            const wear = part.finishWear - part.startWear;
                            partData[key][part.lvl].sum += wear;
                            partData[key][part.lvl].count++;
                            partData[key][part.lvl].weathers.add(rWeather);
                            if (hasCarProblem) partData[key][part.lvl].hasCarProblem = true;
                            partData[key][part.lvl].races.push({
                                id: `S${r.selSeasonNb}R${r.selRaceNb}`,
                                driver: r.driver ? r.driver.name.replace(/['"]/g, '') : 'Unknown',
                                wear: wear,
                                risks: `St:${r.startRisk} Ov:${r.overtakeRisk} Df:${r.defendRisk||'-'} Cl:${r.clearDryRisk||'-'}/${r.clearWetRisk||'-'} Pr:${r.problemRisk||'-'}`,
                                icon: wIcon
                            });
                        }
                    });
                });

                let rows = '';
                Object.keys(partLabels).forEach(key => {
                    let cells = '';
                    for (let i = 1; i <= 9; i++) {
                        const d = partData[key][i];
                        let val = '-';
                        let cellAttr = '';
                        if (d.count > 0) {
                            val = (d.sum / d.count).toFixed(1) + '%';
                            if (d.hasCarProblem) val += ' 🔧';
                            if (d.weathers.has('Mix') || (d.weathers.has('Rain') && (d.weathers.has('Sunny') || d.weathers.has('Cloudy')))) val += ' 🌦️';
                            else if (d.weathers.has('Rain')) val += ' 🌧️';
                            
                            const isMultiCol = d.races.length > 6;
                            const wrapperClass = isMultiCol ? 'tooltip-columns' : '';
                            const tooltipRows = d.races.map(r => 
                                `<div class="tooltip-item"><strong>${r.id}</strong> ${r.icon} (${r.driver}) - Wear: ${r.wear}%<br><span style="color:#aaa">Risks: ${r.risks}</span></div>`
                            ).join('');
                            cellAttr = createTooltipAttr(`<div class="${wrapperClass}">${tooltipRows}</div>`);
                        }
                        cells += `<td ${cellAttr}>${val}</td>`;
                    }
                    rows += `<tr style="background-color: var(--bg-color); color: var(--text-secondary); font-size: 0.85rem;"><td style="text-align:left; font-weight:bold;">${partLabels[key]}</td>${cells}</tr>`;
                });

                const card = document.createElement('div');
                card.className = 'card';
                card.style.gridColumn = '1 / -1';
                card.innerHTML = `
                    <div class="card-header"><h3><span class="clickable-label" onclick="goToTrack('${trackName.replace(/'/g, "\\'")}')">${trackName}</span> <span style="font-size:0.8em; font-weight:normal;">${wIcons}</span></h3></div>
                    <div style="overflow-x:auto;">
                        <table class="setup-table">
                            <thead><tr>
                                <th style="min-width:120px;" onclick="sortTable(this.closest('table'), 0)">${trackName}</th>
                                <th onclick="sortTable(this.closest('table'), 1)">Lvl 1</th>
                                <th onclick="sortTable(this.closest('table'), 2)">Lvl 2</th>
                                <th onclick="sortTable(this.closest('table'), 3)">Lvl 3</th>
                                <th onclick="sortTable(this.closest('table'), 4)">Lvl 4</th>
                                <th onclick="sortTable(this.closest('table'), 5)">Lvl 5</th>
                                <th onclick="sortTable(this.closest('table'), 6)">Lvl 6</th>
                                <th onclick="sortTable(this.closest('table'), 7)">Lvl 7</th>
                                <th onclick="sortTable(this.closest('table'), 8)">Lvl 8</th>
                                <th onclick="sortTable(this.closest('table'), 9)">Lvl 9</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        function renderPartsAnalysis(races, partKey, level) {
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'card';
            card.style.gridColumn = '1 / -1';
            
            const partName = partLabels[partKey] || partKey;

            // Generate Dropdown for Levels
            let variationSelectHTML = '';
            if (allRaceData.length > 0) {
                const levels = new Map();
                allRaceData.forEach(r => {
                    if (!r[partKey]) return;
                    const lvl = r[partKey].lvl;
                    if (!levels.has(lvl)) {
                        levels.set(lvl, { count: 0 });
                    }
                    levels.get(lvl).count++;
                });

                const sortedLevels = Array.from(levels.entries()).sort((a, b) => a[0] - b[0]);
                
                const tableRows = sortedLevels.map(([lvl, val]) => {
                    const isSelected = lvl == level;
                    const rowClass = isSelected ? 'active-row' : 'clickable-row';
                    return `<tr class="${rowClass}" onclick="filterByPart('${partKey}', ${lvl})"><td>Level ${lvl}</td><td>${val.count}</td></tr>`;
                }).join('');

                const btnText = `Current: Level ${level}`;

                variationSelectHTML = `
                    <div class="custom-dropdown">
                        <button onclick="const el = document.getElementById('varDropdown'); el.style.display = el.style.display === 'block' ? 'none' : 'block';" class="custom-dropdown-btn">
                            <span>${btnText}</span> <span>&#9662;</span>
                        </button>
                        <div id="varDropdown" class="custom-dropdown-content">
                            <table>
                                <thead><tr><th>Level</th><th>Count</th></tr></thead>
                                <tbody>${tableRows}</tbody>
                            </table>
                        </div>
                    </div>
                `;
            }

            const rows = races.map(r => {
                const part = r[partKey];
                const wear = part.finishWear - part.startWear;
                const trackStr = `S${r.selSeasonNb} R${r.selRaceNb}: ${r.trackName}`;
                
                let hasCarProblem = false;
                let hasRain = false;
                if (r.laps) {
                    hasCarProblem = r.laps.some(l => l.events && l.events.some(e => e.event.includes('Car problem')));
                    hasRain = r.laps.some(l => l.weather && l.weather.toLowerCase().includes('rain'));
                }
                let wearDisplay = wear + '%';
                if (hasCarProblem) wearDisplay += ' 🔧';
                if (hasRain) wearDisplay += ' 🌧️';

                return `
                    <tr style="background-color: var(--bg-color); color: var(--text-secondary); font-size: 0.85rem;">
                        <td class="clickable-label" style="font-weight:bold; text-align:left;" onclick="goToTrack('${r.trackName.replace(/'/g, "\\'")}')">${trackStr}</td>
                        <td>${part.startWear}%</td>
                        <td>${part.finishWear}%</td>
                        <td>${wearDisplay}</td>
                    </tr>
                `;
            }).join('');

            card.innerHTML = `
                <div class="card-header">
                    <h3>Parts Analysis: ${partName}</h3>
                    <div class="subtitle">Found ${races.length} matching races</div>
                    ${variationSelectHTML}
                    <button onclick="returnToDashboard()" style="margin-top:10px; padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
                </div>
                <table class="setup-table">
                    <thead>
                        <tr>
                            <th onclick="sortTable(this.closest('table'), 0)">Track</th>
                            <th onclick="sortTable(this.closest('table'), 1)">Start Wear</th>
                            <th onclick="sortTable(this.closest('table'), 2)">Finish Wear</th>
                            <th onclick="sortTable(this.closest('table'), 3)">Used</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
            
            container.appendChild(card);
        }

        function renderDashboard(data) {
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';

            data.forEach(race => {
                try {
                    container.appendChild(createRaceCard(race));
                } catch (e) {
                    logDebug(`Error creating card for S${race.selSeasonNb} R${race.selRaceNb}: ${e.message}`);
                }
            });

            try {
                renderChart(data);
            } catch (e) {
                logDebug(`Error rendering chart: ${e.message}`);
            }
        }

        // Helper functions
        const parseTime = (tStr) => {
            if (!tStr || tStr === '-') return 0;
            const parts = tStr.split(':');
            if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
            return parseFloat(tStr) || 0;
        };
        const fmtTime = (secs) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
        };
        const getWeatherIcon = (w) => {
            if (!w) return '';
            const l = w.toLowerCase();
            if (l.includes('rain')) return '🌧️';
            if (l.includes('dry')) return '🌤️';
            if (l.includes('sun')) return '☀️';
            if (l.includes('cloud')) return '☁️';
            return '';
        };
        const getWeatherColor = (w) => {
            if (!w) return 'transparent';
            const l = w.toLowerCase();
            if (l.includes('rain')) return '#1a3b5c';
            if (l.includes('dry')) return '#3a3b3c';
            if (l.includes('sun')) return '#4a4a2a';
            if (l.includes('cloud')) return '#3a3b3c';
            return 'transparent';
        };

        function renderForecastView(races, metric) {
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'card';
            card.style.gridColumn = '1 / -1';
            
            let label = 'Unknown';
            let unit = '';
            if (metric === 'temp') { label = 'Temp Forecast'; unit = '°'; }
            if (metric === 'hum') { label = 'Hum Forecast'; unit = '%'; }
            if (metric === 'rain') { label = 'Rain Prob'; unit = '%'; }

            // Generate Dropdown for Variations
            let variationSelectHTML = '';
            if (allRaceData.length > 0) {
                const getProfileKey = (r) => {
                    const w = r.weather;
                    if (!w) return '';
                    if (metric === 'temp') return `${w.raceQ1TempLow}-${w.raceQ1TempHigh}|${w.raceQ2TempLow}-${w.raceQ2TempHigh}|${w.raceQ3TempLow}-${w.raceQ3TempHigh}|${w.raceQ4TempLow}-${w.raceQ4TempHigh}`;
                    if (metric === 'hum') return `${w.raceQ1HumLow}-${w.raceQ1HumHigh}|${w.raceQ2HumLow}-${w.raceQ2HumHigh}|${w.raceQ3HumLow}-${w.raceQ3HumHigh}|${w.raceQ4HumLow}-${w.raceQ4HumHigh}`;
                    if (metric === 'rain') return `${w.raceQ1RainPLow}-${w.raceQ1RainPHigh}|${w.raceQ2RainPLow}-${w.raceQ2RainPHigh}|${w.raceQ3RainPLow}-${w.raceQ3RainPHigh}|${w.raceQ4RainPLow}-${w.raceQ4RainPHigh}`;
                    return '';
                };

                const profiles = new Map();
                allRaceData.forEach(r => {
                    if (!r.weather) return;
                    const key = getProfileKey(r);
                    if (!key) return;
                    if (!profiles.has(key)) {
                        const dId = r.driver && r.driver.id ? r.driver.id : 'unknown';
                        profiles.set(key, { count: 0, repUid: `${r.selSeasonNb}-${r.selRaceNb}-${dId}` });
                    }
                    profiles.get(key).count++;
                });

                const currentKey = races.length > 0 ? getProfileKey(races[0]) : '';
                const sortedProfiles = Array.from(profiles.entries()).sort((a, b) => b[1].count - a[1].count);
                
                const tableRows = sortedProfiles.map(([key, val]) => {
                    const parts = key.split('|');
                    const isSelected = key === currentKey;
                    const rowClass = isSelected ? 'active-row' : 'clickable-row';
                    const p = parts.map(s => s + unit);
                    return `<tr class="${rowClass}" onclick="filterByForecast('${val.repUid}', '${metric}')"><td>${p[0]}</td><td>${p[1]}</td><td>${p[2]}</td><td>${p[3]}</td><td>${val.count}</td></tr>`;
                }).join('');

                const curParts = currentKey ? currentKey.split('|').map(s => s + unit) : ['-','-','-','-'];
                const btnText = `Current: Q1: ${curParts[0]} | Q2: ${curParts[1]} | Q3: ${curParts[2]} | Q4: ${curParts[3]}`;

                variationSelectHTML = `
                    <div class="custom-dropdown">
                        <button onclick="const el = document.getElementById('varDropdown'); el.style.display = el.style.display === 'block' ? 'none' : 'block';" class="custom-dropdown-btn">
                            <span>${btnText}</span> <span>&#9662;</span>
                        </button>
                        <div id="varDropdown" class="custom-dropdown-content">
                            <table>
                                <thead><tr><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Count</th></tr></thead>
                                <tbody>${tableRows}</tbody>
                            </table>
                        </div>
                    </div>
                `;
            }

            if (races.length === 0) return;

            // Forecast Row (from first race, as they are filtered to be identical)
            const w = races[0].weather;
            const getR = (q) => {
                if (metric === 'temp') return `${w['raceQ'+q+'TempLow']}-${w['raceQ'+q+'TempHigh']}${unit}`;
                if (metric === 'hum') return `${w['raceQ'+q+'HumLow']}-${w['raceQ'+q+'HumHigh']}${unit}`;
                if (metric === 'rain') return `${w['raceQ'+q+'RainPLow']}-${w['raceQ'+q+'RainPHigh']}${unit}`;
                return '-';
            };

            const forecastRow = `
                <tr style="background-color: var(--card-bg); font-weight: bold; border-bottom: 2px solid var(--border);">
                    <td></td>
                    <td>${label}</td>
                    <td>${getR(1)}</td>
                    <td>${getR(2)}</td>
                    <td>${getR(3)}</td>
                    <td>${getR(4)}</td>
                </tr>
            `;

            const rows = races.map(r => {
                const totalLaps = r.laps.length - 1;
                const qSize = totalLaps / 4;
                const getAct = (qIdx) => {
                    const start = Math.floor((qIdx - 1) * qSize) + 1;
                    const end = (qIdx === 4) ? totalLaps : Math.floor(qIdx * qSize);
                    
                    if (metric === 'rain') {
                        let phases = [];
                        let curState = null;
                        let wCount = 0;
                        for(let i=start; i<=end; i++) {
                            if(r.laps[i]) {
                                const state = r.laps[i].weather.toLowerCase().includes('rain') ? 'Rain' : 'Dry';
                                if (state !== curState) {
                                    if (curState !== null) phases.push(`${getWeatherIcon(curState)}${wCount}`);
                                    curState = state;
                                    wCount = 0;
                                }
                                wCount++;
                            }
                        }
                        if (curState !== null) phases.push(`${getWeatherIcon(curState)}${wCount}`);
                        return phases.join(' ');
                    }

                    let sum = 0, cnt = 0;
                    let hasRain = false;
                    for(let i=start; i<=end; i++) {
                        if(r.laps[i]) {
                            if (metric === 'temp') sum += r.laps[i].temp;
                            if (metric === 'hum') sum += r.laps[i].hum;
                            if (r.laps[i].weather.toLowerCase().includes('rain')) hasRain = true;
                            cnt++;
                        }
                    }
                    let val = cnt ? (sum/cnt).toFixed(1) + unit : '-';
                    return val;
                };

                const trackStr = `S${r.selSeasonNb} R${r.selRaceNb}: ${r.trackName}`;
                
                return `
                    <tr style="background-color: var(--bg-color); color: var(--text-secondary); font-size: 0.85rem;">
                        <td class="clickable-label" style="font-weight:bold; text-align:left;" onclick="goToTrack('${r.trackName.replace(/'/g, "\\'")}')">${trackStr}</td>
                        <td style="text-align:right;">Actual</td>
                        <td>${getAct(1)}</td>
                        <td>${getAct(2)}</td>
                        <td>${getAct(3)}</td>
                        <td>${getAct(4)}</td>
                    </tr>
                `;
            }).join('');

            card.innerHTML = `
                <div class="card-header">
                    <h3>Forecast Analysis: ${label}</h3>
                    <div class="subtitle">Found ${races.length} matching races</div>
                    ${variationSelectHTML}
                    <button onclick="returnToDashboard()" style="margin-top:10px; padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
                </div>
                <table class="setup-table">
                    <thead>
                        <tr>
                            <th onclick="sortTable(this.closest('table'), 0)">Track</th>
                            <th onclick="sortTable(this.closest('table'), 1)">Metric</th>
                            <th onclick="sortTable(this.closest('table'), 2)">Q1</th>
                            <th onclick="sortTable(this.closest('table'), 3)">Q2</th>
                            <th onclick="sortTable(this.closest('table'), 4)">Q3</th>
                            <th onclick="sortTable(this.closest('table'), 5)">Q4</th>
                        </tr>
                        ${forecastRow}
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
            
            container.appendChild(card);
        }

        function createRaceCard(data) {
            const card = document.createElement('div');
            card.className = 'card';

            const finishPos = data.laps && data.laps.length ? data.laps[data.laps.length - 1].pos : '-';
            
            // Calculate stint stats
            let stintsHTML = '';
            if (data.startFuel != null && data.finishFuel != null && data.laps && data.laps.length > 0) {
                stintsHTML += `<div class="stat-row" style="background-color: var(--pit-bg);"><span class="stat-label" style="padding-left: 15px; color:var(--pit-text);">Start Fuel</span><span class="stat-val"; style="margin-right: 15px;">${Number(data.startFuel).toFixed(1)}L</span></div>`;
                let currentFuel = data.startFuel;
                let startLap = 1;
                let totalFuelUsed = 0;
                const totalLaps = data.laps.length - 1;

                const processStint = (endLap, fuelLeft, tyreLeft, stintIdx) => {
                    const fuelUsed = currentFuel - fuelLeft;
                    const lapsInStint = endLap - startLap + 1;
                    const avgFuelVal = lapsInStint > 0 ? (fuelUsed / lapsInStint) : 0;
                    const avgFuel = avgFuelVal.toFixed(2);
                    
                    const tyreUsed = 100 - tyreLeft;
                    const avgTyreVal = lapsInStint > 0 ? (tyreUsed / lapsInStint) : 0;
                    const avgTyre = avgTyreVal.toFixed(2);
                    
                    let tempSum = 0;
                    let humSum = 0;
                    let tempCount = 0;
                    let weatherList = [];
                    let lastWeather = null;
                    let hasRain = false;

                    for(let i = startLap; i <= endLap; i++) {
                        if(data.laps[i]) {
                            tempSum += data.laps[i].temp;
                            humSum += data.laps[i].hum;
                            
                            const w = data.laps[i].weather;
                            if (w.toLowerCase().includes('rain') && i < endLap) hasRain = true;

                            if (w !== lastWeather) {
                                weatherList.push(w);
                                lastWeather = w;
                            }
                            tempCount++;
                        }
                    }
                    const avgTemp = tempCount > 0 ? (tempSum / tempCount).toFixed(1) : '-';
                    const avgHum = tempCount > 0 ? (humSum / tempCount).toFixed(0) : '-';
                    const weatherDisplay = weatherList.join(' ➝ ');
                    
                    const rowStyle = hasRain ? 'background-color: #1a3b5c;' : '';
                    const headStyle = hasRain ? 'background-color: #1565c0;' : 'background-color: var(--stint-head-bg);';

                    const stintTyre = data.laps[startLap] ? data.laps[startLap].tyres : '-';
                    let criticalInfo = '-';
                    if (avgTyreVal > 0) {
                        const lapsToCritical = 82 / avgTyreVal;
                        const fuelToCritical = lapsToCritical * avgFuelVal;
                        criticalInfo = `${fuelToCritical.toFixed(1)}L (~${lapsToCritical.toFixed(1)} laps)`;
                    }

                    stintsHTML += `
                        <div class="stat-row" style="${headStyle} margin-top: 5px;"><span class="stat-label" style="font-weight:600; color:var(--text-primary); padding-left: 15px;">Stint ${stintIdx} (Laps ${startLap}-${endLap})</span>${hasRain ? '<span style="margin-right: 15px;">🌧️</span>' : ''}</div>
                        <div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px;">Fuel used</span><span class="stat-val"; style="margin-right: 15px;">${Number(fuelUsed).toFixed(1)}L (${avgFuel}/lap)</span></div>
                        <div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px;">Tyres Left</span><span class="stat-val"; style="margin-right: 15px;">${tyreLeft}% (Used ${avgTyre}%/lap)</span></div>
                        <div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px;">Tyre Type</span><span class="stat-val"; style="margin-right: 15px;">${stintTyre}</span></div>
                        <div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px;">Fuel to 18% Tyres</span><span class="stat-val"; style="margin-right: 15px;">${criticalInfo}</span></div>
                        <div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px;">Weather</span><span class="stat-val"; style="margin-right: 15px;">${weatherDisplay}</span></div>
                        <div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px;">Avg Temp / Hum</span><span class="stat-val"; style="margin-right: 15px;">${avgTemp}° / ${avgHum}%</span></div>
                    `;
                    
                    totalFuelUsed += fuelUsed;
                };

                const pits = data.pits || [];
                pits.forEach((pit, index) => {
                    const fuelLeftLiters = (pit.fuelLeft / 100) * 180;
                    processStint(pit.lap, fuelLeftLiters, pit.tyreCond, index + 1);

                    const fuelAdded = pit.refilledTo - fuelLeftLiters;
                    const pitTime = pit.pitTime ? ` (${pit.pitTime}s)` : '';
                    stintsHTML += `
                        <div class="stat-row" style="background-color: var(--pit-bg); flex-direction: column; padding: 4px 0;">
                            <div style="display:flex; justify-content:space-between; width:100%;">
                                <span class="stat-label" style="padding-left: 15px; color:var(--pit-text); font-weight:bold;">Pit Stop ${index + 1}</span>
                                <span class="stat-val" style="margin-right: 15px; color:var(--pit-text);">+${fuelAdded.toFixed(1)}L${pitTime}</span>
                            </div>
                            ${pit.reason ? `<div style="padding-left: 15px; font-size: 0.85em; color:var(--pit-text); font-style: italic;">${pit.reason}</div>` : ''}
                        </div>`;

                    currentFuel = pit.refilledTo;
                    startLap = pit.lap + 1;
                });

                // Last stint
                if (startLap <= totalLaps) {
                    processStint(totalLaps, data.finishFuel, data.finishTyres, pits.length + 1);
                }
                
                stintsHTML += `<div class="stat-row" style="border-top: 1px solid var(--border); margin-top:5px;"><span class="stat-label">Total Fuel Used</span><span class="stat-val">${totalFuelUsed.toFixed(1)}L</span></div>`;
            }
            
            // Weather Summary Table
            let weatherTableHTML = '';
            if (data.laps && data.laps.length > 1) {
                const weatherPhases = [];
                let curState = data.laps[1].weather.toLowerCase().includes('rain') ? 'Rain' : 'Dry';
                let segStart = 1;
                let segTime = 0;

                for (let i = 1; i < data.laps.length; i++) {
                    const lap = data.laps[i];
                    const t = parseTime(lap.lapTime);
                    const state = lap.weather.toLowerCase().includes('rain') ? 'Rain' : 'Dry';

                    if (state !== curState) {
                        weatherPhases.push({ type: curState, range: `${segStart}-${i-1}`, time: segTime });
                        curState = state;
                        segStart = i;
                        segTime = 0;
                    }
                    segTime += t;
                }
                
                if (curState) {
                    weatherPhases.push({ type: curState, range: `${segStart}-${data.laps.length - 1}`, time: segTime });
                }

                if (weatherPhases.length > 0) {
                    weatherTableHTML = `
                        <div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 10px; margin-bottom: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Weather Summary</span></div>
                        <table class="setup-table" style="margin-top:2px; margin-bottom:10px;">
                            <thead><tr>${weatherPhases.map(p => `<th style="background-color:${getWeatherColor(p.type)}">${getWeatherIcon(p.type)} ${p.type}</th>`).join('')}</tr></thead>
                            <tbody>
                                <tr>${weatherPhases.map(p => `<td style="background-color:${getWeatherColor(p.type)}">${p.range}</td>`).join('')}</tr>
                                <tr>${weatherPhases.map(p => `<td style="background-color:${getWeatherColor(p.type)}">${fmtTime(p.time)}</td>`).join('')}</tr>
                            </tbody>
                        </table>
                    `;
                }
            }

            // Forecast vs Actual Table
            let forecastTableHTML = '';
            if (data.weather && data.laps && data.laps.length > 0) {
                const w = data.weather;
                const totalLaps = data.laps.length - 1;
                const qSize = totalLaps / 4;
                
                const getQStats = (qIdx) => {
                    const start = Math.floor((qIdx - 1) * qSize) + 1;
                    const end = (qIdx === 4) ? totalLaps : Math.floor(qIdx * qSize);
                    
                    let tSum = 0, hSum = 0, cnt = 0;
                    let phases = [];
                    let curState = null;
                    let wCount = 0;
                    let hasRain = false;
                    
                    for(let i=start; i<=end; i++) {
                        if(data.laps[i]) {
                            tSum += data.laps[i].temp;
                            hSum += data.laps[i].hum;
                            cnt++;
                            
                            const state = data.laps[i].weather.toLowerCase().includes('rain') ? 'Rain' : 'Dry';
                            if (state === 'Rain') hasRain = true;

                            if (state !== curState) {
                                if (curState !== null) phases.push(`${getWeatherIcon(curState)}${wCount}`);
                                curState = state;
                                wCount = 0;
                            }
                            wCount++;
                        }
                    }
                    if (curState !== null) phases.push(`${getWeatherIcon(curState)}${wCount}`);

                    return {
                        temp: cnt ? (tSum/cnt).toFixed(1) : '-',
                        hum: cnt ? (hSum/cnt).toFixed(0) : '-',
                        weather: phases.join(' ')
                    };
                };

                const q1 = getQStats(1);
                const q2 = getQStats(2);
                const q3 = getQStats(3);
                const q4 = getQStats(4);

                const driverId = data.driver && data.driver.id ? data.driver.id : 'unknown';
                const uniqueId = `${data.selSeasonNb}-${data.selRaceNb}-${driverId}`;

                forecastTableHTML = `
                    <div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 10px; margin-bottom: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Forecast vs Actual</span></div>
                    <table class="setup-table" style="margin-top:2px; margin-bottom:10px;">
                        <thead>
                            <tr><th></th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th></tr>
                        </thead>
                        <tbody>
                            <tr><td class="clickable-label" style="text-align:left; font-weight:bold;" onclick="filterByForecast('${uniqueId}', 'temp')">Temp Forecast</td><td>${w.raceQ1TempLow}-${w.raceQ1TempHigh}°</td><td>${w.raceQ2TempLow}-${w.raceQ2TempHigh}°</td><td>${w.raceQ3TempLow}-${w.raceQ3TempHigh}°</td><td>${w.raceQ4TempLow}-${w.raceQ4TempHigh}°</td></tr>
                            <tr><td style="text-align:left; font-weight:bold;">Temp Actual</td><td>${q1.temp}°</td><td>${q2.temp}°</td><td>${q3.temp}°</td><td>${q4.temp}°</td></tr>
                            <tr><td class="clickable-label" style="text-align:left; font-weight:bold;" onclick="filterByForecast('${uniqueId}', 'hum')">Hum Forecast</td><td>${w.raceQ1HumLow}-${w.raceQ1HumHigh}%</td><td>${w.raceQ2HumLow}-${w.raceQ2HumHigh}%</td><td>${w.raceQ3HumLow}-${w.raceQ3HumHigh}%</td><td>${w.raceQ4HumLow}-${w.raceQ4HumHigh}%</td></tr>
                            <tr><td style="text-align:left; font-weight:bold;">Hum Actual</td><td>${q1.hum}%</td><td>${q2.hum}%</td><td>${q3.hum}%</td><td>${q4.hum}%</td></tr>
                            <tr><td class="clickable-label" style="text-align:left; font-weight:bold;" onclick="filterByForecast('${uniqueId}', 'rain')">Rain Prob</td><td>${w.raceQ1RainPLow}-${w.raceQ1RainPHigh}%</td><td>${w.raceQ2RainPLow}-${w.raceQ2RainPHigh}%</td><td>${w.raceQ3RainPLow}-${w.raceQ3RainPHigh}%</td><td>${w.raceQ4RainPLow}-${w.raceQ4RainPHigh}%</td></tr>
                            <tr><td style="text-align:left; font-weight:bold;">Weather Act</td><td>${q1.weather}</td><td>${q2.weather}</td><td>${q3.weather}</td><td>${q4.weather}</td></tr>
                        </tbody>
                    </table>
                `;
            }

            // Car Parts Wear Table
            let partsTableHTML = '';

            const driverName = data.driver ? data.driver.name.replace(/['"]/g, '') : 'Unknown Driver';

            // Driver Attributes Section
            let driverHTML = '';
            if (data.driver) {
                const d = data.driver;
                const dc = data.driverChanges || {};
                const attrs = [
                    { k: 'OA', l: 'Overall' }, { k: 'con', l: 'Concentration' }, { k: 'tal', l: 'Talent' },
                    { k: 'agr', l: 'Aggressiveness' }, { k: 'exp', l: 'Experience' }, { k: 'tei', l: 'Tech Insight' },
                    { k: 'sta', l: 'Stamina' }, { k: 'cha', l: 'Charisma' }, { k: 'mot', l: 'Motivation' },
                    { k: 'rep', l: 'Reputation' }, { k: 'wei', l: 'Weight' }
                ];
                const rows = attrs.map(a => {
                    const val = d[a.k] || '-';
                    let change = '';
                    if (dc[a.k] && dc[a.k] != 0) {
                        const cVal = parseInt(dc[a.k]);
                        const color = cVal > 0 ? '#4caf50' : '#f44336';
                        change = ` <span style="color:${color}; font-size:0.8em;">(${cVal > 0 ? '+' : ''}${cVal})</span>`;
                    }
                    return `<div class="stat-row"><span class="stat-label">${a.l}</span><span class="stat-val">${val}${change}</span></div>`;
                }).join('');
                driverHTML = `
                    <div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 10px; margin-bottom: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Driver Attributes</span></div>
                    ${rows}
                `;
            }

            // Car Character Section
            let carCharHTML = '';
            if (data.carPower !== undefined) {
                carCharHTML = `
                    <div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 10px; margin-bottom: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Car Character</span></div>
                    <div class="stat-row"><span class="stat-label">Power</span><span class="stat-val">${data.carPower}</span></div>
                    <div class="stat-row"><span class="stat-label">Handling</span><span class="stat-val">${data.carHandl}</span></div>
                    <div class="stat-row"><span class="stat-label">Acceleration</span><span class="stat-val">${data.carAccel}</span></div>
                    ${data.tyreSupplier ? `<div class="stat-row"><span class="stat-label">Tyre Supplier</span><span class="stat-val">${data.tyreSupplier.name}</span></div>` : ''}
                `;
            }

            // Driver Energy
            let energyHTML = '';
            if (data.q1Energy || data.q2Energy || data.raceEnergy) {
                energyHTML = `<div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 10px; margin-bottom: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Driver Energy</span></div>`;
                if (data.q1Energy) energyHTML += `<div class="stat-row"><span class="stat-label">Q1</span><span class="stat-val">${data.q1Energy.from}% ➝ ${data.q1Energy.to}%</span></div>`;
                if (data.q2Energy) energyHTML += `<div class="stat-row"><span class="stat-label">Q2</span><span class="stat-val">${data.q2Energy.from}% ➝ ${data.q2Energy.to}%</span></div>`;
                if (data.raceEnergy) energyHTML += `<div class="stat-row"><span class="stat-label">Race</span><span class="stat-val">${data.raceEnergy.from}% ➝ ${data.raceEnergy.to}%</span></div>`;
            }

            // Practice Laps
            let practiceHTML = '';
            if (data.practiceLaps && data.practiceLaps.length > 0) {
                const pRows = data.practiceLaps.map(p => `
                    <tr>
                        <td>${p.idx}</td>
                        <td>${p.lapTime}</td>
                        <td>${p.netTime}</td>
                        <td>${p.setFWing ? p.setFWing.value : '-'}</td>
                        <td>${p.setRWing ? p.setRWing.value : '-'}</td>
                        <td>${p.setEngine ? p.setEngine.value : '-'}</td>
                        <td>${p.setGear ? p.setGear.value : '-'}</td>
                        <td>${p.setSusp ? p.setSusp.value : '-'}</td>
                        <td>${p.setTyres}</td>
                    </tr>
                `).join('');
                practiceHTML = `
                    <div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 10px; margin-bottom: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Practice Laps</span></div>
                    <table class="setup-table" style="margin-top:2px; margin-bottom:10px;">
                        <thead><tr><th>#</th><th>Time</th><th>Net</th><th>FW</th><th>RW</th><th>Eng</th><th>Gea</th><th>Sus</th><th>Tyr</th></tr></thead>
                        <tbody>${pRows}</tbody>
                    </table>
                `;
            }

            if (data.chassis) {
                let hasRain = false;
                let hasDry = false;
                let hasCloud = false;
                (data.laps || []).forEach(l => {
                    if (!l.weather) return;
                    const w = l.weather.toLowerCase();
                    if (w.includes('rain')) hasRain = true;
                    else {
                        hasDry = true;
                        if (w.includes('cloud')) hasCloud = true;
                    }
                });
                let rWeather = 'Sunny';
                if (hasRain && hasDry) rWeather = 'Mix';
                else if (hasRain) rWeather = 'Rain';
                else if (hasCloud) rWeather = 'Cloudy';

                let wIcon = '☀️';
                if (rWeather === 'Mix') wIcon = '🌦️';
                else if (rWeather === 'Rain') wIcon = '🌧️';
                else if (rWeather === 'Cloudy') wIcon = '☁️';

                const risks = `St:${data.startRisk} Ov:${data.overtakeRisk} Df:${data.defendRisk||'-'} Cl:${data.clearDryRisk||'-'}/${data.clearWetRisk||'-'} Pr:${data.problemRisk||'-'}`;

                const rows = Object.keys(partLabels).map(key => {
                    const part = data[key];
                    if (!part) return '';
                    const wear = part.finishWear - part.startWear;
                    
                    const tooltipContent = `<div><strong>S${data.selSeasonNb}R${data.selRaceNb}</strong> ${wIcon} (${driverName})<br>Wear: ${wear}%<br><span style="color:#aaa">Risks: ${risks}</span></div>`;
                    const cellAttr = createTooltipAttr(tooltipContent);
                    
                    return `<tr><td class="clickable-label" style="text-align:left;" onclick="filterByPart('${key}', ${part.lvl})">${partLabels[key]}</td><td>${part.lvl}</td><td>${part.startWear}%</td><td>${part.finishWear}%</td><td ${cellAttr}>${wear}%</td></tr>`;
                }).join('');

                partsTableHTML = `
                    <div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 10px; margin-bottom: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Car Parts Wear</span></div>
                    <table class="setup-table" style="margin-top:2px; margin-bottom:10px;">
                        <thead><tr><th onclick="sortTable(this.closest('table'), 0)">Part</th><th onclick="sortTable(this.closest('table'), 1)">Lvl</th><th onclick="sortTable(this.closest('table'), 2)">Start</th><th onclick="sortTable(this.closest('table'), 3)">Finish</th><th onclick="sortTable(this.closest('table'), 4)">Used</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `;
            }

            // Overtaking Stats
            let overtakingHTML = '';
            if (data.otAttempts !== undefined) {
                 overtakingHTML = `
                    <div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 10px; margin-bottom: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Overtaking</span></div>
                    <div class="stat-row"><span class="stat-label">Initiated (Success/Total)</span><span class="stat-val">${data.overtakes} / ${data.otAttempts}</span></div>
                    <div class="stat-row"><span class="stat-label">Against (Lost/Total)</span><span class="stat-val">${data.overtakesOnYou} / ${data.otAttemptsOnYou}</span></div>
                 `;
            }

            // Financial Analysis
            let financeHTML = '';
            if (data.transactions && data.transactions.length > 0) {
                const rows = data.transactions.map(t => {
                    const color = t.amount >= 0 ? '#4caf50' : '#f44336';
                    return `<tr><td style="text-align:left;">${t.desc}</td><td style="color:${color}; text-align:right;">$${t.amount.toLocaleString()}</td></tr>`;
                }).join('');
                const totalColor = data.total >= 0 ? '#4caf50' : '#f44336';
                financeHTML = `
                    <div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 10px; margin-bottom: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Financial Analysis</span></div>
                    <table class="setup-table" style="margin-top:2px; margin-bottom:10px;">
                        <tbody>
                            ${rows}
                            <tr style="font-weight:bold; border-top: 2px solid var(--border);"><td style="text-align:left;">Total</td><td style="color:${totalColor}; text-align:right;">$${data.total.toLocaleString()}</td></tr>
                            <tr><td style="text-align:left;">Current Balance</td><td style="text-align:right;">$${(data.currentBalance || 0).toLocaleString()}</td></tr>
                        </tbody>
                    </table>
                `;
            }

            // Setup Table HTML
            const setupRows = (data.setupsUsed || []).map(s => `
                <tr>
                    <td>${s.session}</td>
                    <td>${s.setFWing}</td>
                    <td>${s.setRWing}</td>
                    <td>${s.setEng}</td>
                    <td>${s.setBra || '-'}</td>
                    <td>${s.setGear}</td>
                    <td>${s.setSusp}</td>
                    <td>${s.setTyres}</td>
                </tr>
            `).join('');

            card.innerHTML = `
                <div class="card-header">
                    <h3>S${data.selSeasonNb} R${data.selRaceNb}: <span class="clickable-label" onclick="goToTrack('${data.trackName.replace(/'/g, "\\'")}')">${data.trackName}</span></h3>
                    <div class="subtitle">${driverName} | Group: ${data.group}</div>
                </div>
                <div class="stat-row"><span class="stat-label">Qualifying 1</span><span class="stat-val">P${data.q1Pos} (${data.q1Time})</span></div>
                <div class="stat-row"><span class="stat-label">Qualifying 2</span><span class="stat-val">P${data.q2Pos} (${data.q2Time})</span></div>
                <div class="stat-row"><span class="stat-label">Finish Position</span><span class="stat-val">P${finishPos}</span></div>
                <div class="stat-row"><span class="stat-label">Pit Stops</span><span class="stat-val">${data.pits ? data.pits.length : 0}</span></div>
                ${stintsHTML}
                ${weatherTableHTML}
                <details class="driver-details">
                    <summary class="driver-summary">Forecast, Driver, Risks & Setup</summary>
                    <div class="driver-content">
                        ${forecastTableHTML}
                        ${driverHTML}
                        ${energyHTML}
                        ${carCharHTML}
                        <div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 10px; margin-bottom: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Risks</span></div>
                        ${data.q1Risk ? `<div class="stat-row"><span class="stat-label">Risk (Q1)</span><span class="stat-val">${data.q1Risk}</span></div>` : ''}
                        ${data.q2Risk ? `<div class="stat-row"><span class="stat-label">Risk (Q2)</span><span class="stat-val">${data.q2Risk}</span></div>` : ''}
                        <div class="stat-row"><span class="stat-label">Risk (Start)</span><span class="stat-val">${data.startRisk}</span></div>
                        <div class="stat-row"><span class="stat-label">Risk (Overtake/Defend)</span><span class="stat-val">${data.overtakeRisk} / ${data.defendRisk || '-'}</span></div>
                        <div class="stat-row"><span class="stat-label">Risk (Clear Dry/Wet)</span><span class="stat-val">${data.clearDryRisk || '-'} / ${data.clearWetRisk || '-'}</span></div>
                        <div class="stat-row"><span class="stat-label">Risk (Problem)</span><span class="stat-val">${data.problemRisk || '-'}</span></div>
                        ${overtakingHTML}
                        ${partsTableHTML}
                        ${financeHTML}
                        ${practiceHTML}
                        <table class="setup-table">
                            <thead><tr><th>Sess</th><th>FW</th><th>RW</th><th>Eng</th><th>Bra</th><th>Gea</th><th>Sus</th><th>Tyr</th></tr></thead>
                            <tbody>${setupRows}</tbody>
                        </table>
                    </div>
                </details>
            `;
            return card;
        }

        function drawChart(races) {
            const ctx = document.getElementById('posChart').getContext('2d');
            if (chartInstance) chartInstance.destroy();

            // Get colors from CSS
            const style = getComputedStyle(document.documentElement);
            const colorRain = style.getPropertyValue('--chart-rain').trim();
            const colorSun = style.getPropertyValue('--chart-sun').trim();
            const colorCloud = style.getPropertyValue('--chart-cloud').trim();
            const colorPit = style.getPropertyValue('--chart-pit').trim();

            // Create wrench icon for chart
            const wrenchIcon = document.createElement('canvas');
            wrenchIcon.width = 20;
            wrenchIcon.height = 20;
            const wCtx = wrenchIcon.getContext('2d');
            wCtx.font = '16px serif';
            wCtx.textAlign = 'center';
            wCtx.textBaseline = 'middle';
            wCtx.fillText('🔧', 10, 10);

            // Create finish flag icon for chart
            const finishFlagIcon = document.createElement('canvas');
            finishFlagIcon.width = 20;
            finishFlagIcon.height = 20;
            const fCtx = finishFlagIcon.getContext('2d');
            fCtx.font = '16px serif';
            fCtx.textAlign = 'center';
            fCtx.textBaseline = 'middle';
            fCtx.fillText('🏁', 10, 10);

            // Pre-calculate fuel and tyre data for tooltips
            races.forEach(race => {
                if (!race.laps || race.laps.length === 0 || race.startFuel == null) return;
                
                // Initialize lap 0
                if (race.laps[0]) {
                    race.laps[0].calcFuel = race.startFuel;
                    race.laps[0].calcFuelUsed = 0;
                    race.laps[0].calcTyre = 100;
                }

                const totalLaps = race.laps.length - 1;
                let currentStartLap = 0;
                let currentStartFuel = race.startFuel;
                let currentStartTyre = 100;
                
                const stops = (race.pits || []).map(p => ({
                    lap: p.lap,
                    endFuel: (p.fuelLeft / 100) * 180,
                    endTyre: p.tyreCond,
                    nextFuel: p.refilledTo
                }));
                
                stops.push({
                    lap: totalLaps,
                    endFuel: race.finishFuel,
                    endTyre: race.finishTyres,
                    nextFuel: null
                });
                
                stops.forEach(stop => {
                    const stintLaps = stop.lap - currentStartLap;
                    if (stintLaps > 0) {
                        const fuelCons = currentStartFuel - stop.endFuel;
                        const tyreWear = currentStartTyre - stop.endTyre;
                        const fuelPerLap = fuelCons / stintLaps;
                        const wearPerLap = tyreWear / stintLaps;
                        
                        for (let i = currentStartLap + 1; i <= stop.lap; i++) {
                            if (race.laps[i]) {
                                const lapsDriven = i - currentStartLap;
                                race.laps[i].calcFuel = currentStartFuel - (fuelPerLap * lapsDriven);
                                race.laps[i].calcFuelUsed = fuelPerLap * lapsDriven;
                                race.laps[i].calcTyre = currentStartTyre - (wearPerLap * lapsDriven);
                            }
                        }
                    }
                    currentStartLap = stop.lap;
                    currentStartFuel = stop.nextFuel;
                    currentStartTyre = 100;
                });
            });

            const pastelColors = [
                '#e8dff5', // Pastel 
                '#fce1e4', // Pastel 
                '#fcf4dd', // Pastel 
                '#ddedea', // Pastel 
                '#daeaf6', // Pastel 
                '#e2e2e2', // Pastel 
                '#fff1e6', // Pastel 
                '#cdb4db', // Pastel 
                '#d7e3fc'  // Pastel 
            ];

            const datasets = races.map((race, idx) => {
                const raceColor = pastelColors[idx % pastelColors.length];
                const pitLaps = new Set((race.pits || []).map(p => p.lap));
                
                const pointBackgroundColors = [];
                const pointBorderColors = [];
                const pointStyles = [];
                const pointRadii = [];

                (race.laps || []).forEach((lap, i) => {
                    const w = (lap.weather || '').toLowerCase();
                    let pColor = '#9e9e9e'; // Default grey
                    if (w.includes('rain')) pColor = colorRain;
                    else if (w.includes('sun')) pColor = colorSun;
                    else if (w.includes('cloud')) pColor = colorCloud;

                    const hasProblem = lap.events && lap.events.some(e => e.event.includes('Car problem'));
                    const isLast = i === race.laps.length - 1;

                    if (isLast) {
                        pointStyles.push(finishFlagIcon);
                        pointRadii.push(8);
                        pointBackgroundColors.push('transparent');
                        pointBorderColors.push('transparent');
                    } else if (hasProblem) {
                        pointStyles.push(wrenchIcon);
                        pointRadii.push(8);
                        pointBackgroundColors.push('transparent');
                        pointBorderColors.push('transparent');
                    } else if (pitLaps.has(lap.idx)) {
                        pointStyles.push('rectRot');
                        pointRadii.push(8);
                        pointBackgroundColors.push('#242526'); // Match card bg
                        pointBorderColors.push(colorPit);
                    } else {
                        pointStyles.push('circle');
                        pointRadii.push(4);
                        pointBackgroundColors.push(pColor);
                        pointBorderColors.push('#242526'); // Match card bg for halo effect
                    }
                });

                return {
                    label: `S${race.selSeasonNb} R${race.selRaceNb} ${race.trackName}`,
                    data: race.laps.map(l => l.pos),
                    borderColor: raceColor,
                    backgroundColor: 'transparent',
                    tension: 0.1,
                    pointBackgroundColor: pointBackgroundColors,
                    pointBorderColor: pointBorderColors,
                    pointStyle: pointStyles,
                    pointBorderWidth: 1,
                    pointRadius: pointRadii,
                    pointHoverRadius: pointRadii.map(r => r + 2)
                };
            });

            // Determine max laps for x-axis
            const maxLaps = races.length > 0 ? Math.max(...races.map(r => r.laps.length)) : 0;
            const labels = Array.from({length: maxLaps}, (_, i) => i);

            chartInstance = new Chart(ctx, {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: { reverse: true, title: { display: true, text: 'Position' }, min: 1 },
                        x: { title: { display: true, text: 'Lap' } }
                    },
                    plugins: {
                        title: { display: true, text: 'Race Position History' },
                        legend: { position: 'top' },
                        tooltip: {
                            position: 'nearest',
                            caretPadding: 20,
                            callbacks: {
                                afterLabel: function(context) {
                                    const race = races[context.datasetIndex];
                                    const lap = race.laps[context.dataIndex];
                                    if (!lap) return '';
                                    const lines = [`Tyres: ${lap.tyres}`];
                                    if (lap.calcTyre !== undefined) lines.push(`Tyres Left: ${lap.calcTyre.toFixed(0)}%`);
                                    if (lap.calcFuelUsed !== undefined) lines.push(`Fuel Used: ${lap.calcFuelUsed.toFixed(1)}L`);
                                    return lines;
                                }
                            }
                        }
                    }
                }
            });
        }

        // Auto-load from DB on startup
        window.addEventListener('DOMContentLoaded', async () => {
            try {
                const db = await openDB();
                const tx = db.transaction(STORE_NAME, 'readonly');
                const request = tx.objectStore(STORE_NAME).get('currentData');
                request.onsuccess = () => {
                    if (request.result) {
                        allRaceData = request.result;
                        logDebug(`Restored ${allRaceData.length} races from storage.`);
                        populateTrackSelector();
                    }
                };
            } catch (e) {
                // No data or error
            }
        });