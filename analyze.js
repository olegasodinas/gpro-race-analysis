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

        async function exportAllData() {
            if (allRaceData.length === 0) {
                alert("No race data to export.");
                return;
            }

            if (typeof JSZip === 'undefined') {
                alert("Error: JSZip library not loaded. Cannot create zip file.");
                logDebug("Error: JSZip library not found for export.");
                return;
            }

            logDebug(`Starting export of ${allRaceData.length} races...`);
            const zip = new JSZip();

            allRaceData.forEach(race => {
                const driverId = race.driver && race.driver.id ? race.driver.id : 'u';
                const filename = `RaceAnalysis_S${race.selSeasonNb}_R${race.selRaceNb}_D${race.trackName}.json`;
                zip.file(filename, JSON.stringify(race, null, 2));
            });

            try {
                const content = await zip.generateAsync({type:"blob"});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(content);
                a.download = "GPRO_Race_Analysis_Export.zip";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
                logDebug("Export complete. Zip file download initiated.");
            } catch (e) {
                logDebug(`Error generating zip file: ${e.message}`);
                alert(`Error creating zip file: ${e.message}`);
            }
        }

        async function loadPresavedTracks() {
            logDebug("Checking for presaved tracks in 'tracks/list.json'...");
            try {
                const listRes = await fetch('tracks/list.json');
                if (!listRes.ok) {
                    throw new Error("tracks/list.json not found.\nPlease create a 'tracks' folder with a 'list.json' file containing an array of filenames (e.g. [\"race1.json\"]).");
                }
                
                const files = await listRes.json();
                if (!Array.isArray(files)) throw new Error("list.json is not an array.");
                
                logDebug(`Found ${files.length} files in list. Loading...`);
                const newRaces = [];
                
                for (const f of files) {
                    try {
                        const r = await fetch(`tracks/${f}`);
                        if (!r.ok) { logDebug(`Failed to load ${f}`); continue; }
                        const txt = await r.text();
                        let json;
                        if (f.toLowerCase().endsWith('.json')) json = JSON.parse(txt);
                        else if (f.toLowerCase().match(/\.html?$/) || f.toLowerCase().endsWith('.mhtml')) json = parseHTML(txt);
                        
                        if (json) {
                            newRaces.push(json);
                            logDebug(`Loaded ${f}`);
                        }
                    } catch (e) {
                        logDebug(`Error parsing ${f}: ${e.message}`);
                    }
                }
                
                if (newRaces.length > 0) {
                    const uniqueRaces = new Map();
                    allRaceData.forEach(r => {
                        const dId = r.driver && r.driver.id ? r.driver.id : 'unknown';
                        uniqueRaces.set(`${r.selSeasonNb}-${r.selRaceNb}-${dId}`, r);
                    });
                    newRaces.forEach(r => {
                        const dId = r.driver && r.driver.id ? r.driver.id : 'unknown';
                        uniqueRaces.set(`${r.selSeasonNb}-${r.selRaceNb}-${dId}`, r);
                    });
                    allRaceData = Array.from(uniqueRaces.values());
                    await saveToDB(allRaceData);
                    populateTrackSelector();
                    logDebug(`Successfully loaded ${newRaces.length} presaved tracks.`);
                } else {
                    alert("No valid tracks loaded.");
                }
            } catch (e) {
                alert(e.message);
                logDebug(e.message);
            }
        }

        async function dismissCard(cardId) {
            const uidToRemove = cardId.substring(5);

            const indexToRemove = allRaceData.findIndex(r => {
                const uid = `${r.selSeasonNb}-${r.selRaceNb}-${r.driver && r.driver.id ? r.driver.id : 'u'}`;
                return uid === uidToRemove;
            });

            if (indexToRemove > -1) {
                const race = allRaceData[indexToRemove];
                if (confirm(`Are you sure you want to permanently delete the data for S${race.selSeasonNb} R${race.selRaceNb} - ${race.trackName}? This cannot be undone.`)) {
                    allRaceData.splice(indexToRemove, 1);
                    
                    await saveToDB(allRaceData);
                    
                    const card = document.getElementById(cardId);
                    if (card) {
                        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.95)';
                        setTimeout(() => {
                            card.remove();
                            populateTrackSelector();
                        }, 300);
                    }
                }
            }
        }

        let chartInstance = null;
        let allRaceData = [];
        const DB_NAME = 'GPROAnalysisDB';
        const STORE_NAME = 'raceData';
        
        let currentChartPage = 0;
        let racesPerChart = 4;
        let currentChartRaces = [];
        let isSimpleChartMode = false;
        let currentView = 'dashboard';

        function toggleChartMode() {
            isSimpleChartMode = !isSimpleChartMode;
            updateChartDisplay();
        }

        function changeRacesPerChart(delta) {
            if (racesPerChart + delta < 1) return;
            racesPerChart += delta;
            currentChartPage = 0;
            updateChartDisplay();
        }

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
            const totalPages = Math.ceil(currentChartRaces.length / racesPerChart);
            
            if (currentChartPage < 0) currentChartPage = 0;
            if (currentChartPage >= totalPages && totalPages > 0) currentChartPage = totalPages - 1;

            const start = currentChartPage * racesPerChart;
            const end = start + racesPerChart;
            const visibleRaces = currentChartRaces.slice(start, end);
            
            updateChartControls(totalPages);
            drawChart(visibleRaces);
        }

        function updateChartControls(totalPages) {
            let container = document.getElementById('chartControls');
            if (!container) {
                container = document.createElement('div');
                container.id = 'chartControls';
                const header = document.querySelector('.chart-header-controls');
                if (header) header.appendChild(container);
            }
            
            if (currentChartRaces.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'flex';
            container.style.gap = '15px';
            container.style.alignItems = 'center';
            
            container.innerHTML = `
                <div class="legend-item legend-separator">
                    <span style="margin-right:5px;">Races per chart: ${racesPerChart}</span>
                    <button onclick="changeRacesPerChart(-1)" class="chart-control-btn">-</button>
                    <button onclick="changeRacesPerChart(1)" class="chart-control-btn" style="margin-left:2px;">+</button>
                </div>
                <div class="legend-item legend-separator">
                    <button onclick="changeChartPage(-1)" ${currentChartPage === 0 ? 'disabled' : ''} class="chart-control-btn">&lt;</button>
                    <span style="margin:0 5px;">Page ${currentChartPage + 1} of ${totalPages || 1}</span>
                    <button onclick="changeChartPage(1)" ${currentChartPage >= totalPages - 1 ? 'disabled' : ''} class="chart-control-btn">&gt;</button>
                </div>
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

        function createTooltipAttr(content, extraStyle = '') {
            const safeTooltip = content.replace(/"/g, '&quot;').replace(/'/g, "\\'");
            return `onmouseenter="showTooltip(event, '${safeTooltip}')" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()" style="cursor:help; ${extraStyle}"`;
        }

        function openRainAnalysis() {
            currentView = 'rain';
            if (allRaceData.length === 0) return;
            const r = allRaceData[0];
            const dId = r.driver && r.driver.id ? r.driver.id : 'unknown';
            const uid = `${r.selSeasonNb}-${r.selRaceNb}-${dId}`;
            filterByForecast(uid, 'rain');
        }

        function openComparisonTool() {
            currentView = 'compare';
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';

            const template = document.getElementById('comparisonSelectorTemplate');
            const clone = template.content.cloneNode(true);
            
            clone.querySelector('.back-btn').onclick = returnToDashboard;
            clone.querySelector('.compare-btn').onclick = generateComparison;

            // Build Table
            const table = document.createElement('table');
            table.className = 'setup-table';
            table.style.textAlign = 'left';
            table.innerHTML = `
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
                <tbody></tbody>
            `;
            const tbody = table.querySelector('tbody');

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

                tbody.innerHTML += `
                    <tr style="cursor:pointer;" class="race-compare-row">
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

            clone.querySelector('.list-container').appendChild(table);
            container.appendChild(clone);

            // Add event listener for row clicks
            container.querySelectorAll('.race-compare-row').forEach(row => {
                row.addEventListener('click', (e) => {
                    const cb = row.querySelector('input');
                    if (e.target !== cb) cb.checked = !cb.checked;
                });
            });
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
            renderChart(selectedRaces);
        }

        function getColor(val, min, max, type) {
            if (min === max) return 'inherit';
            let ratio = (val - min) / (max - min);
            if (type === 'low') ratio = 1 - ratio;
            const hue = Math.round(ratio * 120);
            return `hsl(${hue}, 70%, 60%)`;
        }

        function getGroupColor(groupName) {
            if (!groupName) return 'inherit';
            const g = groupName.toLowerCase();
            if (g.includes('rookie')) return '#8bc34a';
            if (g.includes('amateur')) return '#ffca28';
            if (g.includes('pro')) return '#ff9800';
            if (g.includes('master')) return '#f44336';
            if (g.includes('elite')) return '#9c27b0';
            return 'inherit';
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
                        if (stop.refilledTo > 0 && stop.refilledTo > fuelAtEnd) {
                            currentFuel = stop.refilledTo;
                        } else {
                            currentFuel = fuelAtEnd;
                        }
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
                const usedTyres = new Set();
                (r.laps || []).forEach(l => {
                    if (l.temp) { tSum += l.temp; hSum += l.hum; wCnt++; }
                    if (l.weather && l.weather.toLowerCase().includes('rain')) rainLaps++;
                    if (l.tyres) usedTyres.add(l.tyres.replace(/\(W\)/g, '').trim());
                });
                
                return {
                    avgFuel: avgFuel,
                    avgTyre: avgTyre,
                    avgTemp: wCnt ? (tSum/wCnt) : null,
                    avgHum: wCnt ? (hSum/wCnt) : null,
                    rainLaps: rainLaps,
                    usedTyres: Array.from(usedTyres)
                };
            });

            const rows = [
                { label: 'Driver', path: 'driver.name' },
                { label: 'Group', path: 'group', isGroup: true },
                { label: 'Position', path: (r) => (r.laps && r.laps.length > 0) ? r.laps[r.laps.length-1].pos : null, format: v => `P${v}`, color: 'low' },
                { label: 'Tyres Used', val: (i) => stats[i].usedTyres, isTyres: true },
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
                    
                    if (row.isTyres && Array.isArray(val)) {
                        const supIcon = getTyreSupplierIconHtml(r.tyreSupplier ? r.tyreSupplier.name : '');
                        displayVal = supIcon + ' ' + val.map(t => getTyreIconHtml(t)).join(' ');
                    }

                    let style = '';
                    if (row.color && val !== null && !isNaN(val) && min !== Infinity) {
                        const c = getColor(val, min, max, row.color);
                        style = `style="color:${c}; font-weight:bold;"`;
                    }
                    
                    if (row.isGroup) {
                        const gColor = getGroupColor(val);
                        if (gColor !== 'inherit') style = `style="color:${gColor}; font-weight:bold;"`;
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
                document.getElementById('debugLog').innerHTML = '';
                logDebug('Saved data cleared.');
            } catch (e) {
                logDebug('Error clearing data: ' + e.message);
            }
        }

        function logDebug(msg) {
            const container = document.getElementById('debugLogContainer');
            if (!container) return;
            container.style.display = 'block';
            const el = document.getElementById('debugLog');
            if (!el) return;
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
                debugEl.innerHTML = '';
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

            const processFileContent = (fname, content) => {
                try {
                    logDebug(`Parsing content: ${fname}`);
                    let textContent = content;
                    // Handle Uint8Array from untar
                    if (typeof content !== 'string') {
                        const name = fname.toLowerCase();
                        if (name.endsWith('.json') || name.endsWith('.html') || name.endsWith('.htm') || name.endsWith('.mhtml')) {
                            textContent = new TextDecoder().decode(content);
                        } else {
                            logDebug(`Skipping non-text file in archive: ${fname}`);
                            return; // Skip binary/other files
                        }
                    }

                    let json;
                    if (fname.toLowerCase().endsWith('.html') || fname.toLowerCase().endsWith('.htm') || fname.toLowerCase().endsWith('.mhtml')) {
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
                                    if (ename.endsWith('.json') || ename.endsWith('.html') || ename.endsWith('.htm') || ename.endsWith('.mhtml')) {
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
                    } else if (fname.endsWith('.json') || fname.endsWith('.html') || fname.endsWith('.htm') || fname.endsWith('.mhtml')) {
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
            
            // Add existing races
            allRaceData.forEach(r => {
                const driverId = r.driver && r.driver.id ? r.driver.id : 'unknown';
                const key = `${r.selSeasonNb}-${r.selRaceNb}-${driverId}`;
                uniqueRaces.set(key, r);
            });

            // Add new races
            raceData.forEach(r => {
                const driverId = r.driver && r.driver.id ? r.driver.id : 'unknown';
                const key = `${r.selSeasonNb}-${r.selRaceNb}-${driverId}`;
                uniqueRaces.set(key, r);
            });
            allRaceData = Array.from(uniqueRaces.values());
            logDebug(`Processed ${allRaceData.length} unique races (found ${raceData.length} files).`);
            saveToDB(allRaceData);
            populateTrackSelector();
        }

        function populateTrackSelector(trackToSelect, preventRender) {
            const tracks = [...new Set(allRaceData.map(r => r.trackName))].sort();
            const select = document.getElementById('trackSelect');
            select.innerHTML = '<option value="all">All Tracks</option>';
            
            tracks.forEach(t => {
                const option = document.createElement('option');
                option.value = t;
                option.textContent = t;
                select.appendChild(option);
            });

            populateRaceSelector();

            document.getElementById('trackSelectorContainer').style.display = 'flex';
            select.onchange = (e) => filterAndRender(e.target.value);

            let trackToFilter = 'all';
            if (trackToSelect && tracks.includes(trackToSelect)) {
                select.value = trackToSelect;
                trackToFilter = trackToSelect;
            } else if (tracks.length > 0) {
                select.value = tracks[0];
                trackToFilter = tracks[0];
            }
            
            if (!preventRender) {
                filterAndRender(trackToFilter);
            }
        }

        function populateRaceSelector() {
            const container = document.getElementById('raceSelectorContainer');
            if (!container) return;
            
            const sortedRaces = [...allRaceData].sort((a, b) => {
                 if (a.selSeasonNb != b.selSeasonNb) return b.selSeasonNb - a.selSeasonNb;
                 return b.selRaceNb - a.selRaceNb;
            });
            
            let rows = '';
            sortedRaces.forEach(r => {
                const uid = `${r.selSeasonNb}-${r.selRaceNb}-${r.driver && r.driver.id ? r.driver.id : 'u'}`;
                const label = `S${r.selSeasonNb} R${r.selRaceNb} - ${r.trackName}`;
                rows += `
                    <div style="padding: 5px; border-bottom: 1px solid #444;">
                        <label style="cursor:pointer; display:flex; align-items:center;">
                            <input type="checkbox" class="race-filter-cb" value="${uid}" onchange="triggerRaceFilter()" style="margin-right:8px;">
                            ${label}
                        </label>
                    </div>
                `;
            });
            
            container.innerHTML = `
                 <div class="custom-dropdown">
                     <button onclick="const el = document.getElementById('raceFilterDropdown'); el.style.display = el.style.display === 'block' ? 'none' : 'block';" class="custom-dropdown-btn">
                         <span>Select Specific Races</span> <span>&#9662;</span>
                     </button>
                     <div id="raceFilterDropdown" class="custom-dropdown-content" style="max-height: 300px; overflow-y: auto; padding: 5px;">
                         <div style="padding: 5px; border-bottom: 1px solid #666; margin-bottom: 5px;">
                             <button onclick="clearRaceFilter()" style="width:100%; padding:4px; cursor:pointer;">Clear Selection</button>
                         </div>
                         ${rows}
                     </div>
                 </div>
            `;
        }

        function triggerRaceFilter() {
            const trackSelect = document.getElementById('trackSelect');
            const trackName = trackSelect ? trackSelect.value : 'all';
            filterAndRender(trackName);
        }

        function clearRaceFilter() {
            const cbs = document.querySelectorAll('.race-filter-cb');
            cbs.forEach(cb => cb.checked = false);
            triggerRaceFilter();
        }

        function returnToDashboard() {
            currentView = 'dashboard';
            const select = document.getElementById('trackSelect');
            if (select) {
                filterAndRender(select.value);
            } else {
                renderDashboard(allRaceData);
            }
        }

        function goToTrack(trackName) {
            currentView = 'dashboard';
            const select = document.getElementById('trackSelect');
            if (select) {
                select.value = trackName;
                filterAndRender(trackName);
            }
        }

        function openRaceFetcher() {
            currentView = 'fetcher';
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';

            const template = document.getElementById('raceFetcherTemplate');
            const clone = template.content.cloneNode(true);

            const savedToken = localStorage.getItem('gpro_api_token') || '';
            clone.querySelector('#fetcherToken').value = savedToken;
            
            clone.querySelector('.back-btn').onclick = returnToDashboard;
            clone.querySelector('#doFetchBtn').onclick = fetchRaceData;
            clone.querySelector('#doFetchListBtn').onclick = fetchAvailableRacesList;
            
            container.appendChild(clone);
        }

        async function fetchRaceData() {
            const token = document.getElementById('fetcherToken').value.trim();
            if (!token) { alert('Token required'); return; }
            localStorage.setItem('gpro_api_token', token);
            
            const season = document.getElementById('fetcherSeason').value.trim();
            const race = document.getElementById('fetcherRace').value.trim();
            const logEl = document.getElementById('fetcherLog');
            
            let url = 'https://gpro.net/gb/backend/api/v2/RaceAnalysis';
            if (season && race) {
                url += `?SR=${season},${race}`;
            }
            
            logEl.textContent = 'Fetching...';
            
            try {
                const res = await fetch(url, {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Accept': 'application/json'
                    }
                });
                
                if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
                
                const json = await res.json();
                
                // Deduplicate and Add
                const driverId = json.driver && json.driver.id ? json.driver.id : 'unknown';
                const key = `${json.selSeasonNb}-${json.selRaceNb}-${driverId}`;
                
                // Remove existing if any to update
                allRaceData = allRaceData.filter(r => {
                    const dId = r.driver && r.driver.id ? r.driver.id : 'unknown';
                    return `${r.selSeasonNb}-${r.selRaceNb}-${dId}` !== key;
                });
                
                allRaceData.push(json);
                
                await saveToDB(allRaceData);
                logEl.textContent = `Success! Fetched Season ${json.selSeasonNb} Race ${json.selRaceNb} (${json.trackName}).\nData saved. You can fetch another or go back to dashboard.`;
                
                // Show card and download button
                const resContainer = document.getElementById('fetcherResult');
                resContainer.innerHTML = '';
                
                resContainer.appendChild(createRaceCard(json));

                // Update selector in background so it's ready when returning
                populateTrackSelector(json.trackName, true);
                
            } catch (e) {
                logEl.textContent = 'Error: ' + e.message;
                console.error(e);
            }
        }

        function downloadJson(data) {
            const filename = `RaceAnalysis_S${data.selSeasonNb}_R${data.selRaceNb}.json`;
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        async function fetchAvailableRacesList() {
            const token = document.getElementById('fetcherToken').value.trim();
            if (!token) { alert('Token required'); return; }
            localStorage.setItem('gpro_api_token', token);
            
            const logEl = document.getElementById('fetcherLog');
            const resultEl = document.getElementById('fetcherResult');
            
            let url = 'https://gpro.net/gb/backend/api/v2/RaceAnalysis';
            
            logEl.textContent = 'Fetching available races list...';
            resultEl.innerHTML = '';
            
            try {
                const res = await fetch(url, {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Accept': 'application/json'
                    }
                });
                
                if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
                
                const json = await res.json();
                
                if (json.racesToSelect && json.racesToSelect.length > 0) {
                    logEl.textContent = `Found ${json.racesToSelect.length} available races.`;
                    
                    let tableHTML = `<table class="setup-table" style="text-align:left;">
                        <thead>
                            <tr><th>Season</th><th>Race</th><th>Track</th><th>Group</th><th></th></tr>
                        </thead>
                        <tbody>`;
                    
                    json.racesToSelect.forEach(race => {
                        tableHTML += `
                            <tr>
                                <td>${race.season}</td><td>${race.race}</td><td>${race.trackName}</td><td>${race.group}</td>
                                <td><button onclick="document.getElementById('fetcherSeason').value=${race.season}; document.getElementById('fetcherRace').value=${race.race}; fetchRaceData();" style="padding:2px 6px; cursor:pointer;">Fetch</button></td>
                            </tr>`;
                    });

                    tableHTML += '</tbody></table>';
                    resultEl.innerHTML = `<div style="max-height: 400px; overflow-y: auto;">${tableHTML}</div>`;
                } else {
                    logEl.textContent = 'No available races found in API response. This feature requires supporter status.';
                }
            } catch (e) {
                logEl.textContent = 'Error: ' + e.message;
                console.error(e);
            }
        }

        function filterAndRender(trackName) {
            const cbs = document.querySelectorAll('.race-filter-cb:checked');
            const selectedUids = Array.from(cbs).map(cb => cb.value);
            
            let filtered;
            if (selectedUids.length > 0) {
                filtered = allRaceData.filter(r => {
                    const uid = `${r.selSeasonNb}-${r.selRaceNb}-${r.driver && r.driver.id ? r.driver.id : 'u'}`;
                    return selectedUids.includes(uid);
                });
            } else {
                filtered = trackName === 'all' 
                    ? allRaceData 
                    : allRaceData.filter(r => r.trackName === trackName);
            }
            
            // Sort by Season then Race Number descending
            filtered.sort((a, b) => {
                if (a.selSeasonNb != b.selSeasonNb) return b.selSeasonNb - a.selSeasonNb;
                return b.selRaceNb - a.selRaceNb;
            });

            if (currentView === 'stint') {
                try {
                    renderChart(filtered);
                } catch (e) {
                    logDebug(`Error rendering chart: ${e.message}`);
                }
                openStintAnalysis();
                return;
            }

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
            searchForSimilarWeather(refRace.weather, metric);
        }

        function searchForSimilarWeather(w, metric) {
            if (!w) return;

            let filtered = allRaceData.filter(r => {
                if (!r.weather) return false;
                const rw = r.weather;
                const check = (a, b, tol) => Math.abs(a - b) <= tol;
                
                if (metric === 'temp') {
                    const tol = 2;
                    return check(rw.raceQ1TempLow, w.raceQ1TempLow, tol) && check(rw.raceQ1TempHigh, w.raceQ1TempHigh, tol) &&
                           check(rw.raceQ2TempLow, w.raceQ2TempLow, tol) && check(rw.raceQ2TempHigh, w.raceQ2TempHigh, tol) &&
                           check(rw.raceQ3TempLow, w.raceQ3TempLow, tol) && check(rw.raceQ3TempHigh, w.raceQ3TempHigh, tol) &&
                           check(rw.raceQ4TempLow, w.raceQ4TempLow, tol) && check(rw.raceQ4TempHigh, w.raceQ4TempHigh, tol);
                }
                if (metric === 'hum') {
                    const tol = 5;
                    return check(rw.raceQ1HumLow, w.raceQ1HumLow, tol) && check(rw.raceQ1HumHigh, w.raceQ1HumHigh, tol) &&
                           check(rw.raceQ2HumLow, w.raceQ2HumLow, tol) && check(rw.raceQ2HumHigh, w.raceQ2HumHigh, tol) &&
                           check(rw.raceQ3HumLow, w.raceQ3HumLow, tol) && check(rw.raceQ3HumHigh, w.raceQ3HumHigh, tol) &&
                           check(rw.raceQ4HumLow, w.raceQ4HumLow, tol) && check(rw.raceQ4HumHigh, w.raceQ4HumHigh, tol);
                }
                if (metric === 'rain') {
                    const tol = 10;
                    return check(rw.raceQ1RainPLow, w.raceQ1RainPLow, tol) && check(rw.raceQ1RainPHigh, w.raceQ1RainPHigh, tol) &&
                           check(rw.raceQ2RainPLow, w.raceQ2RainPLow, tol) && check(rw.raceQ2RainPHigh, w.raceQ2RainPHigh, tol) &&
                           check(rw.raceQ3RainPLow, w.raceQ3RainPLow, tol) && check(rw.raceQ3RainPHigh, w.raceQ3RainPHigh, tol) &&
                           check(rw.raceQ4RainPLow, w.raceQ4RainPLow, tol) && check(rw.raceQ4RainPHigh, w.raceQ4RainPHigh, tol);
                }
                return false;
            });
            
            logDebug(`Filtered by ${metric} forecast. Found ${filtered.length} matches.`);
            
            // Render filtered data directly
            if (filtered.length === 0) {
                logDebug(`No exact matches found for ${metric}. Searching for closest matches...`);
                
                const racesWithDiff = allRaceData
                    .filter(r => r.weather)
                    .map(r => {
                        let diff = 0;
                        const rw = r.weather;
                        for(let i=1; i<=4; i++) {
                            if (metric === 'temp') {
                                diff += Math.abs(rw[`raceQ${i}TempLow`] - w[`raceQ${i}TempLow`]);
                                diff += Math.abs(rw[`raceQ${i}TempHigh`] - w[`raceQ${i}TempHigh`]);
                            } else if (metric === 'hum') {
                                diff += Math.abs(rw[`raceQ${i}HumLow`] - w[`raceQ${i}HumLow`]);
                                diff += Math.abs(rw[`raceQ${i}HumHigh`] - w[`raceQ${i}HumHigh`]);
                            } else if (metric === 'rain') {
                                diff += Math.abs(rw[`raceQ${i}RainPLow`] - w[`raceQ${i}RainPLow`]);
                                diff += Math.abs(rw[`raceQ${i}RainPHigh`] - w[`raceQ${i}RainPHigh`]);
                            }
                        }
                        return { race: r, diff: diff };
                    });
                
                if (racesWithDiff.length === 0) {
                    alert(`No races found with weather data.`);
                    return;
                }

                racesWithDiff.sort((a, b) => a.diff - b.diff);
                
                // Take top 10
                filtered = racesWithDiff.slice(0, 10).map(item => item.race);
                
                alert(`No exact matches found. Showing top ${filtered.length} closest matches.`);
            }

            renderForecastView(filtered, metric, w);
        }

        function filterByPart(partKey, level) {
            const filtered = allRaceData.filter(r => r[partKey] && r[partKey].lvl == level);
            logDebug(`Filtered by part ${partKey} level ${level}. Found ${filtered.length} matches.`);
            renderPartsAnalysis(filtered, partKey, level);
        }

        function renderAllPartsAnalysis(level) {
            currentView = 'parts';
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';

            const template = document.getElementById('partsAnalysisTemplate');
            const clone = template.content.cloneNode(true);
            clone.querySelector('.back-btn').onclick = returnToDashboard;

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

            const selectDiv = document.createElement('div');
            selectDiv.style.marginTop = '10px';
            selectDiv.innerHTML = `
                <label style="font-weight:bold; margin-right:5px;">Select Level:</label>
                <select style="padding: 5px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-color); color: var(--text-primary);">
                    ${options}
                </select>
            `;
            selectDiv.querySelector('select').onchange = (e) => renderAllPartsAnalysis(e.target.value);
            clone.querySelector('.controls-container').appendChild(selectDiv);

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

            clone.querySelector('.subtitle').textContent = `Found ${count} matching parts`;
            clone.querySelector('tbody').innerHTML = rows;
            
            container.appendChild(clone);
        }

        function renderFuelTyreAnalysis(groupBy = 'track') {
            currentView = 'fuel_tyre';
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';
            
            // Header with controls
            const headerDiv = document.createElement('div');
            headerDiv.style.gridColumn = '1 / -1';
            headerDiv.className = 'card';
            headerDiv.innerHTML = `
                <div class="card-header">
                    <h3>Fuel & Tyre Analysis</h3>
                    <div class="subtitle">Analyze consumption and wear across different dimensions</div>
                    <div style="margin-top:10px;">
                        <label style="font-weight:bold; margin-right:5px;">Group By:</label>
                        <select id="ftGroupBy" style="padding: 5px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-color); color: var(--text-primary);">
                            <option value="track" ${groupBy === 'track' ? 'selected' : ''}>Track</option>
                            <option value="driver" ${groupBy === 'driver' ? 'selected' : ''}>Driver</option>
                            <option value="tyre" ${groupBy === 'tyre' ? 'selected' : ''}>Tyre Type</option>
                            <option value="season" ${groupBy === 'season' ? 'selected' : ''}>Season</option>
                            <option value="group" ${groupBy === 'group' ? 'selected' : ''}>Group</option>
                            <option value="car_type" ${groupBy === 'car_type' ? 'selected' : ''}>Car Type</option>
                            <option value="matrix" ${groupBy === 'matrix' ? 'selected' : ''}>Tyre vs Temp Matrix</option>
                            <option value="matrix_track_tyre" ${groupBy === 'matrix_track_tyre' ? 'selected' : ''}>Track+Tyre vs Temp Matrix</option>
                        </select>
                        <button onclick="returnToDashboard()" style="margin-left:10px; padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
                    </div>
                </div>
            `;
            container.appendChild(headerDiv);
            
            document.getElementById('ftGroupBy').onchange = (e) => renderFuelTyreAnalysis(e.target.value);

            // Collect all stints
            const allStints = [];
            
            allRaceData.forEach(r => {
                let currentFuel = r.startFuel;
                let startLap = 1;
                const totalLaps = r.laps.length - 1;
                const pits = r.pits || [];
                const allStops = [...pits, { lap: totalLaps, fuelLeft: (r.finishFuel/180)*100, tyreCond: r.finishTyres, refilledTo: 0, isFinish: true }];
                
                allStops.forEach((stop, idx) => {
                    const endLap = stop.lap;
                    const lapsInStint = endLap - startLap + 1;
                    if (lapsInStint <= 0) return;

                    let fuelAtEnd = stop.isFinish ? r.finishFuel : (stop.fuelLeft / 100) * 180;
                    const fuelUsed = currentFuel - fuelAtEnd;
                    const tyreUsed = 100 - stop.tyreCond;
                    
                    const avgFuel = (fuelUsed / lapsInStint);
                    const avgTyre = (tyreUsed / lapsInStint);

                    const tyreType = r.laps[startLap] ? r.laps[startLap].tyres : '-';
                    
                    // Avg Temp/Hum/Rain
                    let tSum = 0, hSum = 0, cnt = 0;
                    let hasRain = false;
                    let mistakeCount = 0;
                    let mistakeLoss = 0;
                    let accidentCount = 0;
                    const stintWeathers = new Set();

                    for(let i=startLap; i<=endLap; i++) {
                        if (r.laps[i]) {
                            tSum += r.laps[i].temp;
                            hSum += r.laps[i].hum;
                            cnt++;
                            const w = r.laps[i].weather.toLowerCase();
                            if (w.includes('rain')) { hasRain = true; stintWeathers.add('Rain'); }
                            else if (w.includes('cloud')) stintWeathers.add('Cloudy');
                            else if (w.includes('sun') || w.includes('clear')) stintWeathers.add('Sunny');
                        }
                        if (r.laps[i].events) {
                            r.laps[i].events.forEach(e => {
                                if (e.event) {
                                    const matches = [...e.event.matchAll(/mistake.*?\(\s*(\d+(?:\.\d+)?)\s*s?\s*\)/gi)];
                                    if (matches.length > 0) {
                                        matches.forEach(m => {
                                            mistakeCount++;
                                            mistakeLoss += parseFloat(m[1]);
                                        });
                                    } else if (e.event.toLowerCase().includes('mistake')) {
                                        mistakeCount++;
                                        mistakeLoss += calculateMistakeLoss(r, i, startLap, endLap, !stop.isFinish);
                                    }
                                    if (e.event.toLowerCase().includes('accident') || e.event.toLowerCase().includes('collision')) {
                                        accidentCount++;
                                    }
                                }
                            });
                        }
                    }
                    
                    const avgT = cnt ? (tSum/cnt) : null;
                    const avgH = cnt ? (hSum/cnt) : null;
                    
                    allStints.push({
                        race: r,
                        stintIdx: idx + 1,
                        laps: lapsInStint,
                        fuelUsed: fuelUsed,
                        tyreUsed: tyreUsed,
                        avgFuel: avgFuel,
                        avgTyre: avgTyre,
                        tyreType: tyreType,
                        avgT: avgT,
                        avgH: avgH,
                        hasRain: hasRain,
                        mistakeCount: mistakeCount,
                        mistakeLoss: mistakeLoss,
                        accidentCount: accidentCount,
                        stintWeathers: stintWeathers
                    });

                    if (!stop.isFinish) {
                        if (stop.refilledTo > 0 && stop.refilledTo > fuelAtEnd) {
                            currentFuel = stop.refilledTo;
                        } else {
                            currentFuel = fuelAtEnd;
                        }
                        startLap = endLap + 1;
                    }
                });
            });

            if (groupBy === 'matrix_track_tyre') {
                const tempStep = 5;
                let minT = 100, maxT = 0;
                allStints.forEach(s => {
                    if (s.avgT !== null) {
                        if (s.avgT < minT) minT = s.avgT;
                        if (s.avgT > maxT) maxT = s.avgT;
                    }
                });
                
                if (minT > maxT) { minT = 0; maxT = 50; }
                const startRange = Math.floor(minT / tempStep) * tempStep;
                const endRange = Math.ceil(maxT / tempStep) * tempStep;

                const trackData = {};

                allStints.forEach(s => {
                    if (s.avgT === null) return;
                    const tBucket = Math.floor(s.avgT / tempStep) * tempStep;
                    const trackName = s.race.trackName;
                    const tyreType = s.tyreType;
                    const supplier = s.race.tyreSupplier ? s.race.tyreSupplier.name : '';

                    if (!trackData[trackName]) trackData[trackName] = {};
                    if (!trackData[trackName][tyreType]) trackData[trackName][tyreType] = { supplier: supplier, buckets: {} };

                    const tyreData = trackData[trackName][tyreType];
                    if (!tyreData.buckets[tBucket]) tyreData.buckets[tBucket] = { fuelSum: 0, tyreSum: 0, minFuel: 999, maxFuel: 0, minTyre: 999, maxTyre: 0, count: 0, stints: [], accidentCount: 0, weatherStates: new Set() };

                    const cell = tyreData.buckets[tBucket];
                    cell.fuelSum += s.avgFuel;
                    cell.tyreSum += s.avgTyre;
                    if (s.avgFuel < cell.minFuel) cell.minFuel = s.avgFuel;
                    if (s.avgFuel > cell.maxFuel) cell.maxFuel = s.avgFuel;
                    if (s.avgTyre < cell.minTyre) cell.minTyre = s.avgTyre;
                    if (s.avgTyre > cell.maxTyre) cell.maxTyre = s.avgTyre;
                    cell.count++;
                    if (s.accidentCount > 0) cell.accidentCount += s.accidentCount;
                    s.stintWeathers.forEach(w => cell.weatherStates.add(w));
                    cell.stints.push(s);
                });

                const sortedTracks = Object.keys(trackData).sort();

                sortedTracks.forEach(trackName => {
                    const tyres = trackData[trackName];
                    const sortedTyres = Object.keys(tyres).sort((a, b) => {
                        const tyreOrder = { 'Extra Soft': 1, 'Soft': 2, 'Medium': 3, 'Hard': 4, 'Rain': 5 };
                        const o1 = tyreOrder[a] || 99;
                        const o2 = tyreOrder[b] || 99;
                        return o1 - o2;
                    });

                    let headerHTML = '<tr><th>Tyre</th>';
                    for (let t = startRange; t < endRange; t += tempStep) {
                        headerHTML += `<th>${t}° - ${t+tempStep}°</th>`;
                    }
                    headerHTML += '</tr>';

                    let rowsHTML = '';
                    sortedTyres.forEach(tyreType => {
                        const tData = tyres[tyreType];
                        let cells = '';
                        
                        for (let t = startRange; t < endRange; t += tempStep) {
                            const cell = tData.buckets[t];
                            let content = '-';
                            let cellAttr = '';
                            let cellStyle = 'vertical-align:middle;';
                            
                            if (cell && cell.count > 0) {
                                const fStr = cell.minFuel === cell.maxFuel ? cell.minFuel.toFixed(3) : `${cell.minFuel.toFixed(3)}-${cell.maxFuel.toFixed(3)}`;
                                const wStr = cell.minTyre === cell.maxTyre ? cell.minTyre.toFixed(3) : `${cell.minTyre.toFixed(3)}-${cell.maxTyre.toFixed(3)}`;
                                content = `<div>F: ${fStr}L</div><div>W: ${wStr}%</div><div style="font-size:0.7em; color:var(--text-secondary);">(${cell.count})</div>`;
                                if (cell.accidentCount > 0) content += '<div style="font-size:0.8em;">💥</div>';
                                
                                let wIcons = '';
                                if (cell.weatherStates.has('Rain')) wIcons += '🌧️';
                                if (cell.weatherStates.has('Sunny')) wIcons += '☀️';
                                if (cell.weatherStates.has('Cloudy')) wIcons += '☁️';
                                if (wIcons) content += `<div style="font-size:0.8em;">${wIcons}</div>`;

                                if (cell.weatherStates.has('Rain')) cellStyle += ' background-color: #1a3b5c;';
                                
                                const tooltipRows = cell.stints.map(s => {
                                    const r = s.race;
                                    const dName = r.driver ? r.driver.name.replace(/['"]/g, '') : 'Unknown';
                                    const groupName = r.group || r.groupName || '';
                                    const accIcon = s.accidentCount > 0 ? ' 💥' : '';
                                    return `<div class="tooltip-item"><strong>S${r.selSeasonNb}R${r.selRaceNb}</strong> ${dName}${accIcon}<br>${groupName}<br>F:${s.avgFuel.toFixed(3)} W:${s.avgTyre.toFixed(3)} T:${s.avgT.toFixed(1)}°</div>`;
                                }).join('');
                                
                                const isMultiCol = cell.count > 6;
                                const wrapperClass = isMultiCol ? 'tooltip-columns' : '';
                                cellAttr = createTooltipAttr(`<div class="${wrapperClass}">${tooltipRows}</div>`, cellStyle);
                                cells += `<td ${cellAttr}>${content}</td>`;
                            } else {
                                cells += `<td style="${cellStyle}">${content}</td>`;
                            }
                        }
                        
                        const supIcon = getTyreSupplierIconHtml(tData.supplier);
                        rowsHTML += `<tr style="background-color: var(--bg-color); color: var(--text-secondary); font-size: 0.85rem;">
                            <td style="text-align:left; font-weight:bold;">
                                <div style="font-weight:normal; font-size:0.9em;">${supIcon} ${getTyreIconHtml(tyreType)} ${tyreType}</div>
                            </td>
                            ${cells}
                        </tr>`;
                    });

                    const card = document.createElement('div');
                    card.className = 'card';
                    card.style.gridColumn = '1 / -1';
                    card.innerHTML = `
                        <div class="card-header"><h3>${trackName}</h3></div>
                        <div style="overflow-x:auto;">
                            <table class="setup-table">
                                <thead>${headerHTML}</thead>
                                <tbody>${rowsHTML}</tbody>
                            </table>
                        </div>
                    `;
                    container.appendChild(card);
                });
                return;
            }

            if (groupBy === 'matrix') {
                const tyreTypes = ['Extra Soft', 'Soft', 'Medium', 'Hard', 'Rain'];
                const tempStep = 5;
                const matrix = {}; 

                let minT = 100, maxT = 0;
                allStints.forEach(s => {
                    if (s.avgT !== null) {
                        if (s.avgT < minT) minT = s.avgT;
                        if (s.avgT > maxT) maxT = s.avgT;
                    }
                });
                
                if (minT > maxT) { minT = 0; maxT = 50; }
                const startRange = Math.floor(minT / tempStep) * tempStep;
                const endRange = Math.ceil(maxT / tempStep) * tempStep;

                for (let t = startRange; t < endRange; t += tempStep) {
                    matrix[t] = {};
                    tyreTypes.forEach(tyre => {
                        matrix[t][tyre] = { fuelSum: 0, tyreSum: 0, minFuel: 999, maxFuel: 0, minTyre: 999, maxTyre: 0, count: 0, stints: [], accidentCount: 0, weatherStates: new Set() };
                    });
                }

                allStints.forEach(s => {
                    if (s.avgT === null) return;
                    const tBucket = Math.floor(s.avgT / tempStep) * tempStep;
                    
                    let tType = 'Unknown';
                    const l = s.tyreType.toLowerCase();
                    if (l.includes('extra')) tType = 'Extra Soft';
                    else if (l.includes('soft')) tType = 'Soft';
                    else if (l.includes('medium')) tType = 'Medium';
                    else if (l.includes('hard')) tType = 'Hard';
                    else if (l.includes('rain')) tType = 'Rain';

                    if (matrix[tBucket] && matrix[tBucket][tType]) {
                        const cell = matrix[tBucket][tType];
                        cell.fuelSum += s.avgFuel;
                        cell.tyreSum += s.avgTyre;
                        if (s.avgFuel < cell.minFuel) cell.minFuel = s.avgFuel;
                        if (s.avgFuel > cell.maxFuel) cell.maxFuel = s.avgFuel;
                        if (s.avgTyre < cell.minTyre) cell.minTyre = s.avgTyre;
                        if (s.avgTyre > cell.maxTyre) cell.maxTyre = s.avgTyre;
                        cell.count++;
                        if (s.accidentCount > 0) cell.accidentCount += s.accidentCount;
                        s.stintWeathers.forEach(w => cell.weatherStates.add(w));
                        cell.stints.push(s);
                    }
                });

                let rows = '';
                for (let t = startRange; t < endRange; t += tempStep) {
                    let cells = '';
                    let hasDataInRow = false;
                    tyreTypes.forEach(tyre => {
                        const cell = matrix[t][tyre];
                        if (cell.count > 0) hasDataInRow = true;
                    });
                    
                    if (!hasDataInRow) continue;

                    tyreTypes.forEach(tyre => {
                        const cell = matrix[t][tyre];
                        let content = '-';
                        let cellAttr = '';
                        let cellStyle = 'vertical-align:middle;';
                        if (cell && cell.count > 0) {
                            const fStr = cell.minFuel === cell.maxFuel ? cell.minFuel.toFixed(3) : `${cell.minFuel.toFixed(3)}-${cell.maxFuel.toFixed(3)}`;
                            const wStr = cell.minTyre === cell.maxTyre ? cell.minTyre.toFixed(3) : `${cell.minTyre.toFixed(3)}-${cell.maxTyre.toFixed(3)}`;
                            content = `<div>Fuel: ${fStr}L</div><div>Wear: ${wStr}%</div><div style="font-size:0.7em; color:var(--text-secondary);">(${cell.count})</div>`;
                            if (cell.accidentCount > 0) content += '<div style="font-size:0.8em;">💥</div>';
                            
                            let wIcons = '';
                            if (cell.weatherStates.has('Rain')) wIcons += '🌧️';
                            if (cell.weatherStates.has('Sunny')) wIcons += '☀️';
                            if (cell.weatherStates.has('Cloudy')) wIcons += '☁️';
                            if (wIcons) content += `<div style="font-size:0.8em;">${wIcons}</div>`;

                            if (cell.weatherStates.has('Rain')) cellStyle += ' background-color: #1a3b5c;';
                            
                            const tooltipRows = cell.stints.map(s => {
                                const r = s.race;
                                const dName = r.driver ? r.driver.name.replace(/['"]/g, '') : 'Unknown';
                                const groupName = r.group || r.groupName || '';
                                const accIcon = s.accidentCount > 0 ? ' 💥' : '';
                                return `<div class="tooltip-item"><strong>S${r.selSeasonNb}R${r.selRaceNb}</strong> ${r.trackName}<br>${dName}${accIcon}<br>${groupName}<br>Fuel:${s.avgFuel.toFixed(3)} Wear:${s.avgTyre.toFixed(3)} T:${s.avgT.toFixed(1)}°</div>`;
                            }).join('');
                            
                            const isMultiCol = cell.count > 6;
                            const wrapperClass = isMultiCol ? 'tooltip-columns' : '';
                            cellAttr = createTooltipAttr(`<div class="${wrapperClass}">${tooltipRows}</div>`, cellStyle);
                            cells += `<td ${cellAttr}>${content}</td>`;
                        } else {
                            cells += `<td style="${cellStyle}">${content}</td>`;
                        }
                    });
                    rows += `<tr style="background-color: var(--bg-color); color: var(--text-secondary); font-size: 0.85rem;"><td style="font-weight:bold;">${t}° - ${t+tempStep}°</td>${cells}</tr>`;
                }

                const card = document.createElement('div');
                card.className = 'card';
                card.style.gridColumn = '1 / -1';
                card.innerHTML = `
                    <div class="card-header"><h3>Tyre vs Temperature Matrix</h3></div>
                    <div style="overflow-x:auto;">
                        <table class="setup-table">
                            <thead>
                                <tr>
                                    <th>Temp Range</th>
                                    ${tyreTypes.map(t => `<th>${getTyreIconHtml(t)} ${t}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                `;
                container.appendChild(card);
                return;
            }

            // Grouping
            const groups = {};
            if (groupBy === 'car_type') {
                groups['Power'] = [];
                groups['Handling'] = [];
                groups['Acceleration'] = [];
            }
            allStints.forEach(s => {
                if (groupBy === 'car_type') {
                    groups['Power'].push(s);
                    groups['Handling'].push(s);
                    groups['Acceleration'].push(s);
                    return;
                }

                let key = 'Unknown';
                if (groupBy === 'track') key = s.race.trackName;
                else if (groupBy === 'driver') key = s.race.driver ? s.race.driver.name.replace(/['"]/g, '') : 'Unknown';
                else if (groupBy === 'tyre') key = s.tyreType;
                else if (groupBy === 'season') key = 'Season ' + s.race.selSeasonNb;
                else if (groupBy === 'group') {
                    const g = (s.race.group || s.race.groupName || 'Unknown');
                    const gl = g.toLowerCase();
                    if (gl.includes('elite')) key = 'Elite';
                    else if (gl.includes('master')) key = 'Master';
                    else if (gl.includes('pro')) key = 'Pro';
                    else if (gl.includes('amateur')) key = 'Amateur';
                    else if (gl.includes('rookie')) key = 'Rookie';
                    else key = g;
                }
                
                if (!groups[key]) groups[key] = [];
                groups[key].push(s);
            });

            let sortedKeys = Object.keys(groups).sort();
            if (groupBy === 'group') {
                const getGroupOrder = (k) => {
                    const s = k.toLowerCase();
                    if (s.includes('rookie')) return 1;
                    if (s.includes('amateur')) return 2;
                    if (s.includes('pro')) return 3;
                    if (s.includes('master')) return 4;
                    if (s.includes('elite')) return 5;
                    return 99;
                };
                sortedKeys.sort((a, b) => {
                    const oa = getGroupOrder(a);
                    const ob = getGroupOrder(b);
                    if (oa !== ob) return oa - ob;
                    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
                });
            }
            
            if (sortedKeys.length === 0) {
                container.innerHTML += '<div style="grid-column: 1 / -1; text-align:center;">No race data available.</div>';
                return;
            }

            sortedKeys.forEach(groupKey => {
                const stints = groups[groupKey];
                // Sort stints
                stints.sort((a, b) => {
                     if (groupBy === 'car_type') {
                        let valA = 0, valB = 0;
                        if (groupKey === 'Power') { valA = a.race.carPower || 0; valB = b.race.carPower || 0; }
                        else if (groupKey === 'Handling') { valA = a.race.carHandl || 0; valB = b.race.carHandl || 0; }
                        else { valA = a.race.carAccel || 0; valB = b.race.carAccel || 0; }
                        if (valA !== valB) return valB - valA;
                     }
                     if (a.race.selSeasonNb != b.race.selSeasonNb) return b.race.selSeasonNb - a.race.selSeasonNb;
                     if (a.race.selRaceNb != b.race.selRaceNb) return b.race.selRaceNb - a.race.selRaceNb;
                     return a.stintIdx - b.stintIdx;
                });

                let rows = '';
                if (stints.length === 0) {
                    rows = `<tr><td colspan="11" style="text-align:center; padding:15px; color:var(--text-secondary); font-style:italic;">No races found.</td></tr>`;
                } else {
                    stints.forEach(s => {
                    const r = s.race;
                    const driverName = r.driver ? r.driver.name.replace(/['"]/g, '') : 'Unknown';
                    const raceId = `S${r.selSeasonNb} R${r.selRaceNb}`;
                    const trackName = r.trackName;
                    const groupName = r.group || r.groupName || '-';
                    
                    const supIcon = getTyreSupplierIconHtml(r.tyreSupplier ? r.tyreSupplier.name : '');
                    const weatherIcon = s.hasRain ? '🌧️' : '☀️';
                    
                    let to18Info = '-';
                    if (s.avgTyre > 0) {
                         const lapsTo18 = 82 / s.avgTyre;
                         const fuelNeeded = lapsTo18 * s.avgFuel;
                         to18Info = `${fuelNeeded.toFixed(1)}L (${lapsTo18.toFixed(1)} laps)`;
                    }

                    let mistakeStr = '-';
                    if (s.mistakeCount > 0) {
                        mistakeStr = `${s.mistakeCount}`;
                        if (s.mistakeLoss > 0) mistakeStr += ` (${s.mistakeLoss.toFixed(1)}s)`;
                    }
                    if (s.accidentCount > 0) {
                        if (mistakeStr === '-') mistakeStr = '';
                        else mistakeStr += ' ';
                        mistakeStr += '💥';
                    }

                    const isRainTyre = s.tyreType.toLowerCase().includes('rain');
                    const weatherMismatch = (isRainTyre && !s.hasRain) || (!isRainTyre && s.hasRain && s.tyreType !== '-');

                    let rowColor = 'var(--text-secondary)';
                    if (weatherMismatch) rowColor = '#ff5252';
                    else if (s.laps < 10) rowColor = 'gray';

                    let col1 = raceId;
                    let col2 = groupBy === 'driver' ? trackName : driverName;
                    if (groupBy === 'track') col2 = driverName;
                    if (groupBy === 'tyre') col2 = trackName;
                    if (groupBy === 'season') col2 = trackName;
                    if (groupBy === 'group') col2 = trackName;
                    if (groupBy === 'car_type') {
                        col2 = trackName;
                        let val = 0;
                        if (groupKey === 'Power') val = r.carPower || 0;
                        else if (groupKey === 'Handling') val = r.carHandl || 0;
                        else val = r.carAccel || 0;
                        const lower = Math.floor(val / 5) * 5;
                        col1 = `${lower}-${lower + 5}`;
                    }

                    rows += `
                        <tr style="background-color: var(--bg-color); color: ${rowColor}; font-size: 0.85rem;">
                            <td>${col1}</td>
                            <td class="clickable-label" onclick="goToTrack('${trackName.replace(/'/g, "\\'")}')">${col2}</td>
                            <td>${groupName}</td>
                            <td>${s.stintIdx}</td>
                            <td>${s.laps}</td>
                            <td>${supIcon}${getTyreIconHtml(s.tyreType)} ${s.tyreType}</td>
                            <td>${s.fuelUsed.toFixed(1)} (${s.avgFuel.toFixed(3)})</td>
                            <td>${s.tyreUsed.toFixed(1)}% (${s.avgTyre.toFixed(3)}%)</td>
                            <td>${to18Info}</td>
                            <td style="${(s.mistakeCount > 0 || s.accidentCount > 0) ? 'color: #ff5252; font-weight:bold;' : ''}">${mistakeStr}</td>
                            <td>${s.avgT !== null ? s.avgT.toFixed(1) : '-'}° / ${s.avgH !== null ? s.avgH.toFixed(0) : '-'}% ${weatherIcon}</td>
                        </tr>
                    `;
                    });
                }

                const card = document.createElement('div');
                card.className = 'card';
                card.style.gridColumn = '1 / -1';
                
                let th1 = 'Race';
                if (groupBy === 'car_type') th1 = 'Level';

                let th2 = 'Driver';
                if (groupBy === 'driver' || groupBy === 'tyre' || groupBy === 'season' || groupBy === 'group' || groupBy === 'car_type') th2 = 'Track';

                card.innerHTML = `
                    <div class="card-header"><h3>${groupKey}</h3></div>
                    <div style="overflow-x:auto; max-height:400px;">
                        <table class="setup-table">
                            <thead><tr>
                                <th onclick="sortTable(this.closest('table'), 0)">${th1}</th>
                                <th onclick="sortTable(this.closest('table'), 1)">${th2}</th>
                                <th onclick="sortTable(this.closest('table'), 2)">Group</th>
                                <th onclick="sortTable(this.closest('table'), 3)">Stint</th>
                                <th onclick="sortTable(this.closest('table'), 4)">Laps</th>
                                <th onclick="sortTable(this.closest('table'), 5)">Tyre</th>
                                <th onclick="sortTable(this.closest('table'), 6)">Fuel (Avg)</th>
                                <th onclick="sortTable(this.closest('table'), 7)">Wear (Avg)</th>
                                <th onclick="sortTable(this.closest('table'), 8)">Tyres to 18%</th>
                                <th onclick="sortTable(this.closest('table'), 9)">Mistakes</th>
                                <th onclick="sortTable(this.closest('table'), 10)">Cond</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                `;
                container.appendChild(card);

            });
        }

        function renderTrackPartsMatrix() {
            currentView = 'matrix';
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
                    for (let i = 1; i <= 9; i++) partData[key][i] = { min: 100, max: 0, count: 0, weathers: new Set(), races: [], hasCarProblem: false };
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
                            if (wear < partData[key][part.lvl].min) partData[key][part.lvl].min = wear;
                            if (wear > partData[key][part.lvl].max) partData[key][part.lvl].max = wear;
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
                        let extraStyle = '';
                        if (d.count > 0) {
                            val = (d.min === d.max) ? `${d.min}%` : `${d.min}-${d.max}%`;
                            if (d.hasCarProblem) val += ' 🔧';
                            if (d.weathers.has('Mix') || (d.weathers.has('Rain') && (d.weathers.has('Sunny') || d.weathers.has('Cloudy')))) val += ' 🌦️';
                            else if (d.weathers.has('Rain')) val += ' 🌧️';
                            
                            if (d.weathers.has('Rain') || d.weathers.has('Mix')) {
                                extraStyle = 'background-color: #1a3b5c;';
                            }

                            const isMultiCol = d.races.length > 6;
                            const wrapperClass = isMultiCol ? 'tooltip-columns' : '';
                            const tooltipRows = d.races.map(r => 
                                `<div class="tooltip-item"><strong>${r.id}</strong> ${r.icon} (${r.driver}) - Wear: ${r.wear}%<br><span style="color:#aaa">Risks: ${r.risks}</span></div>`
                            ).join('');
                            cellAttr = createTooltipAttr(`<div class="${wrapperClass}">${tooltipRows}</div>`, extraStyle);
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
            currentView = 'parts_detail';
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
            currentView = 'dashboard';
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
        const getTyreSupplierIconHtml = (supplierName) => {
            if (!supplierName) return '';
            const s = supplierName.toLowerCase();
            let color = '#888';
            let letter = '?';
            let textColor = '#fff';
            let borderColor = '#fff';

            if (s.includes('bridgerock')) {
                color = '#ff0000'; // Red
                letter = 'B';
                textColor = '#fff';
            } else if (s.includes('michelini')) {
                color = '#007da6ff'; // Cyan
                letter = 'M';
                textColor = '#fff';
            } else if (s.includes('badyear')) {
                color = '#0000d4ff'; // Blue
                letter = 'B';
                textColor = '#e5ce03ff'; // Yellow
            } else if (s.includes('contimental')) {
                color = '#808080'; // Gray
                letter = 'C';
                textColor = '#ffa500'; // Orange
            } else if (s.includes('hancock')) {
                color = '#ffa500'; // Orange
                letter = 'H';
                textColor = '#fff';
            } else if (s.includes('yokomama')) {
                color = '#ff0000'; // Red
                letter = 'Y';
                textColor = '#000';
            } else if (s.includes('avon')) {
                color = '#808080'; // Gray
                letter = 'A';
                textColor = '#fff';
            } else if (s.includes('pipirelli')) {
                color = '#ffea00ff'; // Yellow
                letter = 'P';
                textColor = '#ff0000'; // Red
            } else if (s.includes('dunolop')) {
                color = '#ffe100ff'; // Yellow
                letter = 'D';
                textColor = '#000';
            }

            return `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background-color:${color};color:${textColor};border-radius:50%;font-weight:bold;font-size:11px;margin-right:2px;border:1px solid ${borderColor};" title="${supplierName}">${letter}</span>`;
        };
        const getTyreIconHtml = (tyreName) => {
            if (!tyreName || tyreName === '-') return '-';
            const t = tyreName.toLowerCase();
            let color = '#888';
            let letter = '?';
            let textColor = '#000';
            let borderColor = '#000';

            if (t.includes('extra')) {
                color = '#d500f9'; // Purple
                letter = 'X';
                textColor = '#fff';
            } else if (t.includes('soft')) {
                color = '#ff3333'; // Red
                letter = 'S';
            } else if (t.includes('medium')) {
                color = '#ffe04c'; // Yellow
                letter = 'M';
            } else if (t.includes('hard')) {
                color = '#ffffff'; // White
                letter = 'H';
            } else if (t.includes('rain')) {
                color = '#2962ff'; // Blue
                letter = 'W';
                textColor = '#fff';
            }

            return `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background-color:${color};color:${textColor};border-radius:50%;font-weight:bold;font-size:11px;margin-right:6px;border:1px solid ${borderColor};" title="${tyreName}">${letter}</span>`;
        };

        function calculatePitLoss(race, pitLapNumber) {
            const pitLapIndex = race.laps.findIndex(l => l.idx === pitLapNumber);
            if (pitLapIndex === -1 || pitLapIndex >= race.laps.length - 1) return null;

            const pitLap = race.laps[pitLapIndex];
            const outLap = race.laps[pitLapIndex + 1];
            
            if (!pitLap || !outLap) return null;

            // Check specific pit reason
            const pitEntry = (race.pits || []).find(p => p.lap === pitLapNumber);
            if (pitEntry && pitEntry.reason && pitEntry.reason.toLowerCase().includes('weather')) return null;

            // Check for events on pit/out laps (mistake, problem, accident)
            const hasIssue = (lap) => lap.events && lap.events.some(e => 
                e.event.toLowerCase().includes('mistake') || 
                e.event.toLowerCase().includes('problem') || 
                e.event.toLowerCase().includes('accident')
            );

            if (hasIssue(pitLap) || hasIssue(outLap)) return null;

            // Check for weather change (Rain <-> Dry)
            const isRain = (w) => w && w.toLowerCase().includes('rain');
            if (isRain(pitLap.weather) !== isRain(outLap.weather)) return null;

            // Check for tyre type change (Rain <-> Dry)
            const isRainTyre = (t) => t && t.toLowerCase().includes('rain');
            if (isRainTyre(pitLap.tyres) !== isRainTyre(outLap.tyres)) return null;

            let sum = 0;
            let count = 0;
            let i = pitLapIndex - 1;
            
            const pitLaps = new Set((race.pits || []).map(p => p.lap));

            while (i >= 0 && count < 4) {
                const lap = race.laps[i];
                
                // Skip lap 1 (standing start) and lap 0
                if (lap.idx <= 1) {
                    i--;
                    continue;
                }

                const isPit = pitLaps.has(lap.idx);
                const isOut = pitLaps.has(lap.idx - 1);

                if (!isPit && !isOut && !hasIssue(lap) && isRain(lap.weather) === isRain(pitLap.weather)) {
                    const t = parseTime(lap.lapTime);
                    if (t > 0) {
                        sum += t;
                        count++;
                    }
                }
                i--;
            }
            
            if (count === 0) return null;
            
            const avg = sum / count;
            const tPit = parseTime(pitLap.lapTime) - avg;
            const tOut = parseTime(outLap.lapTime) - avg;
            
            if (tPit <= 0 || tOut <= 0) return null;
            
            let lost = tPit + tOut;

            if (pitEntry && pitEntry.pitTime) {
                const pTime = parseFloat(pitEntry.pitTime);
                if (!isNaN(pTime)) {
                    lost -= pTime;
                }
            }

            return lost > 0 ? lost : 0;
        }

        function calculateMistakeLoss(race, lapIdx, stintStart, stintEnd, isStintEndPit) {
            const lap = race.laps[lapIdx];
            if (!lap) return 0;

            // Exclude First lap of race
            if (lap.idx === 1) return 0;

            // Exclude Out-lap (First lap of stint)
            if (lapIdx === stintStart) return 0;

            // Exclude In-lap (Last lap before pit)
            if (isStintEndPit && lapIdx === stintEnd) return 0;

            // Exclude Last lap of race
            if (lapIdx === race.laps.length - 1) return 0;

            const hasIssue = (l) => l.events && l.events.some(e => 
                e.event.toLowerCase().includes('mistake') || 
                e.event.toLowerCase().includes('problem') ||
                e.event.toLowerCase().includes('accident')
            );

            const mistakeTime = parseTime(lap.lapTime);
            if (mistakeTime <= 0) return 0;

            const window = 2; // Look at 2 laps before and 2 after
            let cleanTimes = [];

            // Check backward
            for (let i = lapIdx - 1; i >= stintStart; i--) {
                if (cleanTimes.length >= window) break;
                if (i === stintStart) continue; // Skip out-lap
                const l = race.laps[i];
                if (l && !hasIssue(l)) {
                    const t = parseTime(l.lapTime);
                    if (t > 0) cleanTimes.push(t);
                }
            }

            // Check forward
            for (let i = lapIdx + 1; i <= stintEnd; i++) {
                if (cleanTimes.length >= window * 2) break;
                if (isStintEndPit && i === stintEnd) continue; // Skip in-lap
                const l = race.laps[i];
                if (l && !hasIssue(l)) {
                    const t = parseTime(l.lapTime);
                    if (t > 0) cleanTimes.push(t);
                }
            }

            if (cleanTimes.length === 0) return 0;
            
            const avg = cleanTimes.reduce((a, b) => a + b, 0) / cleanTimes.length;
            const loss = mistakeTime - avg;
            return loss > 0 ? loss : 0;
        }

        function renderForecastView(races, metric, refW) {
            currentView = 'forecast';
            const container = document.getElementById('cardsContainer');
            container.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'card';
            card.style.gridColumn = '1 / -1';

            // Deduplicate races based on Season and Race
            const uniqueMap = new Map();
            races.forEach(r => {
                const key = `${r.selSeasonNb}-${r.selRaceNb}`;
                if (!uniqueMap.has(key) || (!uniqueMap.get(key).driver?.id && r.driver?.id)) {
                    uniqueMap.set(key, r);
                }
            });
            races = Array.from(uniqueMap.values());
            
            let label = 'Unknown';
            let unit = '';
            if (metric === 'temp') { label = 'Target Temp'; unit = '°'; }
            if (metric === 'hum') { label = 'Target Hum'; unit = '%'; }
            if (metric === 'rain') { label = 'Target Rain'; unit = '%'; }

            // Generate Dropdown for Variations
            let variationSelectHTML = '';
            if (allRaceData.length > 0) {
                const clusters = [];
                const isSimilar = (w1, w2, metric) => {
                    if (!w1 || !w2) return false;
                    const check = (a, b, tol) => Math.abs(a - b) <= tol;
                    if (metric === 'temp') {
                        const tol = 2;
                        for(let i=1; i<=4; i++) {
                            if (!check(w1[`raceQ${i}TempLow`], w2[`raceQ${i}TempLow`], tol)) return false;
                            if (!check(w1[`raceQ${i}TempHigh`], w2[`raceQ${i}TempHigh`], tol)) return false;
                        }
                        return true;
                    }
                    if (metric === 'hum') {
                        const tol = 5;
                        for(let i=1; i<=4; i++) {
                            if (!check(w1[`raceQ${i}HumLow`], w2[`raceQ${i}HumLow`], tol)) return false;
                            if (!check(w1[`raceQ${i}HumHigh`], w2[`raceQ${i}HumHigh`], tol)) return false;
                        }
                        return true;
                    }
                    if (metric === 'rain') {
                        const tol = 10;
                        for(let i=1; i<=4; i++) {
                            if (!check(w1[`raceQ${i}RainPLow`], w2[`raceQ${i}RainPLow`], tol)) return false;
                            if (!check(w1[`raceQ${i}RainPHigh`], w2[`raceQ${i}RainPHigh`], tol)) return false;
                        }
                        return true;
                    }
                    return false;
                };

                allRaceData.forEach(r => {
                    if (!r.weather) return;
                    let found = false;
                    for(let c of clusters) {
                        if (isSimilar(r.weather, c.weather, metric)) {
                            c.count++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        const dId = r.driver && r.driver.id ? r.driver.id : 'unknown';
                        clusters.push({
                            weather: r.weather,
                            count: 1,
                            repUid: `${r.selSeasonNb}-${r.selRaceNb}-${dId}`,
                            displayValues: [1,2,3,4].map(q => {
                                if (metric === 'temp') return `${r.weather[`raceQ${q}TempLow`]}-${r.weather[`raceQ${q}TempHigh`]}`;
                                if (metric === 'hum') return `${r.weather[`raceQ${q}HumLow`]}-${r.weather[`raceQ${q}HumHigh`]}`;
                                if (metric === 'rain') return `${r.weather[`raceQ${q}RainPLow`]}-${r.weather[`raceQ${q}RainPHigh`]}`;
                                return '';
                            })
                        });
                    }
                });

                const sortedClusters = clusters.sort((a, b) => b.count - a.count);
                
                let currentRepUid = '';
                if (races.length > 0) {
                    const r0 = races[0];
                    for(let c of sortedClusters) {
                        if (isSimilar(r0.weather, c.weather, metric)) {
                            currentRepUid = c.repUid;
                            break;
                        }
                    }
                }

                const tableRows = sortedClusters.map(c => {
                    const isSelected = c.repUid === currentRepUid;
                    const rowClass = isSelected ? 'active-row' : 'clickable-row';
                    const p = c.displayValues.map(s => s + unit);
                    return `<tr class="${rowClass}" onclick="filterByForecast('${c.repUid}', '${metric}')"><td>${p[0]}</td><td>${p[1]}</td><td>${p[2]}</td><td>${p[3]}</td><td>${c.count}</td></tr>`;
                }).join('');

                let btnText = 'Select Forecast Group';
                if (currentRepUid) {
                    const c = sortedClusters.find(cl => cl.repUid === currentRepUid);
                    if (c) {
                        const curParts = c.displayValues.map(s => s + unit);
                        btnText = `Current: Q1: ${curParts[0]} | Q2: ${curParts[1]} | Q3: ${curParts[2]} | Q4: ${curParts[3]}`;
                    }
                }

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

            // Grouping Logic
            const groups = new Map();
            races.forEach(r => {
                const w = r.weather;
                if (!w) return;
                let key = '';
                if (metric === 'temp') {
                    key = [1,2,3,4].map(q => `${w['raceQ'+q+'TempLow']}-${w['raceQ'+q+'TempHigh']}`).join('|');
                } else if (metric === 'hum') {
                    key = [1,2,3,4].map(q => `${w['raceQ'+q+'HumLow']}-${w['raceQ'+q+'HumHigh']}`).join('|');
                } else if (metric === 'rain') {
                    key = [1,2,3,4].map(q => `${w['raceQ'+q+'RainPLow']}-${w['raceQ'+q+'RainPHigh']}`).join('|');
                }
                
                if (!groups.has(key)) {
                    groups.set(key, {
                        key: key,
                        weather: w,
                        races: []
                    });
                }
                groups.get(key).races.push(r);
            });

            const sortedGroups = Array.from(groups.values());
            if (refW) {
                let refKey = '';
                if (metric === 'temp') {
                    refKey = [1,2,3,4].map(q => `${refW['raceQ'+q+'TempLow']}-${refW['raceQ'+q+'TempHigh']}`).join('|');
                } else if (metric === 'hum') {
                    refKey = [1,2,3,4].map(q => `${refW['raceQ'+q+'HumLow']}-${refW['raceQ'+q+'HumHigh']}`).join('|');
                } else if (metric === 'rain') {
                    refKey = [1,2,3,4].map(q => `${refW['raceQ'+q+'RainPLow']}-${refW['raceQ'+q+'RainPHigh']}`).join('|');
                }
                
                sortedGroups.sort((a, b) => {
                    if (a.key === refKey) return -1;
                    if (b.key === refKey) return 1;
                    return b.races.length - a.races.length;
                });
            } else {
                sortedGroups.sort((a, b) => b.races.length - a.races.length);
            }

            const getR = (q, w) => {
                if (metric === 'temp') return `${w['raceQ'+q+'TempLow']}-${w['raceQ'+q+'TempHigh']}${unit}`;
                if (metric === 'hum') return `${w['raceQ'+q+'HumLow']}-${w['raceQ'+q+'HumHigh']}${unit}`;
                if (metric === 'rain') return `${w['raceQ'+q+'RainPLow']}-${w['raceQ'+q+'RainPHigh']}${unit}`;
                return '-';
            };

            const generateRow = (r) => {
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
            };

            let tableBodyHTML = '';
            sortedGroups.forEach(group => {
                const w = group.weather;
                tableBodyHTML += `
                    <tr style="background-color: var(--card-bg); font-weight: bold; border-bottom: 2px solid var(--border); border-top: 2px solid var(--border);">
                        <td></td>
                        <td>${label}</td>
                        <td>${getR(1, w)}</td>
                        <td>${getR(2, w)}</td>
                        <td>${getR(3, w)}</td>
                        <td>${getR(4, w)}</td>
                    </tr>
                `;
                group.races.forEach(r => {
                    tableBodyHTML += generateRow(r);
                });
            });

            card.innerHTML = `
                <div class="card-header">
                    <h3>Forecast Analysis: ${label}</h3>
                    <div class="subtitle">Found ${races.length} matching races</div>
                    ${variationSelectHTML}
                    <button onclick="returnToDashboard()" style="margin-top:10px; padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
                </div>
                <table class="setup-table" style="margin-bottom: 20px;">
                    <thead>
                        <tr>
                            <th onclick="sortTable(this.closest('table'), 0)">Track</th>
                            <th onclick="sortTable(this.closest('table'), 1)">Metric</th>
                            <th onclick="sortTable(this.closest('table'), 2)">Q1</th>
                            <th onclick="sortTable(this.closest('table'), 3)">Q2</th>
                            <th onclick="sortTable(this.closest('table'), 4)">Q3</th>
                            <th onclick="sortTable(this.closest('table'), 5)">Q4</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableBodyHTML}
                    </tbody>
                </table>
            `;
            
            container.appendChild(card);
        }

        function createRaceCard(data) {
            const card = document.createElement('div');
            const uid = `${data.selSeasonNb}-${data.selRaceNb}-${data.driver ? data.driver.id : 'u'}`;
            card.id = `card-${uid}`;
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

                const processStint = (endLap, fuelLeft, tyreLeft, stintIdx, isPitStintEnd) => {
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
                    let mistakeCount = 0;
                    let mistakeLoss = 0;

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

                            if (data.laps[i].events) {
                                data.laps[i].events.forEach(e => {
                                    if (e.event) {
                                        const matches = [...e.event.matchAll(/mistake.*?\(\s*(\d+(?:\.\d+)?)\s*s?\s*\)/gi)];
                                        if (matches.length > 0) {
                                            matches.forEach(m => {
                                                mistakeCount++;
                                                mistakeLoss += parseFloat(m[1]);
                                            });
                                        } else if (e.event.toLowerCase().includes('mistake')) {
                                            mistakeCount++;
                                            // Calculate loss if not present
                                            mistakeLoss += calculateMistakeLoss(data, i, startLap, endLap, isPitStintEnd);
                                        }
                                    }
                                });
                            }
                        }
                    }
                    const avgTemp = tempCount > 0 ? (tempSum / tempCount).toFixed(1) : '-';
                    const avgHum = tempCount > 0 ? (humSum / tempCount).toFixed(0) : '-';
                    const weatherDisplay = weatherList.join(' ➝ ');
                    
                    const rowStyle = hasRain ? 'background-color: #1a3b5c;' : '';
                    const headStyle = hasRain ? 'background-color: #1565c0;' : 'background-color: var(--stint-head-bg);';

                    const stintTyre = data.laps[startLap] ? data.laps[startLap].tyres : '-';
                    const supIcon = getTyreSupplierIconHtml(data.tyreSupplier ? data.tyreSupplier.name : '');
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
                        <div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px;">Tyre Type</span><span class="stat-val"; style="margin-right: 15px;">${supIcon}${getTyreIconHtml(stintTyre)} ${stintTyre}</span></div>
                        <div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px;">Fuel to 18% Tyres</span><span class="stat-val"; style="margin-right: 15px;">${criticalInfo}</span></div>
                        ${mistakeCount > 0 ? `<div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px; color: #ff5252;">Mistakes</span><span class="stat-val" style="margin-right: 15px; color: #ff5252;">${mistakeCount}${mistakeLoss > 0 ? ` (${mistakeLoss.toFixed(1)}s)` : ''}</span></div>` : ''}
                        <div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px;">Weather</span><span class="stat-val"; style="margin-right: 15px;">${weatherDisplay}</span></div>
                        <div class="stat-row" style="${rowStyle}"><span class="stat-label" style="padding-left: 15px;">Avg Temp / Hum</span><span class="stat-val"; style="margin-right: 15px;">${avgTemp}° / ${avgHum}%</span></div>
                    `;
                    
                    totalFuelUsed += fuelUsed;
                };

                const pits = data.pits || [];
                pits.forEach((pit, index) => {
                    const fuelLeftLiters = (pit.fuelLeft / 100) * 180;
                    processStint(pit.lap, fuelLeftLiters, pit.tyreCond, index + 1, true);

                    let fuelAdded = 0;
                    let refillText = 'No refill';
                    
                    // Handles null, undefined, and 0 as "no refill"
                    if (pit.refilledTo > 0 && pit.refilledTo > fuelLeftLiters) {
                        fuelAdded = pit.refilledTo - fuelLeftLiters;
                        refillText = `+${fuelAdded.toFixed(1)}L`;
                        currentFuel = pit.refilledTo;
                    } else {
                        // This handles cases where refilledTo is null, undefined, or 0
                        currentFuel = fuelLeftLiters;
                    }

                    const pitLoss = calculatePitLoss(data, pit.lap);
                    const pitLossStr = pitLoss !== null ? ` <span style="font-size:0.9em; cursor:help;" onmouseenter="showTooltip(event, 'Estimated time lost in pit lane')" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()">(${pitLoss.toFixed(1)}s) ❓</span>` : '';

                    const pitTime = pit.pitTime ? ` <span style="cursor:help;" onmouseenter="showTooltip(event, 'Pit time')" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()">(${pit.pitTime}s)</span>` : '';
                    stintsHTML += `
                        <div class="stat-row" style="background-color: var(--pit-bg); flex-direction: column; padding: 4px 0;">
                            <div style="display:flex; justify-content:space-between; width:100%;">
                                <span class="stat-label" style="padding-left: 15px; color:var(--pit-text); font-weight:bold;">Pit Stop ${index + 1}</span>
                                <span class="stat-val" style="margin-right: 15px; color:var(--pit-text);">${refillText}${pitTime}${pitLossStr}</span>
                            </div>
                            ${pit.reason ? `<div style="padding-left: 15px; font-size: 0.85em; color:var(--pit-text); font-style: italic;">${pit.reason}</div>` : ''}
                        </div>`;
                    startLap = pit.lap + 1;
                });

                // Last stint
                if (startLap <= totalLaps) {
                    processStint(totalLaps, data.finishFuel, data.finishTyres, pits.length + 1, false);
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
                    ${data.tyreSupplier ? `<div class="stat-row"><span class="stat-label">Tyre Supplier</span><span class="stat-val">${getTyreSupplierIconHtml(data.tyreSupplier.name)} ${data.tyreSupplier.name}</span></div>` : ''}
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

            // Session Weather (Q1/Q2)
            let sessionWeatherHTML = '';
            if (data.weather && (data.weather.q1Temp !== undefined || data.weather.q2Temp !== undefined)) {
                 const w = data.weather;
                 const q1Icon = getWeatherIcon(w.q1Weather);
                 const q2Icon = getWeatherIcon(w.q2Weather);
                 const fmt = (t, h) => (t !== undefined && h !== undefined) ? `${t}° / ${h}%` : '-';
                 
                 sessionWeatherHTML = `
                    <div class="stat-row" style="background-color: var(--table-head-bg); margin-top: 5px; padding-left: 5px;"><span class="stat-label" style="font-weight:bold; color:var(--text-primary);">Session Weather</span></div>
                    <div class="stat-row"><span class="stat-label">Practice / Qualify 1</span><span class="stat-val">${q1Icon} ${fmt(w.q1Temp, w.q1Hum)}</span></div>
                    <div class="stat-row"><span class="stat-label">Qualify 2 / Race Start</span><span class="stat-val">${q2Icon} ${fmt(w.q2Temp, w.q2Hum)}</span></div>
                 `;
            }

            card.innerHTML = `
                <div class="card-header">
                    <button class="dismiss-card-btn" onclick="dismissCard('card-${uid}')" title="Dismiss card">&times;</button>
                    <h3>S${data.selSeasonNb} R${data.selRaceNb}: <span class="clickable-label" onclick="goToTrack('${data.trackName.replace(/'/g, "\\'")}')">${data.trackName}</span></h3>
                    <div class="subtitle">${driverName} | Group: ${data.group}</div>
                </div>
                <div class="stat-row"><span class="stat-label">Qualifying 1</span><span class="stat-val">P${data.q1Pos} (${data.q1Time})</span></div>
                <div class="stat-row"><span class="stat-label">Qualifying 2</span><span class="stat-val">P${data.q2Pos} (${data.q2Time})</span></div>
                <div class="stat-row"><span class="stat-label">Finish Position</span><span class="stat-val">P${finishPos}</span></div>
                <div class="stat-row"><span class="stat-label">Pit Stops</span><span class="stat-val">${data.pits ? data.pits.length : 0}</span></div>
                ${sessionWeatherHTML}
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

            const btnContainer = document.createElement('div');
            btnContainer.style.marginTop = '10px';
            btnContainer.style.textAlign = 'right';
            btnContainer.style.borderTop = '1px solid var(--border)';
            btnContainer.style.paddingTop = '10px';

            const dlBtn = document.createElement('button');
            dlBtn.textContent = 'Download JSON';
            dlBtn.style.padding = '4px 8px';
            dlBtn.style.cursor = 'pointer';
            dlBtn.style.background = 'var(--card-bg)';
            dlBtn.style.color = 'var(--text-secondary)';
            dlBtn.style.border = '1px solid var(--border)';
            dlBtn.style.borderRadius = '4px';
            dlBtn.style.fontSize = '0.8rem';
            dlBtn.onclick = function() { downloadJson(data); };
            
            btnContainer.appendChild(dlBtn);
            card.appendChild(btnContainer);

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

            // Create mistake icon for chart
            const mistakeIcon = document.createElement('canvas');
            mistakeIcon.width = 20;
            mistakeIcon.height = 20;
            const mCtx = mistakeIcon.getContext('2d');
            mCtx.font = '16px serif';
            mCtx.textAlign = 'center';
            mCtx.textBaseline = 'middle';
            mCtx.fillText('⚠️', 10, 10);

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
                    if (stop.nextFuel !== null && !isNaN(stop.nextFuel)) {
                        currentStartFuel = stop.nextFuel;
                    } else {
                        currentStartFuel = stop.endFuel;
                    }
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

            const vividColors = [
                '#FF0000', '#0066FF', '#00CC00', '#FF9900', '#CC00CC', 
                '#00CCCC', '#FF1493', '#D4AF37', '#00FF00'
            ];

            const datasets = races.map((race, idx) => {
                const raceColor = isSimpleChartMode ? vividColors[idx % vividColors.length] : pastelColors[idx % pastelColors.length];
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
                    const hasMistake = lap.events && lap.events.some(e => e.event.toLowerCase().includes('mistake'));
                    const isLast = i === race.laps.length - 1;

                    if (isLast) {
                        pointStyles.push(finishFlagIcon);
                        pointRadii.push(8);
                        pointBackgroundColors.push('transparent');
                        pointBorderColors.push('transparent');
                    } else if (hasProblem) {
                        if (isSimpleChartMode) {
                            pointStyles.push('rectRot');
                            pointRadii.push(6);
                            pointBackgroundColors.push('#000000');
                            pointBorderColors.push(raceColor);
                        } else {
                            pointStyles.push(wrenchIcon);
                            pointRadii.push(8);
                            pointBackgroundColors.push('transparent');
                            pointBorderColors.push('transparent');
                        }
                    } else if (hasMistake) {
                        if (isSimpleChartMode) {
                            pointStyles.push('triangle');
                            pointRadii.push(6);
                            pointBackgroundColors.push('#ff5252');
                            pointBorderColors.push(raceColor);
                        } else {
                            pointStyles.push(mistakeIcon);
                            pointRadii.push(8);
                            pointBackgroundColors.push('transparent');
                            pointBorderColors.push('transparent');
                        }
                    } else if (pitLaps.has(lap.idx)) {
                        pointStyles.push('rectRot');
                        pointRadii.push(8);
                        if (isSimpleChartMode) {
                            pointBackgroundColors.push(raceColor);
                            pointBorderColors.push('#242526');
                        } else {
                            pointBackgroundColors.push('#242526'); // Match card bg
                            pointBorderColors.push(colorPit);
                        }
                    } else if (isSimpleChartMode) {
                        pointStyles.push('rectRot');
                        pointRadii.push(4);
                        pointBackgroundColors.push(raceColor);
                        pointBorderColors.push('#242526');
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

        function setupDragAndDrop() {
            const dropZone = document.getElementById('dropZone');
            if (!dropZone) return;

            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, preventDefaults, false);
            });

            function preventDefaults(e) {
                e.preventDefault();
                e.stopPropagation();
            }

            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, highlight, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, unhighlight, false);
            });

            function highlight(e) {
                dropZone.classList.add('drag-over');
            }

            function unhighlight(e) {
                dropZone.classList.remove('drag-over');
            }

            dropZone.addEventListener('drop', handleDrop, false);

            async function handleDrop(e) {
                const dt = e.dataTransfer;
                let files = [];

                if (dt.items && dt.items.length > 0 && dt.items[0].webkitGetAsEntry) {
                    const traverseFileTree = (item) => {
                        return new Promise((resolve) => {
                            if (item.isFile) {
                                item.file(file => resolve([file]));
                            } else if (item.isDirectory) {
                                const dirReader = item.createReader();
                                const entries = [];
                                const readEntries = () => {
                                    dirReader.readEntries(async (result) => {
                                        if (!result.length) {
                                            const nestedPromises = entries.map(entry => traverseFileTree(entry));
                                            const nestedFiles = await Promise.all(nestedPromises);
                                            resolve(nestedFiles.flat());
                                        } else {
                                            entries.push(...result);
                                            readEntries();
                                        }
                                    });
                                };
                                readEntries();
                            } else {
                                resolve([]);
                            }
                        });
                    };

                    const promises = [];
                    for (let i = 0; i < dt.items.length; i++) {
                        const item = dt.items[i].webkitGetAsEntry();
                        if (item) promises.push(traverseFileTree(item));
                    }
                    const results = await Promise.all(promises);
                    files = results.flat();
                } else {
                    files = dt.files;
                }

                handleFiles(files);
            }
        }

        // Auto-load from DB on startup
        window.addEventListener('DOMContentLoaded', async () => {
            setupDragAndDrop();
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