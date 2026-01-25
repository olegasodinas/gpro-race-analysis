
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
                        <div class="stat-row" style="${headStyle} margin-top: 5px;"><span class="stat-label" style="font-weight:600; color:var(--text-primary); padding-left: 15px;">Stint ${stintIdx} (${lapsInStint} Laps: ${startLap}-${endLap})</span>${hasRain ? '<span style="margin-right: 15px;">🌧️</span>' : ''}</div>
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
