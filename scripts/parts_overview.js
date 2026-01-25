
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
