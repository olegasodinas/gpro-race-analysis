
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
