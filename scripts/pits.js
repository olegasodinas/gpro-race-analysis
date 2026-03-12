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

function openPitStrategy() {
    currentView = 'strategy';
    const container = document.getElementById('cardsContainer');
    container.innerHTML = '';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'card';
    headerDiv.style.gridColumn = '1 / -1';
    headerDiv.innerHTML = `
        <div class="card-header">
            <h3>Pit Strategy Analysis</h3>
            <div class="subtitle">Analysis of pit stop times for the selected track.</div>
            <div style="margin-top:10px;">
                <button onclick="returnToDashboard()" style="padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
            </div>
        </div>
    `;
    container.appendChild(headerDiv);

    const select = document.getElementById('trackSelect');
    const selectedTrack = select ? select.value : 'all';

    if (selectedTrack === 'all') {
        const msg = document.createElement('div');
        msg.className = 'card';
        msg.style.gridColumn = '1 / -1';
        msg.innerHTML = `<div style="padding:20px; text-align:center;">Please select a specific track from the dropdown above to view Pit Stop Analysis.</div>`;
        container.appendChild(msg);
        return;
    }

    const trackRaces = allRaceData.filter(r => r.trackName === selectedTrack);

    // Refresh chart with filtered races
    if (typeof renderChart === 'function') {
        renderChart(trackRaces);
    }

    if (trackRaces.length === 0) {
        container.innerHTML += `<div class="card" style="grid-column:1/-1; padding:20px;">No data found for ${selectedTrack}.</div>`;
        return;
    }

    const groupStats = { 'Rookie': [], 'Amateur': [], 'Pro': [], 'Master': [], 'Elite': [] };
    const groupOrder = ['Rookie', 'Amateur', 'Pro', 'Master', 'Elite'];
    
    trackRaces.forEach(race => {
        let groupKey = null;
        const gl = (race.group || race.groupName || '').toLowerCase();
        if (gl.includes('rookie')) groupKey = 'Rookie';
        else if (gl.includes('amateur')) groupKey = 'Amateur';
        else if (gl.includes('pro')) groupKey = 'Pro';
        else if (gl.includes('master')) groupKey = 'Master';
        else if (gl.includes('elite')) groupKey = 'Elite';

        if (groupKey && race.pits) {
            race.pits.forEach(p => {
                const pl = calculatePitLoss(race, p.lap);
                if (pl !== null) {
                    groupStats[groupKey].push(pl);
                }
            });
        }
    });

    const getNearestGroupAvg = (targetGroup) => {
        let targetIdx = groupOrder.indexOf(targetGroup);
        if (targetIdx === -1) targetIdx = 2; 

        if (groupStats[targetGroup] && groupStats[targetGroup].length > 0) {
            return groupStats[targetGroup].reduce((a,b)=>a+b,0) / groupStats[targetGroup].length;
        }

        let offset = 1;
        while (targetIdx - offset >= 0 || targetIdx + offset < groupOrder.length) {
            if (targetIdx - offset >= 0) {
                const g = groupOrder[targetIdx - offset];
                if (groupStats[g].length > 0) return groupStats[g].reduce((a,b)=>a+b,0) / groupStats[g].length;
            }
            if (targetIdx + offset < groupOrder.length) {
                const g = groupOrder[targetIdx + offset];
                if (groupStats[g].length > 0) return groupStats[g].reduce((a,b)=>a+b,0) / groupStats[g].length;
            }
            offset++;
        }
        return 0;
    };

    let maxLapsForTrack = 0;
    trackRaces.forEach(r => {
        if (r.laps && r.laps.length > 0) {
            const last = r.laps[r.laps.length - 1].idx;
            if (last > maxLapsForTrack) maxLapsForTrack = last;
        }
    });

    const allPits = [];
    trackRaces.forEach(race => {
        const pitLaps = new Set();
        if (race.pits) {
            race.pits.forEach(p => {
                pitLaps.add(p.lap);
                pitLaps.add(p.lap + 1);
            });
        }

        let flyingTime = 0;
        let flyingCount = 0;
        if (race.laps) {
            race.laps.forEach(l => {
                const t = parseTime(l.lapTime);
                if (t > 0 && l.idx > 1 && !pitLaps.has(l.idx)) {
                    flyingTime += t;
                    flyingCount++;
                }
            });
        }
        let avgLap = flyingCount > 0 ? flyingTime / flyingCount : 0;
        
        // Fallback if no flying laps found
        if (avgLap === 0 && race.laps) {
            let totalTime = 0;
            let lapCount = 0;
            race.laps.forEach(l => {
                const t = parseTime(l.lapTime);
                if (t > 0) { totalTime += t; lapCount++; }
            });
            avgLap = lapCount > 0 ? totalTime / lapCount : 0;
        }

        const totalPits = race.pits ? race.pits.length : 0;

        let sumPitTime = 0, countPitTime = 0;
        let sumPitLoss = 0, countPitLoss = 0;
        if (race.pits) {
            race.pits.forEach(p => {
                const pt = parseFloat(p.pitTime) || 0;
                if (pt > 0) { sumPitTime += pt; countPitTime++; }
                const pl = calculatePitLoss(race, p.lap);
                if (pl !== null) { sumPitLoss += pl; countPitLoss++; }
            });
        }
        const avgPitTime = countPitTime > 0 ? sumPitTime / countPitTime : 0;
        const avgPitLoss = countPitLoss > 0 ? sumPitLoss / countPitLoss : 0;

        // 1. Build all stints for the race
        const stints = [];
        let startLap = 1;
        const totalLaps = race.laps.length - 1;
        const pits = race.pits || [];
        
        pits.forEach((p, idx) => {
            stints.push({
                idx: idx + 1,
                start: startLap,
                end: p.lap,
                laps: p.lap - startLap + 1,
                tyre: (race.laps[startLap] ? race.laps[startLap].tyres : 'Unknown'),
                endCond: p.tyreCond,
                pitTime: parseFloat(p.pitTime) || 0,
                pitLoss: calculatePitLoss(race, p.lap)
            });
            startLap = p.lap + 1;
        });
        
        // Add last stint (Finish)
        if (startLap <= totalLaps) {
            stints.push({
                idx: pits.length + 1,
                start: startLap,
                end: totalLaps,
                laps: totalLaps - startLap + 1,
                tyre: (race.laps[startLap] ? race.laps[startLap].tyres : 'Unknown'),
                endCond: race.finishTyres,
                pitTime: 0,
                pitLoss: null
            });
        }

        const equalStintLaps = totalLaps / (pits.length + 1);

        let groupKey = 'Pro';
        const gl = (race.group || race.groupName || '').toLowerCase();
        if (gl.includes('rookie')) groupKey = 'Rookie';
        else if (gl.includes('amateur')) groupKey = 'Amateur';
        else if (gl.includes('pro')) groupKey = 'Pro';
        else if (gl.includes('master')) groupKey = 'Master';
        else if (gl.includes('elite')) groupKey = 'Elite';

        // 2. Group by Tyre Type
        const tyreGroups = {};
        stints.forEach(s => {
            if (!tyreGroups[s.tyre]) tyreGroups[s.tyre] = [];
            tyreGroups[s.tyre].push(s);
        });

        // 3. Create Rows for each Tyre Type
        Object.keys(tyreGroups).forEach(tType => {
            const groupStints = tyreGroups[tType];
            
            // Calculate averages for this tyre group
            let sumPt = 0, cntPt = 0;
            let sumPl = 0, cntPl = 0;
            let tempSum = 0, tempCount = 0;
            let isEstimated = false;

            groupStints.forEach(s => {
                if (s.pitTime > 0) { sumPt += s.pitTime; cntPt++; }
                
                let pl = s.pitLoss;
                if (pl === null && s.pitTime > 0) { // Only estimate if it was a pit stop
                    pl = getNearestGroupAvg(groupKey);
                    if (pl > 0) isEstimated = true;
                }
                if (pl !== null && pl > 0) { sumPl += pl; cntPl++; }

                for (let i = s.start; i <= s.end; i++) {
                    const lapData = race.laps.find(l => l.idx === i);
                    if (lapData && typeof lapData.temp === 'number') {
                        tempSum += lapData.temp;
                        tempCount++;
                    }
                }
            });
            
            const avgTemp = tempCount > 0 ? tempSum / tempCount : 0;
            // Use group average if available, otherwise fallback to race average
            const pTime = cntPt > 0 ? sumPt / cntPt : avgPitTime;
            const pLoss = cntPl > 0 ? sumPl / cntPl : avgPitLoss;
            
            const strategyTime = (maxLapsForTrack * avgLap) + ((pTime + pLoss) * totalPits);

            allPits.push({
                race: race,
                tyre: tType,
                stints: groupStints, // Store specific stints for this tyre
                pitTime: pTime,
                pitLoss: pLoss,
                isEstimated: isEstimated,
                avgLap: avgLap,
                avgTemp: avgTemp,
                totalPits: totalPits,
                strategyTime: strategyTime,
                equalStintLaps: equalStintLaps
            });
        });
    });

    if (allPits.length === 0) {
        container.innerHTML += `<div class="card" style="grid-column:1/-1; padding:20px;">No pit stop data found for ${selectedTrack}.</div>`;
        return;
    }

    allPits.sort((a, b) => a.pitTime - b.pitTime);

    let minStrat = Infinity, maxStrat = -Infinity;
    allPits.forEach(p => {
        if (p.strategyTime < minStrat) minStrat = p.strategyTime;
        if (p.strategyTime > maxStrat) maxStrat = p.strategyTime;
    });

    const card = document.createElement('div');
    card.className = 'card';
    card.style.gridColumn = '1 / -1';

    const fmt = (s) => {
        if (!s) return '-';
        const m = Math.floor(s / 60);
        const sec = (s % 60).toFixed(3);
        return `${m}:${sec.padStart(6, '0')}`;
    };

    const fmtStrategy = (s) => {
        if (!s) return '-';
        const hours = Math.floor(s / 3600);
        const minutes = Math.floor((s % 3600) / 60);
        const seconds = Math.floor(s % 60);
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    let maxStints = 0;
    trackRaces.forEach(r => {
        const stints = (r.pits ? r.pits.length : 0) + 1;
        if (stints > maxStints) maxStints = stints;
    });

    let tableHTML = `
        <div style="overflow-x:auto;">
            <table class="setup-table">
                <thead>
                    <tr>
                        <th onclick="sortTable(this.closest('table'), 0)">Race</th>
    `;
    for (let i = 1; i <= maxStints; i++) {
        tableHTML += `<th onclick="sortTable(this.closest('table'), ${i})">Stint ${i} Left</th>`;
    }
    tableHTML += `
                        <th onclick="sortTable(this.closest('table'), ${maxStints + 1})">Tyre</th>
                        <th onclick="sortTable(this.closest('table'), ${maxStints + 2})">Pit Time (s)</th>
                        <th onclick="sortTable(this.closest('table'), ${maxStints + 3})">Pit Lane Loss (s)</th>
                        <th onclick="sortTable(this.closest('table'), ${maxStints + 4})">Avg Lap</th>
                        <th onclick="sortTable(this.closest('table'), ${maxStints + 5})">Total Pits</th>
                        <th onclick="sortTable(this.closest('table'), ${maxStints + 6})">Est. Strategy Time</th>
                    </tr>
                </thead>
                <tbody>
    `;

    allPits.forEach(pit => {
        const race = pit.race;
        const d = race.driver || {};
        let pitLossStr = (pit.pitLoss !== null && pit.pitLoss > 0) ? pit.pitLoss.toFixed(2) : '-';
        if (pit.isEstimated) {
            pitLossStr += ' <span title="Estimated from nearest league average" style="cursor:help; color:var(--text-secondary); font-weight:bold;">?</span>';
        }
        let tyreDisplayName = pit.tyre;
        if (tyreDisplayName.includes('(W)')) {
            const cleanTyre = tyreDisplayName.replace('(W)', '').trim();
            tyreDisplayName = `${cleanTyre} <span ${createTooltipAttr('Wet Compound')} style="color:var(--text-secondary);">(W)</span>`;
        }
        const tyreHtml = (typeof getTyreIconHtml === 'function') ? `${getTyreIconHtml(pit.tyre)} ${tyreDisplayName}` : pit.tyre;

        const group = (race.group || race.groupName || '').toLowerCase();
        let rowStyle = '';
        let groupLetter = '';
        if (group.includes('rookie')) { rowStyle = 'color:#8bc34a'; groupLetter = 'R'; }
        else if (group.includes('amateur')) { rowStyle = 'color:#ffca28'; groupLetter = 'A'; }
        else if (group.includes('pro')) { rowStyle = 'color:#ff9800'; groupLetter = 'P'; }
        else if (group.includes('master')) { rowStyle = 'color:#f44336'; groupLetter = 'M'; }
        else if (group.includes('elite')) { rowStyle = 'color:#9c27b0'; groupLetter = 'E'; }

        let stratStyle = '';
        if (minStrat !== Infinity && maxStrat > minStrat) {
            const ratio = (pit.strategyTime - minStrat) / (maxStrat - minStrat);
            const hue = ((1 - ratio) * 120).toFixed(0);
            stratStyle = `background-color:hsla(${hue}, 70%, 20%, 0.8); border-radius:4px;`;
        }

        const tooltipContent = `Stint: ${pit.stint}<br>Lap: ${pit.lap}<br>Reason: ${pit.reason}`;
        const pitTimeAttr = createTooltipAttr(tooltipContent, 'font-weight:bold; color:var(--accent);');

        let hasRain = false;
        let hasDry = false;
        let hasCloud = false;
        if (race.laps) {
            race.laps.forEach(l => {
                if (!l.weather) return;
                const w = l.weather.toLowerCase();
                if (w.includes('rain')) hasRain = true;
                else {
                    hasDry = true;
                    if (w.includes('cloud')) hasCloud = true;
                }
            });
        }
        let wIcon = '☀️';
        if (hasRain && hasDry) wIcon = '🌦️';
        else if (hasRain) wIcon = '🌧️';
        else if (hasCloud) wIcon = '☁️';

        const tempStr = pit.avgTemp > 0 ? ` ${pit.avgTemp.toFixed(1)}°` : '';

        let stintCols = '';
        
        for (let i = 1; i <= maxStints; i++) {
            // Find if this row (tyre group) has a stint with index i
            const s = pit.stints.find(x => x.idx === i);
            
            if (!s) {
                stintCols += `<td>-</td>`;
                continue;
            }
            
            const sLaps = s.laps;
            const sWear = 100 - s.endCond;
            
            let projLeft = '-';
            let cellStyle = '';
            let cellAttr = '';
            
            if (sLaps > 0) {
                // Calculate Projection (Equal Parts)
                const wearPerLap = sWear / sLaps;
                const projWear = wearPerLap * pit.equalStintLaps;
                const projLeftVal = 100 - projWear;
                
                projLeft = projLeftVal.toFixed(1) + '%';
                
                // Actual for Tooltip
                const actualLeft = 100 - sWear;
                
                let tooltipText = `<b>Stint ${i}</b><br>Laps: ${sLaps}<br>Actual Left: ${actualLeft.toFixed(1)}%<br>Proj. Equal (${pit.equalStintLaps.toFixed(1)} laps): ${projLeftVal.toFixed(1)}%`;
                
                if (projLeftVal < 5) { cellStyle = 'color:#ff0000; font-weight:bold;'; }
                else if (projLeftVal < 20) { cellStyle = 'color:#ff9800; font-weight:bold;'; }
                else { cellStyle = 'color:#4caf50; font-weight:bold;'; }
                cellAttr = createTooltipAttr(tooltipText, cellStyle);
            } else {
                cellAttr = `style="${cellStyle}"`;
            }
            
            stintCols += `<td ${cellAttr}>${projLeft}</td>`;
        }

        // Tooltip for Avg Lap
        let avgLapTooltipContent = '';
        if (race.driver) {
            const d = race.driver;
            avgLapTooltipContent += '<div style="text-align:left; font-weight:bold; margin-bottom:3px;">Driver Attributes</div>';
            avgLapTooltipContent += '<table class="tooltip-table" style="min-width:120px;">';
            const attrs = [
                ['Overall', d.OA], ['Concentration', d.con], ['Talent', d.tal], ['Aggressiveness', d.agr],
                ['Experience', d.exp], ['Tech. Insight', d.tei], ['Stamina', d.sta], ['Weight', d.wei]
            ];
            attrs.forEach(([k, v]) => {
                if (v) avgLapTooltipContent += `<tr><td>${k}</td><td>${v}</td></tr>`;
            });
            avgLapTooltipContent += '</table>';
        }
        if (race.chassis && typeof partLabels !== 'undefined') {
            if (avgLapTooltipContent) avgLapTooltipContent += '<br>';
            avgLapTooltipContent += '<div style="text-align:left; font-weight:bold; margin-bottom:3px;">Car Levels</div>';
            avgLapTooltipContent += '<table class="tooltip-table" style="min-width:120px;">';
            Object.keys(partLabels).forEach(key => {
                if (race[key]) {
                    avgLapTooltipContent += `<tr><td>${partLabels[key]}</td><td>${race[key].lvl || '-'}</td></tr>`;
                }
            });
            avgLapTooltipContent += '</table>';
        }
        const avgLapAttr = avgLapTooltipContent ? createTooltipAttr(avgLapTooltipContent) : '';

        tableHTML += `
            <tr style="${rowStyle}">
                <td>S${race.selSeasonNb} R${race.selRaceNb} <b>${groupLetter}</b> ${wIcon}${tempStr}</td>
                ${stintCols}
                <td>${tyreHtml}</td>
                <td ${pitTimeAttr}>${pit.pitTime.toFixed(2)}</td>
                <td>${pitLossStr}</td>
                <td ${avgLapAttr}>${fmt(pit.avgLap)}</td>
                <td>${pit.totalPits}</td>
                <td style="${stratStyle}">${fmtStrategy(pit.strategyTime)}</td>
            </tr>
        `;
    });

    if (allPits.length > 0) {
        let bestStratTime = Infinity;
        let bestStratPits = 0;
        let bestStratTyre = '-';
        
        let minAvgLap = Infinity;
        let bestLapRace = null;
        let minPitTime = Infinity;
        let minPitLoss = Infinity;
        let maxLaps = 0;
        let totalStintTemps = 0;
        let stintTempCount = 0;

        trackRaces.forEach(r => {
            if (r.laps && r.laps.length - 1 > maxLaps) maxLaps = r.laps.length - 1;
            
            const pLaps = new Set();
            if (r.pits) r.pits.forEach(p => { pLaps.add(p.lap); pLaps.add(p.lap+1); });

            let fTime = 0;
            let fCount = 0;
            if (r.laps) {
                r.laps.forEach(l => {
                    const t = parseTime(l.lapTime);
                    if (t > 0 && l.idx > 1 && !pLaps.has(l.idx)) { 
                        fTime += t; 
                        fCount++; 
                    }
                });
            }
            const aLap = fCount > 0 ? fTime / fCount : 0;
            if (aLap > 0 && aLap < minAvgLap) {
                minAvgLap = aLap;
                bestLapRace = r;
            }
        });

        allPits.forEach(p => {
            if (p.strategyTime < bestStratTime) {
                bestStratTime = p.strategyTime;
                bestStratPits = p.totalPits;
                bestStratTyre = p.tyre;
            }
            if (p.pitTime > 0 && p.pitTime < minPitTime) minPitTime = p.pitTime;
            if (p.pitLoss !== null && p.pitLoss > 0 && p.pitLoss < minPitLoss) minPitLoss = p.pitLoss;
            if (p.avgTemp > 0) {
                totalStintTemps += p.avgTemp;
                stintTempCount++;
            }
        });

        if (minPitLoss === Infinity) minPitLoss = 0;
        if (minPitTime === Infinity) minPitTime = 0;
        if (minAvgLap === Infinity) minAvgLap = 0;

        const overallAvgTemp = stintTempCount > 0 ? totalStintTemps / stintTempCount : 0;
        const overallAvgTempStr = overallAvgTemp > 0 ? ` ${overallAvgTemp.toFixed(1)}°` : '';

        let totalWear = 0;
        let totalLapsDriven = 0;
        const bestStratTyreClean = (bestStratTyre || '').replace(/\(W\)/g, '').trim();

        trackRaces.forEach(r => {
            let sStart = 1;
            const pits = r.pits || [];
            const stops = [...pits, {lap: r.laps.length-1, tyreCond: r.finishTyres}];
            stops.forEach(stop => {
                const sEnd = stop.lap;
                const sLaps = sEnd - sStart + 1;
                if (sLaps > 0) {
                    const l = r.laps.find(x => x.idx === sStart);
                    if (l) {
                        const currentStintTyreClean = (l.tyres || '').replace(/\(W\)/g, '').trim();
                        if (currentStintTyreClean === bestStratTyreClean) {
                            const w = 100 - (stop.tyreCond || 0);
                            if (!isNaN(w)) {
                                totalWear += w;
                                totalLapsDriven += sLaps;
                            }
                        }
                    }
                }
                sStart = sEnd + 1;
            });
        });
        const avgWearPerLap = totalLapsDriven > 0 ? totalWear / totalLapsDriven : 0;
        
        let finalPits = bestStratPits;
        if (avgWearPerLap > 0) {
            const maxLapsPerStint = 82 / avgWearPerLap;
            const minPitsPossible = Math.max(0, Math.ceil(maxLaps / maxLapsPerStint) - 1);
            
            const timeWithBestStrat = (maxLaps * minAvgLap) + ((minPitTime + minPitLoss) * bestStratPits);
            const timeWithMinPits = (maxLaps * minAvgLap) + ((minPitTime + minPitLoss) * minPitsPossible);
            
            if (minPitsPossible < bestStratPits && timeWithMinPits < timeWithBestStrat) {
                finalPits = minPitsPossible;
            }
        }

        let estStintCols = '';
        const estEqualLaps = maxLaps / (finalPits + 1);
        for (let i = 1; i <= maxStints; i++) {
            if (i > finalPits + 1) { estStintCols += `<td>-</td>`; continue; }
            const projWear = avgWearPerLap * estEqualLaps;
            const left = 100 - projWear;
            let cellStyle = '';
            let tooltipText = 'Safe Wear (>= 20% left)';
            if (left < 5) { cellStyle = 'color:#ff0000; font-weight:bold;'; tooltipText = 'Critical Wear (< 5% left)'; }
            else if (left < 20) { cellStyle = 'color:#ff9800; font-weight:bold;'; tooltipText = 'High Wear (< 20% left)'; }
            else { cellStyle = 'color:#4caf50; font-weight:bold;'; }
            
            const cellAttr = createTooltipAttr(tooltipText, cellStyle);
            estStintCols += `<td ${cellAttr}>${left.toFixed(1)}%</td>`;
        }

        const estStrategyTime = (maxLaps * minAvgLap) + ((minPitTime + minPitLoss) * finalPits);
        
        let estTyreDisplay = bestStratTyre;
        if (estTyreDisplay.includes('(W)')) {
            const cleanTyre = estTyreDisplay.replace('(W)', '').trim();
            estTyreDisplay = `${cleanTyre} <span ${createTooltipAttr('Wet Compound')} style="color:var(--text-secondary);">(W)</span>`;
        }
        const tyreHtml = (typeof getTyreIconHtml === 'function') ? `${getTyreIconHtml(bestStratTyre)} ${estTyreDisplay}` : bestStratTyre;
        
        let estAvgLapAttr = '';
        if (bestLapRace) {
            let avgLapTooltipContent = '';
            const race = bestLapRace;
            if (race.driver) {
                const d = race.driver;
                avgLapTooltipContent += '<div style="text-align:left; font-weight:bold; margin-bottom:3px;">Driver Attributes (from best lap race)</div>';
                avgLapTooltipContent += '<table class="tooltip-table" style="min-width:120px;">';
                const attrs = [
                    ['Overall', d.OA], ['Concentration', d.con], ['Talent', d.tal], ['Aggressiveness', d.agr],
                    ['Experience', d.exp], ['Tech. Insight', d.tei], ['Stamina', d.sta], ['Weight', d.wei]
                ];
                attrs.forEach(([k, v]) => {
                    if (v) avgLapTooltipContent += `<tr><td>${k}</td><td>${v}</td></tr>`;
                });
                avgLapTooltipContent += '</table>';
            }
            if (race.chassis && typeof partLabels !== 'undefined') {
                if (avgLapTooltipContent) avgLapTooltipContent += '<br>';
                avgLapTooltipContent += '<div style="text-align:left; font-weight:bold; margin-bottom:3px;">Car Levels (from best lap race)</div>';
                avgLapTooltipContent += '<table class="tooltip-table" style="min-width:120px;">';
                Object.keys(partLabels).forEach(key => {
                    if (race[key]) {
                        avgLapTooltipContent += `<tr><td>${partLabels[key]}</td><td>${race[key].lvl || '-'}</td></tr>`;
                    }
                });
                avgLapTooltipContent += '</table>';
            }
            estAvgLapAttr = avgLapTooltipContent ? createTooltipAttr(avgLapTooltipContent) : '';
        }

        tableHTML += `
            <tr style="border-top: 2px solid var(--accent); background-color: rgba(76, 175, 80, 0.1);">
                <td style="font-weight:bold; color:var(--accent);">Estimated${overallAvgTempStr}</td>
                ${estStintCols}
                <td>${tyreHtml}</td>
                <td style="font-weight:bold; color:#4caf50;">${minPitTime.toFixed(2)}</td>
                <td style="font-weight:bold; color:#4caf50;">${minPitLoss.toFixed(2)}</td>
                <td ${estAvgLapAttr} style="font-weight:bold; color:#4caf50;">${fmt(minAvgLap)}</td>
                <td>${finalPits}</td>
                <td style="background-color:hsla(120, 70%, 20%, 0.8); border-radius:4px; box-shadow: 0 0 5px #4caf50; font-weight:bold;">${fmtStrategy(estStrategyTime)}</td>
            </tr>
        `;
    }

    tableHTML += `</tbody></table></div>`;

    card.innerHTML = `
        <div class="card-header">
            <h3>${selectedTrack} - Pit Times</h3>
        </div>
        ${tableHTML}
    `;
    container.appendChild(card);
}
