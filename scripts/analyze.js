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

                const progressContainer = document.getElementById('progressContainer');
                const progressBar = document.getElementById('progressBar');
                const progressText = document.getElementById('progressText');
                if (progressContainer) {
                    progressContainer.style.display = 'block';
                    progressBar.style.width = '0%';
                    progressText.textContent = `Loading presaved tracks...`;
                }
                
                let processedCount = 0;
                for (const f of files) {
                    if (progressContainer) {
                        processedCount++;
                        const pct = Math.round((processedCount / files.length) * 100);
                        progressBar.style.width = `${pct}%`;
                        progressText.textContent = `Loading ${processedCount}/${files.length}`;
                    }
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
                
                if (progressContainer) {
                    progressBar.style.width = '100%';
                    setTimeout(() => {
                        progressContainer.style.display = 'none';
                    }, 1000);
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
                        <th onclick="sortTable(this.closest('table'), 3)">Group</th>
                        <th onclick="sortTable(this.closest('table'), 4)">Pos</th>
                        <th onclick="sortTable(this.closest('table'), 5)">Driver</th>
                        <th onclick="sortTable(this.closest('table'), 6)">Weather</th>
                        <th onclick="sortTable(this.closest('table'), 7)">Tyres</th>
                        <th onclick="sortTable(this.closest('table'), 8)">Problems</th>
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
                const groupName = r.group || r.groupName || '-';
                
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
                        <td>${groupName}</td>
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
                { header: 'General Info' },
                { label: 'Driver', path: 'driver.name' },
                { label: 'Group', path: 'group', isGroup: true },
                { label: 'Position', path: (r) => (r.laps && r.laps.length > 0) ? r.laps[r.laps.length-1].pos : null, format: v => `P${v}`, color: 'low' },
                
                { header: 'Race Statistics' },
                { label: 'Tyres Used', val: (i) => stats[i].usedTyres, isTyres: true },
                { label: 'Avg Temp', val: (i) => stats[i].avgTemp, format: v => v !== null ? v.toFixed(1) + '°' : '-' },
                { label: 'Avg Hum', val: (i) => stats[i].avgHum, format: v => v !== null ? v.toFixed(1) + '%' : '-' },
                { label: 'Rain Laps', val: (i) => stats[i].rainLaps },
                { label: 'Avg Fuel/Lap', val: (i) => stats[i].avgFuel, format: v => v.toFixed(3) + ' L', color: 'low' },
                { label: 'Avg Tyre Wear/Lap', val: (i) => stats[i].avgTyre, format: v => v.toFixed(3) + '%', color: 'low' },
                
                { header: 'Car Character' },
                { label: 'Tyre Supplier', path: 'tyreSupplier.name' },
                { label: 'Car Power', path: 'carPower', color: 'high' },
                { label: 'Car Handling', path: 'carHandl', color: 'high' },
                { label: 'Car Accel', path: 'carAccel', color: 'high' },
                ...Object.keys(partLabels).map(key => ({
                    label: partLabels[key],
                    path: `${key}.lvl`,
                    color: 'high'
                })),
                
                { header: 'Car Parts Levels' },
                ...Object.keys(partLabels).map(key => ({
                    label: partLabels[key],
                    path: `${key}.lvl`,
                    color: 'high'
                })),
                
                { header: 'Driver Attributes' },
                { label: 'Driver OA', path: 'driver.OA', color: 'high' },
                { label: 'Concentration', path: 'driver.con', color: 'high' },
                { label: 'Talent', path: 'driver.tal', color: 'high' },
                { label: 'Aggressiveness', path: 'driver.agr', color: 'high' },
                { label: 'Experience', path: 'driver.exp', color: 'high' },
                { label: 'Tech Insight', path: 'driver.tei', color: 'high' },
                { label: 'Stamina', path: 'driver.sta', color: 'high' },
                { label: 'Charisma', path: 'driver.cha', color: 'high' },
                { label: 'Motivation', path: 'driver.mot', color: 'high' },
                { label: 'Reputation', path: 'driver.rep', color: 'high' },
                { label: 'Weight', path: 'driver.wei', color: 'low' }
            ];

            let tableHTML = '<table class="setup-table"><thead><tr><th>Metric</th>';
            races.forEach(r => { tableHTML += `<th>S${r.selSeasonNb} R${r.selRaceNb}<br>${r.trackName}</th>`; });
            tableHTML += '</tr></thead><tbody>';

            rows.forEach(row => {
                if (row.header) {
                    tableHTML += `<tr style="background-color:var(--table-head-bg);"><td colspan="${races.length + 1}" style="font-weight:bold; padding:5px 10px; color:var(--text-primary); text-align:center;">${row.header}</td></tr>`;
                    return;
                }
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

            const progressContainer = document.getElementById('progressContainer');
            const progressBar = document.getElementById('progressBar');
            const progressText = document.getElementById('progressText');
            if (progressContainer) {
                progressContainer.style.display = 'block';
                progressBar.style.width = '0%';
                progressText.textContent = `Starting...`;
            }

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
                if (progressContainer) {
                    const pct = Math.round(((i + 1) / files.length) * 100);
                    progressBar.style.width = `${pct}%`;
                    progressText.textContent = `Processing file ${i + 1} of ${files.length}`;
                    await new Promise(r => setTimeout(r, 0));
                }

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

            if (progressContainer) {
                progressBar.style.width = '100%';
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                }, 1000);
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
