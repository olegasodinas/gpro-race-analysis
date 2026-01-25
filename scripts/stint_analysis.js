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

let stintCorrections = {}; // { tyreType: { stintIdx: lapOffset } }
let lastStintTrack = '';
let dragData = null;

let stintFilters = {
    riskMin: 0, riskMax: 100,
    tempMin: -5, tempMax: 65,
    groups: []
};
let isStintFilterInit = false;
let stintDataRange = { risks: [], temps: [], groups: [] };
let stintFilterDebounce = null;

window.resetStintCorrections = function() {
    console.log("Resetting corrections");
    stintCorrections = {};
    openStintAnalysis();
};

async function openStintAnalysis() {
    currentView = 'stint';

    // Auto-fetch next race data if missing (for weather overlay)
    if (typeof cachedNextRaceData === 'undefined' || !cachedNextRaceData) {
        const stored = localStorage.getItem('gpro_next_race_data');
        if (stored) {
            try {
                cachedNextRaceData = JSON.parse(stored);
            } catch (e) {}
        }
    }

    if (typeof cachedNextRaceData === 'undefined' || !cachedNextRaceData) {
        try {
            const token = localStorage.getItem('gpro_api_token') || 
                          localStorage.getItem('gpro_token') || 
                          localStorage.getItem('token') || 
                          localStorage.getItem('api_token');
            
            if (token) {
                const response = await fetch('https://gpro.net/gb/backend/api/v2/Practice', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (typeof getCountryName === 'function' && data.trackNat) {
                        const cName = getCountryName(data.trackNat);
                        if (cName && !data.trackName.includes(cName)) data.trackName = `${data.trackName} (${cName})`;
                    }
                    cachedNextRaceData = data;
                    localStorage.setItem('gpro_next_race_data', JSON.stringify(data));
                }
            }
        } catch (e) { console.warn("Auto-fetch next race failed", e); }
    }

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

    if (selectedTrack !== lastStintTrack) {
        stintCorrections = {};
    }
    if (!stintCorrections) stintCorrections = {};

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
        // Default ranges if no data
        if (stintFilters.riskMin === 0 && stintFilters.riskMax === 100 && rLen > 0) {
             // Keep full range default
        }

        // Ensure filters are within bounds
        stintFilters.riskMin = Math.max(0, Math.min(100, stintFilters.riskMin));
        stintFilters.riskMax = Math.max(0, Math.min(100, stintFilters.riskMax));
        stintFilters.tempMin = Math.max(-5, Math.min(65, stintFilters.tempMin));
        stintFilters.tempMax = Math.max(-5, Math.min(65, stintFilters.tempMax));

        const riskDatalist = `<datalist id="riskList">${stintDataRange.risks.map((r, i) => `<option value="${i}" label="${r}"></option>`).join('')}</datalist>`;
        const tempDatalist = `<datalist id="tempList">${stintDataRange.temps.map((t, i) => `<option value="${i}" label="${t.toFixed(1)}"></option>`).join('')}</datalist>`;

        const groupsHTML = stintDataRange.groups.map(g => {
            const checked = stintFilters.groups.includes(g) ? 'checked' : '';
            return `<label style="margin-right:10px; cursor:pointer; color:var(--text-secondary); font-size:0.9em; display:inline-flex; align-items:center;"><input type="checkbox" value="${g}" ${checked} onchange="toggleStintGroup('${g}')" style="margin-right:4px;"> ${g}</label>`;
        }).join('');

        const controlsHTML = `
            <div style="margin-top:15px; padding-top:10px; border-top:1px solid #555; display:flex; gap:20px; flex-wrap:wrap; align-items:center;">
                <div style="display:flex; flex-direction:column; gap:2px; flex: 1; min-width: 220px;">
                    <div style="font-weight:bold; color:var(--text-secondary); font-size:0.9em;">
                        Risk: <span id="dispRiskMin">${stintFilters.riskMin}</span> - <span id="dispRiskMax">${stintFilters.riskMax}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:5px; width: 100%;">
                        <input type="range" class="filter-slider" min="0" max="100" step="1" value="${stintFilters.riskMin}" oninput="document.getElementById('dispRiskMin').innerText=this.value; updateStintFilter('riskMin', this.value)">
                        <input type="range" class="filter-slider" min="0" max="100" step="1" value="${stintFilters.riskMax}" oninput="document.getElementById('dispRiskMax').innerText=this.value; updateStintFilter('riskMax', this.value)">
                    </div>
                    ${riskDatalist}
                </div>
                <div style="display:flex; flex-direction:column; gap:2px; flex: 1; min-width: 220px;">
                    <div style="font-weight:bold; color:var(--text-secondary); font-size:0.9em;">
                        Temp: <span id="dispTempMin">${stintFilters.tempMin.toFixed(1)}</span>° - <span id="dispTempMax">${stintFilters.tempMax.toFixed(1)}</span>°
                    </div>
                    <div style="display:flex; align-items:center; gap:5px; width: 100%;">
                        <input type="range" class="filter-slider" min="-5" max="65" step="0.5" value="${stintFilters.tempMin}" oninput="document.getElementById('dispTempMin').innerText=this.value; updateStintFilter('tempMin', this.value)">
                        <input type="range" class="filter-slider" min="-5" max="65" step="0.5" value="${stintFilters.tempMax}" oninput="document.getElementById('dispTempMax').innerText=this.value; updateStintFilter('tempMax', this.value)">
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

    // 4. Group Stints (Filter only by Group, not by Risk/Temp for inclusion)
    const tyreGroups = {};
    allRawStints.forEach(s => {
        if (stintFilters.groups.includes(s.group)) {
            if (!tyreGroups[s.tyreType]) tyreGroups[s.tyreType] = [];
            tyreGroups[s.tyreType].push(s);
        }
    });

    // Target values for projection
    const targetRisk = (stintFilters.riskMin + stintFilters.riskMax) / 2;
    const targetTemp = (stintFilters.tempMin + stintFilters.tempMax) / 2;

    Object.keys(tyreGroups).forEach(tyre => {
        const rawStints = tyreGroups[tyre] || [];
        if (rawStints.length === 0) return;

        // Calculate Regression Coefficients (Laps = C + a*Risk + b*Temp)
        // Prepare data
        const regData = rawStints.map(s => ({
            r: s.riskNum !== null ? s.riskNum : 0,
            t: s.tempNum,
            y: s.val
        }));

        // Multiple linear regression (Least Squares)
        // y = b0 + b1*x1 + b2*x2 (x1=Risk, x2=Temp)
        let n = regData.length;
        let slopeRisk = 0;
        let slopeTemp = 0;

        if (n > 2) {
            let sR=0, sT=0, sY=0;
            regData.forEach(d => { sR+=d.r; sT+=d.t; sY+=d.y; });
            const mR = sR/n; const mT = sT/n; const mY = sY/n;

            let Srr=0, Stt=0, Srt=0, Sry=0, Sty=0;
            regData.forEach(d => {
                Srr += (d.r - mR)**2;
                Stt += (d.t - mT)**2;
                Srt += (d.r - mR)*(d.t - mT);
                Sry += (d.r - mR)*(d.y - mY);
                Sty += (d.t - mT)*(d.y - mY);
            });

            const det = Srr * Stt - Srt * Srt;
            if (Math.abs(det) > 0.0001) {
                slopeRisk = (Sry * Stt - Sty * Srt) / det;
                slopeTemp = (Sty * Srr - Sry * Srt) / det;
            } else {
                // Fallback to simple regression if determinant is close to 0
                if (Srr > 0.1) slopeRisk = Sry / Srr;
                if (Stt > 0.1) slopeTemp = Sty / Stt;
            }
        }
        
        // Enforce domain knowledge: Higher Risk should NOT increase laps (Slope <= 0)
        if (slopeRisk > 0) slopeRisk = 0;

        // Project stints
        const projectedStints = rawStints.map(s => {
            const r = s.riskNum !== null ? s.riskNum : 0;
            const t = s.tempNum;
            // Adjustment: Target - Actual. 
            // If Slope is negative (higher risk -> lower laps), and Target > Actual, we expect lower laps.
            // Formula: L_proj = L_act + Slope * (Target - Actual)
            const adjLaps = s.val + slopeRisk * (targetRisk - r) + slopeTemp * (targetTemp - t);
            
            // Adjust Fuel (assume fuel per lap is constant, so total fuel changes with laps)
            const fuelPerLap = s.fuel / s.val;
            const adjFuel = adjLaps * fuelPerLap;

            return { ...s, val: adjLaps, fuel: adjFuel, isProjected: true };
        });

        const capacities = projectedStints.map(s => s.val);
        const minCap = Math.min(...capacities);
        const maxCap = Math.max(...capacities);
        const avgCap = capacities.reduce((a,b)=>a+b,0) / capacities.length;

        // Calculate min/max fuel consumption per lap
        let minFuelPerLap = Infinity;
        let maxFuelPerLap = 0;
        projectedStints.forEach(s => {
            const fpl = s.fuel / s.val;
            if (fpl < minFuelPerLap) minFuelPerLap = fpl;
            if (fpl > maxFuelPerLap) maxFuelPerLap = fpl;
        });

        const minStint = projectedStints.find(s => s.val === minCap);
        const maxStint = projectedStints.find(s => s.val === maxCap);

        const card = document.createElement('div');
        card.className = 'card';
        card.style.gridColumn = '1 / -1';
        
        let visualHTML = `<div style="position:relative; width:100%; margin-top:20px; height:90px; background:#333; border-radius:4px; overflow:hidden;">`;
        
        // Draw Grid lines for every 10 laps
        for(let l=10; l<raceDistance; l+=10) {
            const left = (l / raceDistance) * 100;
            visualHTML += `<div style="position:absolute; left:${left}%; top:0; bottom:0; border-left:1px solid #555;"><span style="position:absolute; top:2px; left:2px; font-size:0.7em; color:#777;">${l}</span></div>`;
        }

        let showWeatherOverlay = false;
        if (typeof cachedNextRaceData !== 'undefined' && cachedNextRaceData && cachedNextRaceData.weather && cachedNextRaceData.trackName) {
             const clean = (name) => name.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
             const cTrack = clean(cachedNextRaceData.trackName);
             const sTrack = clean(selectedTrack);
             
             if (cTrack && sTrack && (cTrack === sTrack || cTrack.includes(sTrack) || sTrack.includes(cTrack))) {
                 showWeatherOverlay = true;
             }
        }

        if (showWeatherOverlay) {
             const w = cachedNextRaceData.weather;
             for(let q=1; q<=4; q++) {
                 const tLow = w[`raceQ${q}TempLow`];
                 const tHigh = w[`raceQ${q}TempHigh`];
                 if (tLow !== undefined && tHigh !== undefined) {
                     const avg = (tLow + tHigh) / 2;
                     const left = (q-1) * 25;
                     visualHTML += `<div style="position:absolute; left:${left}%; width:25%; top:0; bottom:0; border-right:1px dashed rgba(84, 180, 0, 1); pointer-events:none; z-index:0;"><div style="position:absolute; bottom:2px; width:100%; text-align:center; font-size:0.9em; font-weight:bold; color:rgba(84, 180, 0, 1);">Q${q} ${avg.toFixed(1)}°</div></div>`;
                 }
             }
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
                const adjustedMin = minCap + correction;
                const adjustedMax = maxCap + correction;
                
                const projectedWear = adjustedLaps * (82 / avgCap);
                const projectedLeft = 100 - projectedWear;
                const lapsDisplay = (Math.abs(adjustedMax - adjustedMin) < 0.1) ? adjustedLaps.toFixed(1) : `${adjustedMin.toFixed(1)}-${adjustedMax.toFixed(1)}`;

                visualHTML += `<div class="stint-green-bar" style="position:absolute; left:${gLeft}%; width:${gW}%; top:30px; height:30px; background:var(--stint-head-bg); opacity:0.8; display:flex; align-items:center; justify-content:center; font-size:14px; color:#fff; white-space:nowrap; overflow:hidden;" title="Driving: Laps ${greenStart.toFixed(1)} - ${greenEnd.toFixed(1)}">
                    ${lapsDisplay} Laps to ${projectedLeft.toFixed(0)}%
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
                
                const rStartStr = redStart.toFixed(0);
                const rEndStr = redEnd.toFixed(0);
                let lapLabelsHTML = '';
                let fuelLabelsHTML = '';

                if (rStartStr === rEndStr) {
                    lapLabelsHTML = `<div class="stint-lbl-lap-merged" style="position:absolute; top:-18px; left:50%; transform:translateX(-50%); font-size:0.75em; color:#ccc; white-space:nowrap; pointer-events:none;">${rStartStr}</div>`;
                    fuelLabelsHTML = `<div class="stint-lbl-fuel-merged" style="position:absolute; bottom:-18px; left:50%; transform:translateX(-50%); font-size:0.7em; color:#ccc; white-space:nowrap; pointer-events:none;">${fMinL.toFixed(1)}-${fMaxL.toFixed(1)}L</div>`;
                } else {
                    lapLabelsHTML = `<div class="stint-lbl-lap-start" style="position:absolute; top:-18px; left:0; transform:translateX(-50%); font-size:0.75em; color:#ccc; white-space:nowrap; pointer-events:none;">${rStartStr}</div>
                    <div class="stint-lbl-lap-end" style="position:absolute; top:-18px; right:0; transform:translateX(50%); font-size:0.75em; color:#ccc; white-space:nowrap; pointer-events:none;">${rEndStr}</div>`;
                    
                    if (rW < 15) {
                        fuelLabelsHTML = `<div class="stint-lbl-fuel-min" style="position:absolute; bottom:-18px; right:50%; margin-right:18px; font-size:0.7em; color:#ccc; white-space:nowrap; pointer-events:none;">${fMinL.toFixed(1)}-${fMaxL.toFixed(1)}L</div>
                        <div class="stint-lbl-fuel-max" style="position:absolute; bottom:-18px; left:50%; margin-left:18px; font-size:0.7em; color:#ccc; white-space:nowrap; pointer-events:none;">${fMinR.toFixed(1)}-${fMaxR.toFixed(1)}L</div>`;
                    } else {
                        fuelLabelsHTML = `<div class="stint-lbl-fuel-min" style="position:absolute; bottom:-18px; left:0; transform:translateX(-50%); font-size:0.7em; color:#ccc; white-space:nowrap; pointer-events:none;">${fMinL.toFixed(1)}-${fMaxL.toFixed(1)}L</div>
                        <div class="stint-lbl-fuel-max" style="position:absolute; bottom:-18px; right:0; transform:translateX(50%); font-size:0.7em; color:#ccc; white-space:nowrap; pointer-events:none;">${fMinR.toFixed(1)}-${fMaxR.toFixed(1)}L</div>`;
                    }
                }

                visualHTML += `<div onmousedown="startStintDrag(event, '${safeTyre}', ${stintCount}, ${raceDistance}, this)" ontouchstart="startStintDrag(event, '${safeTyre}', ${stintCount}, ${raceDistance}, this)" 
                    data-base-start="${currentPos}" data-min-cap="${minCap}" data-max-cap="${maxCap}" data-avg-cap="${avgCap}" data-min-fuel="${minFuelPerLap}" data-max-fuel="${maxFuelPerLap}"
                    style="box-sizing:border-box; cursor:grab; position:absolute; left:${rCenter}%; width:${rW}%; min-width:10px; top:25px; height:40px; background:#f44336; opacity:.8; border-left:1px solid #fff; border-right:1px solid #fff; z-index:3; display:flex; align-items:center; justify-content:center; transform:translateX(-50%);" title="Pit Window: Laps ${rStartStr} - ${rEndStr} (18% Wear)">
                    ${lapLabelsHTML}
                    <div style="font-size:0.9em; font-weight:bold; color:white; pointer-events:none;">S${stintCount}</div>
                    ${fuelLabelsHTML}
                </div>`;
            }

            const center = (wMin + wMax) / 2;
            currentPos = center;
            prevMax = wMax;

            // Mark Center
            if (wMin !== wMax && center >= 0 && center <= raceDistance) {
                const cLeft = (center / raceDistance) * 100;
                visualHTML += `<div style="position:absolute; left:${cLeft}%; top:5px; height:80px; border-left:2px dashed gray; z-index:2; transform:translateX(-50%);" title="Center Projection: Lap ${center.toFixed(1)}"></div>`;
            }
        }

        visualHTML += `</div>`;
        
        // Legend / Scale
        visualHTML += `<div style="display:flex; justify-content:space-between; margin-top:15px; font-size:0.8em; color:var(--text-secondary);">
            <span>Start</span>
            <span>Race Distance: ${raceDistance} Laps</span>
        </div>`;

        const minInfo = minStint ? `${minStint.weather}, ${minStint.fuel.toFixed(1)}L, ${minStint.group}, Risk:${minStint.risk}` : '?';
        const maxInfo = maxStint ? `${maxStint.weather}, ${maxStint.fuel.toFixed(1)}L, ${maxStint.group}, Risk:${maxStint.risk}` : '?';
        const statText = `Min: ${minCap.toFixed(1)} <span style="font-size:0.85em; color:var(--text-secondary);">(${minInfo})</span> | Avg: ${avgCap.toFixed(1)} | Max: ${maxCap.toFixed(1)} <span style="font-size:0.85em; color:var(--text-secondary);">(${maxInfo})</span> <span style="color:var(--accent); font-size:0.8em; margin-left:5px;">(Projected to Risk ${targetRisk.toFixed(0)}, Temp ${targetTemp.toFixed(1)}°)</span>`;

        card.innerHTML = `
            <div class="card-header"><h3>${getTyreIconHtml(tyre)} ${tyre} <span style="font-size:0.8em; font-weight:normal;">(Based on ${capacities.length} stints)</span></h3></div>
            <div style="padding:10px;">
                <div class="stat-row"><span class="stat-label">Laps to 18% tyres</span><span class="stat-val">${statText}</span></div>
                ${visualHTML}
                <div style="margin-top:10px; font-size:0.85em; color:var(--text-secondary);">
                    <span style="display:inline-block; width:12px; height:12px; background:var(--stint-head-bg); margin-right:5px;"></span>Safe Zone
                    <span style="display:inline-block; width:12px; height:12px; background:#f44336; margin-left:15px; margin-right:5px;"></span>Pit Window (18% Wear)
                    <span style="display:inline-block; width:12px; height:12px; border-left:2px dashed yellow; margin-left:15px; margin-right:5px;"></span>Projected Pit (Center)
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function startStintDrag(e, tyre, stintIdx, raceDist, el) {
    if (e.cancelable) e.preventDefault();
    
    const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;

    dragData = {
        tyre: tyre,
        stintIdx: stintIdx,
        raceDist: raceDist,
        startX: clientX,
        initialOffset: (stintCorrections[tyre] && stintCorrections[tyre][stintIdx]) || 0,
        el: el,
        containerWidth: el.parentElement.offsetWidth
    };
    
    if (e.type === 'touchstart') {
        document.addEventListener('touchmove', handleStintDrag, { passive: false });
        document.addEventListener('touchend', stopStintDrag);
    } else {
        document.addEventListener('mousemove', handleStintDrag);
        document.addEventListener('mouseup', stopStintDrag);
    }
    el.style.cursor = 'grabbing';
}

function handleStintDrag(e) {
    if (!dragData) return;
    if (e.cancelable) e.preventDefault();

    const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
    const dx = clientX - dragData.startX;
    dragData.el.style.transform = `translateX(calc(-50% + ${dx}px))`;

    // Real-time calculation update
    const lapsShift = (dx / dragData.containerWidth) * dragData.raceDist;
    const currentCorrection = dragData.initialOffset + lapsShift;

    const baseStart = parseFloat(dragData.el.dataset.baseStart);
    const minCap = parseFloat(dragData.el.dataset.minCap);
    const maxCap = parseFloat(dragData.el.dataset.maxCap);
    const avgCap = parseFloat(dragData.el.dataset.avgCap);
    const minFuel = parseFloat(dragData.el.dataset.minFuel);
    const maxFuel = parseFloat(dragData.el.dataset.maxFuel);

    const newMinLap = Math.round(baseStart + minCap + currentCorrection);
    const newMaxLap = Math.round(baseStart + maxCap + currentCorrection);

    const newLapsL = minCap + currentCorrection;
    const newLapsR = maxCap + currentCorrection;
    const newLapsAvg = avgCap + currentCorrection;

    const newFMinL = newLapsL * minFuel;
    const newFMaxL = newLapsL * maxFuel;
    const newFMinR = newLapsR * minFuel;
    const newFMaxR = newLapsR * maxFuel;

    // Update Red Bar Labels
    const lblLapMerged = dragData.el.querySelector('.stint-lbl-lap-merged');
    if (lblLapMerged) lblLapMerged.textContent = newMinLap.toFixed(0);
    else {
        const lblLapStart = dragData.el.querySelector('.stint-lbl-lap-start');
        const lblLapEnd = dragData.el.querySelector('.stint-lbl-lap-end');
        if (lblLapStart) lblLapStart.textContent = newMinLap.toFixed(0);
        if (lblLapEnd) lblLapEnd.textContent = newMaxLap.toFixed(0);
    }

    const lblFuelMerged = dragData.el.querySelector('.stint-lbl-fuel-merged');
    if (lblFuelMerged) lblFuelMerged.textContent = `${newFMinL.toFixed(1)}-${newFMaxL.toFixed(1)}L`;
    else {
        const lblFuelMin = dragData.el.querySelector('.stint-lbl-fuel-min');
        const lblFuelMax = dragData.el.querySelector('.stint-lbl-fuel-max');
        if (lblFuelMin) lblFuelMin.textContent = `${newFMinL.toFixed(1)}-${newFMaxL.toFixed(1)}L`;
        if (lblFuelMax) lblFuelMax.textContent = `${newFMinR.toFixed(1)}-${newFMaxR.toFixed(1)}L`;
    }

    // Update Green Bar (Previous Sibling)
    const greenBar = dragData.el.previousElementSibling;
    if (greenBar && greenBar.classList.contains('stint-green-bar')) {
        const projectedWear = newLapsAvg * (82 / avgCap);
        const projectedLeft = 100 - projectedWear;
        const lapsDisplay = (Math.abs(newLapsR - newLapsL) < 0.1) ? newLapsAvg.toFixed(1) : `${newLapsL.toFixed(1)}-${newLapsR.toFixed(1)}`;
        greenBar.innerHTML = `${lapsDisplay} Laps to ${projectedLeft.toFixed(0)}%`;
    }
}

function stopStintDrag(e) {
    if (!dragData) return;
    
    const clientX = (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0].clientX : e.clientX;
    const dx = clientX - dragData.startX;
    const lapsShift = (dx / dragData.containerWidth) * dragData.raceDist;
    
    const newOffset = Math.round(dragData.initialOffset + lapsShift);
    
    if (!stintCorrections[dragData.tyre]) stintCorrections[dragData.tyre] = {};
    stintCorrections[dragData.tyre][dragData.stintIdx] = newOffset;
    
    document.removeEventListener('mousemove', handleStintDrag);
    document.removeEventListener('mouseup', stopStintDrag);
    document.removeEventListener('touchmove', handleStintDrag);
    document.removeEventListener('touchend', stopStintDrag);
    
    dragData = null;
    
    // Re-render to update all positions
    openStintAnalysis();
}

function updateStintFilter(key, val) {
    stintFilters[key] = parseFloat(val);
    if (stintFilterDebounce) clearTimeout(stintFilterDebounce);
    stintFilterDebounce = setTimeout(() => {
        openStintAnalysis();
    }, 100);
}

function toggleStintGroup(group) {
    const idx = stintFilters.groups.indexOf(group);
    if (idx === -1) stintFilters.groups.push(group);
    else stintFilters.groups.splice(idx, 1);
    localStorage.setItem('gpro_stint_groups', JSON.stringify(stintFilters.groups));
    openStintAnalysis();
}
