/*
    GPRO Race Analysis - Stint Analysis Module
*/

let stintCorrections = {}; // { tyreType: { stintIdx: lapOffset } }
let lastStintTrack = '';
let dragData = null;

let stintFilters = {
    riskMin: 0, riskMax: 100,
    tempMin: 0, tempMax: 60,
    groups: []
};
let isStintFilterInit = false;
let stintDataRange = { risks: [], temps: [], groups: [] };
let stintFilterDebounce = null;

function openStintAnalysis() {
    currentView = 'stint';
    const container = document.getElementById('cardsContainer');
    
    const select = document.getElementById('trackSelect');
    const selectedTrack = select ? select.value : 'all';
    
    // Filter data for track
    const trackRaces = allRaceData.filter(r => r.trackName === selectedTrack);
    
    // 1. Extract all raw stints first to determine ranges
    const allRawStints = [];
    const riskSet = new Set();
    const tempSet = new Set();
    const groupSet = new Set();

    if (trackRaces.length > 0) {
        trackRaces.forEach(r => {
            if (!r.laps || r.laps.length === 0) return;
            const pits = r.pits || [];
            const totalLaps = r.laps.length - 1;
            const stops = [...pits, { lap: totalLaps, fuelLeft: (r.finishFuel/180)*100, tyreCond: r.finishTyres, refilledTo: 0, isFinish: true }];
            
            let startLap = 1;
            let currentFuel = r.startFuel;

            stops.forEach(stop => {
                const endLap = stop.lap;
                const lapsInStint = endLap - startLap + 1;
                if (lapsInStint > 3) {
                    const tyreUsed = 100 - stop.tyreCond;
                    const wearPerLap = tyreUsed / lapsInStint;
                    let fuelAtEnd = stop.isFinish ? r.finishFuel : (stop.fuelLeft / 100) * 180;
                    const fuelUsed = currentFuel - fuelAtEnd;
                    const avgFuelPerLap = fuelUsed / lapsInStint;

                    if (wearPerLap > 0 && avgFuelPerLap > 0) {
                        const lapsTo18 = 82 / wearPerLap;
                        const fuelForStint = lapsTo18 * avgFuelPerLap;
                        const tyreType = r.laps[startLap] ? r.laps[startLap].tyres : 'Unknown';
                        
                        let tSum = 0, count = 0, hasRain = false, hasCloud = false, hasSun = false;
                        for(let i=startLap; i<=endLap; i++) {
                            if (r.laps[i]) {
                                tSum += r.laps[i].temp || 0;
                                count++;
                                const w = (r.laps[i].weather || '').toLowerCase();
                                if (w.includes('rain')) hasRain = true;
                                else if (w.includes('cloud')) hasCloud = true;
                                else if (w.includes('sun') || w.includes('clear')) hasSun = true;
                            }
                        }
                        const avgT = count > 0 ? tSum / count : 0;
                        const icon = hasRain ? '🌧️' : (hasCloud && hasSun ? '⛅' : (hasCloud ? '☁️' : '☀️'));
                        const weatherStr = `${icon} ${avgT.toFixed(1)}°`;
                        
                        const g = (r.group || r.groupName || 'Unknown');
                        let groupKey = g;
                        const gl = g.toLowerCase();
                        if (gl.includes('elite')) groupKey = 'Elite';
                        else if (gl.includes('master')) groupKey = 'Master';
                        else if (gl.includes('pro')) groupKey = 'Pro';
                        else if (gl.includes('amateur')) groupKey = 'Amateur';
                        else if (gl.includes('rookie')) groupKey = 'Rookie';

                        const risk = hasRain ? ((r.clearWetRisk !== undefined && r.clearWetRisk !== '') ? r.clearWetRisk : '-') : ((r.clearDryRisk !== undefined && r.clearDryRisk !== '') ? r.clearDryRisk : '-');
                        const riskNum = parseInt(risk);
                        const validRisk = !isNaN(riskNum) ? riskNum : 0;

                        riskSet.add(validRisk);
                        tempSet.add(avgT);
                        groupSet.add(groupKey);

                        allRawStints.push({ tyreType, val: lapsTo18, weather: weatherStr, fuel: fuelForStint, group: groupKey, risk, riskNum: validRisk, tempNum: avgT });
                    }
                }
                if (!stop.isFinish) {
                    let fuelAtEnd = (stop.fuelLeft / 100) * 180;
                    currentFuel = (stop.refilledTo > 0 && stop.refilledTo > fuelAtEnd) ? stop.refilledTo : fuelAtEnd;
                }
                startLap = endLap + 1;
            });
        });
    }
    stintDataRange.risks = Array.from(riskSet).sort((a,b)=>a-b);
    stintDataRange.temps = Array.from(tempSet).sort((a,b)=>a-b);
    stintDataRange.groups = Array.from(groupSet).sort();

    // Determine if we need a full rebuild (track change or first load of view)
    const isFullRebuild = (selectedTrack !== lastStintTrack) || !document.getElementById('stintAnalysisHeader');

    if (isFullRebuild) {
        container.innerHTML = '';
    } else {
        // Clear everything except header
        const header = document.getElementById('stintAnalysisHeader');
        while (header.nextSibling) {
            header.nextSibling.remove();
        }
    }

    let headerDiv;
    if (isFullRebuild) {
        headerDiv = document.createElement('div');
        headerDiv.id = 'stintAnalysisHeader';
        headerDiv.style.gridColumn = '1 / -1';
        headerDiv.className = 'card';
        headerDiv.innerHTML = `
            <div class="card-header">
                <h3>Stint Analysis & Projection</h3>
                <div class="subtitle">Projected pit windows based on tyre wear to 18%</div>
                <div style="margin-top:10px;">
                    <button onclick="returnToDashboard()" style="padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
                    <button onclick="resetStintCorrections()" style="margin-left:10px; padding:5px 10px; cursor:pointer; background:#607d8b; color:white; border:none; border-radius:4px;">Reset Corrections</button>
                </div>
            </div>
        `;
        container.appendChild(headerDiv);
    } else {
        headerDiv = document.getElementById('stintAnalysisHeader');
    }

    // Initialize filters if rebuild
    if (isFullRebuild && stintDataRange.risks.length > 0) {
        stintFilters.riskMin = stintDataRange.risks[0];
        stintFilters.riskMax = stintDataRange.risks[stintDataRange.risks.length - 1];
        stintFilters.tempMin = Math.floor(stintDataRange.temps[0]);
        stintFilters.tempMax = Math.ceil(stintDataRange.temps[stintDataRange.temps.length - 1]);
        
        const savedGroups = localStorage.getItem('gpro_stint_groups');
        if (savedGroups) {
            try {
                stintFilters.groups = JSON.parse(savedGroups);
            } catch (e) {
                stintFilters.groups = [...stintDataRange.groups];
            }
        } else {
            stintFilters.groups = [...stintDataRange.groups];
        }
    }

    if (selectedTrack === 'all') {
        const msg = document.createElement('div');
        msg.className = 'card';
        msg.style.gridColumn = '1 / -1';
        msg.innerHTML = `<div style="padding:20px; text-align:center;">Please select a specific track from the dropdown above to view Stint Analysis.</div>`;
        container.appendChild(msg);
        return;
    }

    if (allRawStints.length === 0) {
        container.innerHTML += `<div class="card" style="grid-column:1/-1; padding:20px;">No data found for ${selectedTrack}.</div>`;
        return;
    }

    // Determine Race Distance (Max laps seen)
    let raceDistance = 0;
    trackRaces.forEach(r => {
        if (r.laps && r.laps.length > raceDistance) raceDistance = r.laps.length - 1;
    });
    if (raceDistance === 0) raceDistance = 80; // Fallback

    // 3. Add Filter Controls to Header
    if (isFullRebuild) {
        const rLen = stintDataRange.risks.length;
        const tLen = stintDataRange.temps.length;
        const rMaxIdx = rLen > 0 ? rLen - 1 : 0;
        const tMaxIdx = tLen > 0 ? tLen - 1 : 0;

        // Find indices for current filters
        let rMinIdx = 0, rCurMaxIdx = rMaxIdx;
        let tMinIdx = 0, tCurMaxIdx = tMaxIdx;
        
        // Simple find closest
        if (rLen > 0) {
            rMinIdx = stintDataRange.risks.findIndex(v => v >= stintFilters.riskMin);
            if (rMinIdx === -1) rMinIdx = 0;
            let rMaxFound = stintDataRange.risks.findIndex(v => v > stintFilters.riskMax);
            rCurMaxIdx = rMaxFound === -1 ? rMaxIdx : Math.max(0, rMaxFound - 1);
        }
        if (tLen > 0) {
            tMinIdx = stintDataRange.temps.findIndex(v => v >= stintFilters.tempMin);
            if (tMinIdx === -1) tMinIdx = 0;
            let tMaxFound = stintDataRange.temps.findIndex(v => v > stintFilters.tempMax);
            tCurMaxIdx = tMaxFound === -1 ? tMaxIdx : Math.max(0, tMaxFound - 1);
        }

        const riskDatalist = `<datalist id="riskList">${stintDataRange.risks.map((r, i) => `<option value="${i}" label="${r}"></option>`).join('')}</datalist>`;
        const tempDatalist = `<datalist id="tempList">${stintDataRange.temps.map((t, i) => `<option value="${i}" label="${t.toFixed(1)}"></option>`).join('')}</datalist>`;

        const groupsHTML = stintDataRange.groups.map(g => {
            const checked = stintFilters.groups.includes(g) ? 'checked' : '';
            return `<label style="margin-right:10px; cursor:pointer; color:var(--text-secondary); font-size:0.9em; display:inline-flex; align-items:center;"><input type="checkbox" value="${g}" ${checked} onchange="toggleStintGroup('${g}')" style="margin-right:4px;"> ${g}</label>`;
        }).join('');

        const controlsHTML = `
            <div style="margin-top:15px; padding-top:10px; border-top:1px solid #555; display:flex; gap:20px; flex-wrap:wrap; align-items:center;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <div style="font-weight:bold; color:var(--text-secondary); font-size:0.9em;">
                        Risk: <span id="dispRiskMin">${stintFilters.riskMin}</span> - <span id="dispRiskMax">${stintFilters.riskMax}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="range" class="filter-slider" min="0" max="${rMaxIdx}" value="${rMinIdx}" list="riskList" oninput="updateStintFilterFromIndex('riskMin', this.value)">
                        <input type="range" class="filter-slider" min="0" max="${rMaxIdx}" value="${rCurMaxIdx}" list="riskList" oninput="updateStintFilterFromIndex('riskMax', this.value)">
                    </div>
                    ${riskDatalist}
                </div>
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <div style="font-weight:bold; color:var(--text-secondary); font-size:0.9em;">
                        Temp: <span id="dispTempMin">${stintFilters.tempMin.toFixed(1)}</span>° - <span id="dispTempMax">${stintFilters.tempMax.toFixed(1)}</span>°
                    </div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="range" class="filter-slider" min="0" max="${tMaxIdx}" value="${tMinIdx}" list="tempList" oninput="updateStintFilterFromIndex('tempMin', this.value)">
                        <input type="range" class="filter-slider" min="0" max="${tMaxIdx}" value="${tCurMaxIdx}" list="tempList" oninput="updateStintFilterFromIndex('tempMax', this.value)">
                    </div>
                    ${tempDatalist}
                </div>
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <div style="font-weight:bold; color:var(--text-secondary); font-size:0.9em;">Groups:</div>
                    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">${groupsHTML}</div>
                </div>
            </div>
        `;
        headerDiv.querySelector('.card-header').insertAdjacentHTML('beforeend', controlsHTML);
        lastStintTrack = selectedTrack;
    }

    // 4. Filter and Group Stints
    const tyreGroups = {};
    allRawStints.forEach(s => {
        const r = s.riskNum !== null ? s.riskNum : -1; // Include unknown risk? Let's assume yes if filter is wide, but strict if narrowed.
        // Actually, if risk is '-', riskNum is null.
        // If filter is 0-100, we should probably include nulls if user hasn't touched it, but strict filtering is better.
        // Let's treat null as 0 for filtering simplicity or just check bounds.
        const rVal = r !== -1 ? r : 0;
        
        if (rVal >= stintFilters.riskMin && rVal <= stintFilters.riskMax &&
            s.tempNum >= stintFilters.tempMin && s.tempNum <= stintFilters.tempMax &&
            stintFilters.groups.includes(s.group)) {
            
            if (!tyreGroups[s.tyreType]) tyreGroups[s.tyreType] = [];
            tyreGroups[s.tyreType].push(s);
        }
    });

    Object.keys(tyreGroups).forEach(tyre => {
        const stints = tyreGroups[tyre] || [];
        if (stints.length === 0) return;
        const capacities = stints.map(s => s.val);
        const minCap = Math.min(...capacities);
        const maxCap = Math.max(...capacities);
        const avgCap = capacities.reduce((a,b)=>a+b,0) / capacities.length;

        // Calculate min/max fuel consumption per lap
        let minFuelPerLap = Infinity;
        let maxFuelPerLap = 0;
        stints.forEach(s => {
            const fpl = s.fuel / s.val;
            if (fpl < minFuelPerLap) minFuelPerLap = fpl;
            if (fpl > maxFuelPerLap) maxFuelPerLap = fpl;
        });

        const minStint = stints.find(s => s.val === minCap);
        const maxStint = stints.find(s => s.val === maxCap);

        const card = document.createElement('div');
        card.className = 'card';
        card.style.gridColumn = '1 / -1';
        
        let visualHTML = `<div style="position:relative; width:100%; margin-top:20px; height:60px; background:#333; border-radius:4px;">`;
        
        // Draw Grid lines for every 10 laps
        for(let l=10; l<raceDistance; l+=10) {
            const left = (l / raceDistance) * 100;
            visualHTML += `<div style="position:absolute; left:${left}%; top:0; bottom:0; border-left:1px solid #555;"><span style="position:absolute; top:2px; left:2px; font-size:0.7em; color:#777;">${l}</span></div>`;
        }

        let currentPos = 0;
        let prevMax = 0;
        let stintCount = 0;
        
        while (currentPos < raceDistance && stintCount < 10) {
            stintCount++;
            
            let correction = 0;
            if (stintCorrections[tyre] && stintCorrections[tyre][stintCount]) {
                correction = stintCorrections[tyre][stintCount];
            }

            const wMin = Math.round(currentPos + minCap + correction);
            const wMax = Math.round(currentPos + maxCap + correction);
            
            // Green Bar (Safe driving)
            const greenStart = prevMax;
            const greenEnd = wMin;
            
            const vGreenStart = Math.min(greenStart, raceDistance);
            const vGreenEnd = Math.min(greenEnd, raceDistance);
            const vGreenWidth = vGreenEnd - vGreenStart;
            
            if (vGreenWidth > 0) {
                const gLeft = (vGreenStart / raceDistance) * 100;
                const gW = (vGreenWidth / raceDistance) * 100;
                const adjustedLaps = avgCap + correction;
                
                const projectedWear = adjustedLaps * (82 / avgCap);
                const projectedLeft = 100 - projectedWear;

                visualHTML += `<div style="position:absolute; left:${gLeft}%; width:${gW}%; top:15px; height:30px; background:var(--stint-head-bg); opacity:0.8; display:flex; align-items:center; justify-content:center; font-size:18px; color:#fff; white-space:nowrap; overflow:hidden;" title="Driving: Laps ${greenStart.toFixed(1)} - ${greenEnd.toFixed(1)}">
                    ${adjustedLaps.toFixed(1)} Laps to ${projectedLeft.toFixed(0)}%
                </div>`;
            }

            // Red Bar (Pit Window)
            const redStart = wMin;
            const redEnd = wMax;
            
            const vRedStart = Math.min(redStart, raceDistance);
            const vRedEnd = Math.min(redEnd, raceDistance);
            const vRedWidth = vRedEnd - vRedStart;
            
            if (vRedEnd >= vRedStart && vRedStart < raceDistance) {
                const rLeft = (vRedStart / raceDistance) * 100;
                const rW = (vRedWidth / raceDistance) * 100;
                const rCenter = rLeft + (rW / 2);
                
                const lapsL = minCap + correction;
                const lapsR = maxCap + correction;
                const fMinL = lapsL * minFuelPerLap;
                const fMaxL = lapsL * maxFuelPerLap;
                const fMinR = lapsR * minFuelPerLap;
                const fMaxR = lapsR * maxFuelPerLap;

                const safeTyre = tyre.replace(/'/g, "\\'");
                
                // Adjust right label position if near edge
                const isNearRight = (rLeft + rW) > 85;
                const rightLabelStyle = isNearRight 
                    ? 'position:absolute; right:0; top:40px; font-size:0.7em; color:#ccc; white-space:nowrap; pointer-events:none; text-align:right;' 
                    : 'position:absolute; right:0; top:0; bottom:0; transform:translateX(110%); display:flex; align-items:center; font-size:0.7em; color:#ccc; white-space:nowrap; pointer-events:none;';

                const rStartStr = redStart.toFixed(0);
                const rEndStr = redEnd.toFixed(0);
                let lapLabelsHTML = '';
                if (rStartStr === rEndStr) {
                    lapLabelsHTML = `<div style="position:absolute; top:-18px; left:50%; transform:translateX(-50%); font-size:0.75em; color:#ccc; white-space:nowrap; pointer-events:none;">${rStartStr}</div>`;
                } else {
                    lapLabelsHTML = `<div style="position:absolute; top:-18px; left:0; transform:translateX(-50%); font-size:0.75em; color:#ccc; white-space:nowrap; pointer-events:none;">${rStartStr}</div>
                    <div style="position:absolute; top:-18px; right:0; transform:translateX(50%); font-size:0.75em; color:#ccc; white-space:nowrap; pointer-events:none;">${rEndStr}</div>`;
                }

                visualHTML += `<div onmousedown="startStintDrag(event, '${safeTyre}', ${stintCount}, ${raceDistance}, this)" style="box-sizing:border-box; cursor:grab; position:absolute; left:${rCenter}%; width:${rW}%; min-width:10px; top:10px; height:40px; background:#f44336; opacity:.8; border-left:1px solid #fff; border-right:1px solid #fff; z-index:3; display:flex; align-items:center; justify-content:center; transform:translateX(-50%);" title="Pit Window: Laps ${rStartStr} - ${rEndStr} (18% Wear)">
                    <div style="position:absolute; left:0; top:0; bottom:0; transform:translateX(-110%); display:flex; align-items:center; font-size:0.7em; color:#ccc; white-space:nowrap; pointer-events:none;">${fMinL.toFixed(1)}-${fMaxL.toFixed(1)}L</div>
                    ${lapLabelsHTML}
                    <div style="font-size:0.9em; font-weight:bold; color:white; pointer-events:none;">S${stintCount}</div>
                    <div style="${rightLabelStyle}">${fMinR.toFixed(1)}-${fMaxR.toFixed(1)}L</div>
                </div>`;
            }

            const center = (wMin + wMax) / 2;
            currentPos = center;
            prevMax = wMax;

            // Mark Center
            if (center >= 0 && center <= raceDistance) {
                const cLeft = (center / raceDistance) * 100;
                visualHTML += `<div style="position:absolute; left:${cLeft}%; top:5px; height:50px; border-left:2px dashed white; z-index:2; transform:translateX(-50%);" title="Center Projection: Lap ${center.toFixed(1)}"></div>`;
            }
        }

        visualHTML += `</div>`;
        
        // Legend / Scale
        visualHTML += `<div style="display:flex; justify-content:space-between; margin-top:5px; font-size:0.8em; color:var(--text-secondary);">
            <span>Start</span>
            <span>Race Distance: ${raceDistance} Laps</span>
        </div>`;

        const minInfo = minStint ? `${minStint.weather}, ${minStint.fuel.toFixed(1)}L, ${minStint.group}, Risk:${minStint.risk}` : '?';
        const maxInfo = maxStint ? `${maxStint.weather}, ${maxStint.fuel.toFixed(1)}L, ${maxStint.group}, Risk:${maxStint.risk}` : '?';
        const statText = `Min: ${minCap.toFixed(1)} <span style="font-size:0.85em; color:var(--text-secondary);">(${minInfo})</span> | Avg: ${avgCap.toFixed(1)} | Max: ${maxCap.toFixed(1)} <span style="font-size:0.85em; color:var(--text-secondary);">(${maxInfo})</span>`;

        card.innerHTML = `
            <div class="card-header"><h3>${getTyreIconHtml(tyre)} ${tyre} <span style="font-size:0.8em; font-weight:normal;">(Based on ${capacities.length} stints)</span></h3></div>
            <div style="padding:10px;">
                <div class="stat-row"><span class="stat-label">Laps to 18% tires</span><span class="stat-val">${statText}</span></div>
                ${visualHTML}
                <div style="margin-top:10px; font-size:0.85em; color:var(--text-secondary);">
                    <span style="display:inline-block; width:12px; height:12px; background:var(--stint-head-bg); margin-right:5px;"></span>Safe Zone
                    <span style="display:inline-block; width:12px; height:12px; background:#f44336; margin-left:15px; margin-right:5px;"></span>Pit Window (18% Wear)
                    <span style="display:inline-block; width:12px; height:12px; border-left:2px dashed white; margin-left:15px; margin-right:5px;"></span>Projected Pit (Center)
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function startStintDrag(e, tyre, stintIdx, raceDist, el) {
    e.preventDefault();
    dragData = {
        tyre: tyre,
        stintIdx: stintIdx,
        raceDist: raceDist,
        startX: e.clientX,
        initialOffset: (stintCorrections[tyre] && stintCorrections[tyre][stintIdx]) || 0,
        el: el,
        containerWidth: el.parentElement.offsetWidth
    };
    
    document.addEventListener('mousemove', handleStintDrag);
    document.addEventListener('mouseup', stopStintDrag);
    el.style.cursor = 'grabbing';
}

function handleStintDrag(e) {
    if (!dragData) return;
    const dx = e.clientX - dragData.startX;
    dragData.el.style.transform = `translateX(calc(-50% + ${dx}px))`;
}

function stopStintDrag(e) {
    if (!dragData) return;
    
    const dx = e.clientX - dragData.startX;
    const lapsShift = (dx / dragData.containerWidth) * dragData.raceDist;
    
    const newOffset = Math.round(dragData.initialOffset + lapsShift);
    
    if (!stintCorrections[dragData.tyre]) stintCorrections[dragData.tyre] = {};
    stintCorrections[dragData.tyre][dragData.stintIdx] = newOffset;
    
    document.removeEventListener('mousemove', handleStintDrag);
    document.removeEventListener('mouseup', stopStintDrag);
    
    dragData = null;
    
    // Re-render to update all positions
    openStintAnalysis();
}

function resetStintCorrections() {
    stintCorrections = {};
    openStintAnalysis();
}

function updateStintFilter(key, val) {
    stintFilters[key] = parseFloat(val);
    if (stintFilterDebounce) clearTimeout(stintFilterDebounce);
    stintFilterDebounce = setTimeout(() => {
        openStintAnalysis();
    }, 100);
}

function updateStintFilterFromIndex(type, index) {
    let val;
    if (type.startsWith('risk')) {
        val = stintDataRange.risks[index];
    } else {
        val = stintDataRange.temps[index];
    }
    // Update display
    const dispId = 'disp' + type.charAt(0).toUpperCase() + type.slice(1);
    const el = document.getElementById(dispId);
    if(el) el.innerText = type.startsWith('temp') ? val.toFixed(1) : val;
    
    updateStintFilter(type, val);
}

function toggleStintGroup(group) {
    const idx = stintFilters.groups.indexOf(group);
    if (idx === -1) stintFilters.groups.push(group);
    else stintFilters.groups.splice(idx, 1);
    localStorage.setItem('gpro_stint_groups', JSON.stringify(stintFilters.groups));
    openStintAnalysis();
}
