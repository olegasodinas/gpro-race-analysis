
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
                        if (r.laps[i] && r.laps[i].events) {
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
