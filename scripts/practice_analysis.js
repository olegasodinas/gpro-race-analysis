/*
    GPRO Practice Analysis
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

let cachedNextRaceData = null;

const countryMap = {
    "ar": "Argentina", "at": "Austria", "au": "Australia", "az": "Azerbaijan", "be": "Belgium",
    "bg": "Bulgaria", "bh": "Bahrain", "br": "Brazil", "ca": "Canada", "ch": "Switzerland",
    "cn": "China", "cz": "Czech Republic", "de": "Germany", "dk": "Denmark", "ee": "Estonia",
    "es": "Spain", "fi": "Finland", "fr": "France", "gb": "Great Britain", "gr": "Greece",
    "hr": "Croatia", "hu": "Hungary", "id": "Indonesia", "ie": "Ireland", "il": "Israel",
    "in": "India", "it": "Italy", "jp": "Japan", "kr": "South Korea", "kw": "Kuwait",
    "lt": "Lithuania", "lv": "Latvia", "mc": "Monaco", "mx": "Mexico", "my": "Malaysia",
    "nl": "Netherlands", "no": "Norway", "nz": "New Zealand", "ph": "Philippines", "pl": "Poland",
    "pt": "Portugal", "qa": "Qatar", "ro": "Romania", "ru": "Russia", "sa": "Saudi Arabia",
    "se": "Sweden", "sg": "Singapore", "si": "Slovenia", "sk": "Slovakia", "tr": "Turkey",
    "tw": "Taiwan", "ua": "Ukraine", "us": "USA", "za": "South Africa"
};

function getCountryName(code) {
    if (!code) return '';
    const lower = code.toLowerCase();
    return countryMap[lower] || code.toUpperCase();
}

async function openNextRace(forceRefresh = false) {
    currentView = 'nextRace';
    const container = document.getElementById('cardsContainer');
    container.innerHTML = '';

    // 1. Render Header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'card';
    headerDiv.style.gridColumn = '1 / -1';
    headerDiv.innerHTML = `
        <div class="card-header">
            <h3>Next Race Analysis</h3>
            <div class="subtitle">Weather Forecast & Practice Data</div>
            <div style="margin-top:10px;">
                <button onclick="returnToDashboard()" style="padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
                <button onclick="openNextRace(true)" style="margin-left:10px; padding:5px 10px; cursor:pointer; background:#607d8b; color:white; border:none; border-radius:4px;">Refresh API</button>
                <button onclick="document.getElementById('manualInputContainer').style.display = document.getElementById('manualInputContainer').style.display === 'none' ? 'block' : 'none'" style="margin-left:10px; padding:5px 10px; cursor:pointer; background:var(--card-bg); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">Manual Input</button>
            </div>
        </div>
        <div id="manualInputContainer" style="display:none; padding:15px; border-top:1px solid var(--border);">
            <div class="upload-box" id="nrDropZone" onclick="document.getElementById('nrFileInput').click()" style="margin-bottom:10px;">
                <h3>Drop HTML/Text or Click</h3>
                <input type="file" id="nrFileInput" style="display:none" onchange="handleNextRaceFile(this.files[0])">
            </div>
            <textarea id="nrTextInput" rows="4" style="width:100%; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); padding:5px;" placeholder="Paste forecast text..."></textarea>
            <button onclick="processManualNextRaceInput()" style="margin-top:5px; padding:5px 10px; cursor:pointer; background:#4caf50; color:white; border:none; border-radius:4px;">Parse</button>
        </div>
    `;
    container.appendChild(headerDiv);

    // Add placeholder for projection controls
    const projectionControlDiv = document.createElement('div');
    projectionControlDiv.id = 'projectionControlContainer';
    projectionControlDiv.className = 'card';
    projectionControlDiv.style.gridColumn = '1 / -1';
    projectionControlDiv.style.display = 'none'; // Hide until data is ready
    container.appendChild(projectionControlDiv);

    // 2. Fetch Data
    let data = null;

    if (!forceRefresh) {
        if (cachedNextRaceData) {
            data = cachedNextRaceData;
        } else {
            const stored = localStorage.getItem('gpro_next_race_data');
            if (stored) {
                try {
                    data = JSON.parse(stored);
                    cachedNextRaceData = data;
                } catch (e) {
                    console.warn("Failed to parse stored next race data", e);
                }
            }
        }
    }

    if (!data || forceRefresh) {
        try {
            const token = localStorage.getItem('gpro_api_token') || 
                          localStorage.getItem('gpro_token') || 
                          localStorage.getItem('token') || 
                          localStorage.getItem('api_token');
            
            if (token) {
                const headers = {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                };

                const [practiceRes, driverRes] = await Promise.all([
                    fetch('https://gpro.net/gb/backend/api/v2/Practice', { method: 'GET', headers }),
                    fetch('https://gpro.net/gb/backend/api/v2/DriProfile', { method: 'GET', headers })
                ]);

                if (practiceRes.ok) {
                    data = await practiceRes.json();
                    if (driverRes.ok) {
                        data.driverProfile = await driverRes.json();
                    }
                    // Normalize track name immediately
                    const cName = getCountryName(data.trackNat);
                    if (cName && !data.trackName.includes(cName)) {
                        data.trackName = `${data.trackName} (${cName})`;
                    }
                    cachedNextRaceData = data;
                    localStorage.setItem('gpro_next_race_data', JSON.stringify(data));
                } else if (practiceRes.status === 401) {
                    console.warn("API Unauthorized");
                }
            }
        } catch (err) {
            console.error("Fetch error", err);
        }
    }

    // 3. Check if data exists
    if (!data) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'card';
        msgDiv.style.gridColumn = '1 / -1';
        msgDiv.innerHTML = `<div style="padding:20px; text-align:center;">No data available. Please Refresh (if API token saved) or use Manual Input.</div>`;
        container.appendChild(msgDiv);
        document.getElementById('manualInputContainer').style.display = 'block';
        return;
    }

    // Refresh chart based on the track we're analyzing
    if (data.trackName && typeof renderChart === 'function') {
        const clean = (name) => name ? name.split('(')[0].trim().toLowerCase() : '';
        const target = clean(data.trackName);
        const trackRaces = allRaceData.filter(r => clean(r.trackName) === target);
        renderChart(trackRaces);

        // Update track dropdown to match
        const histTrack = allRaceData.find(r => clean(r.trackName) === target)?.trackName;
        if (histTrack && typeof populateTrackSelector === 'function') {
            populateTrackSelector(histTrack, true);
        }
    }

    // --- Render Car & Driver ---
    renderCarAndDriver(container, data);

    // --- Add Projection Logic ---
    const projectionContainer = document.getElementById('projectionControlContainer');
    const historicalRaces = allRaceData.filter(r => {
        const clean = (name) => name ? name.split('(')[0].trim().toLowerCase() : '';
        return clean(r.trackName) === clean(data.trackName) && r.laps && r.laps.length > 1;
    }).sort((a, b) => {
        if (a.selSeasonNb !== b.selSeasonNb) return b.selSeasonNb - a.selSeasonNb;
        return b.selRaceNb - a.selRaceNb;
    });

    if (historicalRaces.length > 0) {
        projectionContainer.style.display = 'block';
        const options = historicalRaces.map(r => {
            const dName = r.driver ? ` - ${r.driver.name}` : '';
            const label = `S${r.selSeasonNb} R${r.selRaceNb}${dName}`;
            const uid = `${r.selSeasonNb}-${r.selRaceNb}-${r.driver ? r.driver.id : 'u'}`;
            return `<option value="${uid}">${label}</option>`;
        }).join('');

        projectionContainer.innerHTML = `
            <div class="card-header">
                <h3>Projected Car Status</h3>
                <div style="margin-top:10px; display:flex; flex-wrap:wrap; align-items:center; gap:15px;">
                    <div>
                        <label for="projectionRaceSelect" style="font-weight:bold;">Base Race:</label>
                        <select id="projectionRaceSelect" onchange="updateProjectedStatus()" style="padding: 5px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-color); color: var(--text-primary);">${options}</select>
                    </div>
                    <div>
                        <label style="cursor:pointer; display:flex; align-items:center; font-size:0.9em;">
                            <input type="checkbox" id="excludeMaxWearParts" onchange="updateProjectedStatus()" style="margin-right:5px;">
                            Exclude parts that finished at 100% wear
                        </label>
                    </div>
                </div>
            </div>
            <div id="projectionResultContainer" style="padding:15px;"></div>
        `;
        updateProjectedStatus(); // Initial render
    }

    // --- Render Weather Forecast ---
    if (data.weather) {
        renderWeatherSection(container, data.weather, data.trackName, 'cachedNextRaceData');
    }

    // --- Render Practice Data ---
    if (data.lapsDone && data.lapsDone.length > 0) {
        renderPracticeSection(container, data);
    } else if (!data.weather) {
        // No weather and no laps
        container.innerHTML += `<div class="card" style="grid-column:1/-1; padding:20px; text-align:center;">No valid data found.</div>`;
    }

    // --- Render Historical Data ---
    renderHistoricalTrackData(container, data.trackName);
}

function renderPracticeSection(container, practiceData) {
    // --- Calculate Optimal Setup (Composite) ---
    const parseTime = (tStr) => {
        if (!tStr) return Infinity;
        const parts = tStr.split(':');
        if (parts.length === 2) {
            return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(tStr);
    };

    const fmtTime = (t) => {
        const m = Math.floor(t / 60);
        const s = (t % 60).toFixed(3);
        return `${m}:${s.padStart(6, '0')}`;
    };

    const solveQuadratic = (points) => {
        if (points.length < 3) return null;
        let n = points.length;
        let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0;
        let sy = 0, sxy = 0, sx2y = 0;
        for (let p of points) {
            let x = p.x;
            let y = p.y;
            sx += x; sx2 += x*x; sx3 += x*x*x; sx4 += x*x*x*x;
            sy += y; sxy += x*y; sx2y += x*x*y;
        }
        const det = (m) => m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
        let D = det([[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]]);
        if (Math.abs(D) < 1e-9) return null;
        let Da = det([[n, sx, sy], [sx, sx2, sxy], [sx2, sx3, sx2y]]);
        let Db = det([[n, sy, sx2], [sx, sxy, sx3], [sx2, sx2y, sx4]]);
        let Dc = det([[sy, sx, sx2], [sxy, sx2, sx3], [sx2y, sx3, sx4]]);
        let a = Da / D;
        let b = Db / D;
        let c = Dc / D;
        if (a <= 0) return null;
        let vertexX = -b / (2 * a);
        let vertexY = a * vertexX * vertexX + b * vertexX + c;
        return { x: vertexX, y: vertexY };
    };

    const partsKeys = [
        { key: 'setFWing', label: 'FWing' },
        { key: 'setRWing', label: 'RWing' },
        { key: 'setEngine', label: 'Engine' },
        { key: 'setBrakes', label: 'Brakes' },
        { key: 'setGear', label: 'Gear' },
        { key: 'setSusp', label: 'Susp' }
    ];
    
    const colorScore = { 'green': 4, 'lime': 4, 'yellow': 3, 'orange': 2, 'red': 1 };
    const calculatedSetup = {};
    const predictedSetup = {};

    partsKeys.forEach(p => {
        let maxScore = -1;
        let bestVal = '-';
        let minTime = Infinity;
        const valueMap = new Map();

        practiceData.lapsDone.forEach(lap => {
            const s = lap[p.key];
            if (!s) return;
            
            const c = (s.color || '').toLowerCase();
            const score = colorScore[c] || 0;
            const t = parseTime(lap.netTime);

            if (score > maxScore) {
                maxScore = score;
                bestVal = s.value;
                minTime = t;
            } else if (score === maxScore) {
                if (t < minTime) {
                    minTime = t;
                    bestVal = s.value;
                }
            }
            
            if (t > 0 && t < Infinity && s.value) {
                const val = parseFloat(s.value);
                if (!isNaN(val)) {
                    if (!valueMap.has(val) || t < valueMap.get(val)) {
                        valueMap.set(val, t);
                    }
                }
            }
        });
        calculatedSetup[p.key] = bestVal;
        
        const points = Array.from(valueMap.entries()).map(([x, y]) => ({x, y})).sort((a,b) => a.x - b.x);
        const pred = solveQuadratic(points);
        if (pred) {
            const minX = points[0].x;
            const maxX = points[points.length-1].x;
            if (pred.x >= minX - 200 && pred.x <= maxX + 200) {
                 predictedSetup[p.key] = { val: Math.round(pred.x), time: pred.y };
            }
        }
    });

    const bestSetupHTML = partsKeys.map(p => {
        let html = `
        <div style="text-align:center; padding:10px; background:var(--bg-color); border:1px solid var(--border); border-radius:4px; min-width:80px; flex:1;">
            <div style="font-size:0.8em; color:var(--text-secondary); margin-bottom:5px;">${p.label}</div>
            <div style="font-size:1.2em; font-weight:bold; color:var(--accent);">${calculatedSetup[p.key]}</div>`;
        if (predictedSetup[p.key]) {
            const pred = predictedSetup[p.key];
            html += `<div style="font-size:0.8em; color:#4caf50; margin-top:4px; border-top:1px dashed #444; padding-top:4px;" title="Calculated optimal time: ${fmtTime(pred.time)}">Calc: <b>${pred.val}</b></div>`;
        }
        html += `</div>`;
        return html;
    }).join('');

    const setupCard = document.createElement('div');
    setupCard.className = 'card';
    setupCard.style.gridColumn = '1 / -1';
    setupCard.innerHTML = `
        <div class="card-header">
            <h3>Calculated Optimal Setup</h3>
            <div class="subtitle">Composite of best performing parts based on feedback and Net Time</div>
        </div>
        <div style="padding:15px; display:flex; justify-content:space-around; flex-wrap:wrap; gap:10px;">
            ${bestSetupHTML}
        </div>
    `;
    container.appendChild(setupCard);
    // -------------------------------------------

    // Render Laps Table
    const card = document.createElement('div');
    card.className = 'card';
    card.style.gridColumn = '1 / -1';
    
    // Helper to style setup cells based on feedback color
    const getSetupCell = (setting) => {
        if (!setting) return '<td style="text-align:center; color:var(--text-secondary);">-</td>';
        
        let bg = 'transparent';
        let color = 'inherit';
        
        // Map API colors to visual styles
        switch (setting.color ? setting.color.toLowerCase() : '') {
            case 'red': bg = '#d32f2f'; color = 'white'; break;
            case 'orange': bg = '#f57c00'; color = 'white'; break;
            case 'yellow': bg = '#fbc02d'; color = 'black'; break;
            case 'lime': 
            case 'green': bg = '#388e3c'; color = 'white'; break;
        }
        
        return `<td style="text-align:center; background:${bg}; color:${color};" title="${setting.comment || ''}">${setting.value}</td>`;
    };

    let tableHTML = `
        <div style="overflow-x:auto;">
            <table class="setup-table" style="min-width:800px;">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Lap Time</th>
                        <th>Driver Mistake</th>
                        <th>Net Time</th>
                        <th>Tyres</th>
                        <th>FWing</th>
                        <th>RWing</th>
                        <th>Engine</th>
                        <th>Brakes</th>
                        <th>Gear</th>
                        <th>Susp</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Find lowest positive mistake time
    let minMistake = Infinity;
    practiceData.lapsDone.forEach(l => {
        const m = l.misTime ? parseFloat(l.misTime) : 0;
        if (m > 0 && m < minMistake) minMistake = m;
    });

    practiceData.lapsDone.forEach(lap => {
        // Mistake highlighting
        const mVal = lap.misTime ? parseFloat(lap.misTime) : 0;
        const mistakeStyle = (mVal > 0) ? ((mVal === minMistake) ? 'color:#4caf50; font-weight:bold;' : 'color:#f44336;') : '';
        
        tableHTML += `
            <tr>
                <td style="text-align:center; font-weight:bold;">${lap.idx}</td>
                <td style="color:${lap.lapTimeColor || 'inherit'};">${lap.lapTime}</td>
                <td style="${mistakeStyle}">${mVal > 0 ? `+${lap.misTime}s` : '-'}</td>
                <td style="color:${lap.netTimeColor || 'inherit'};">${lap.netTime}</td>
                <td style="text-align:center;">${lap.setTyres}</td>
                ${getSetupCell(lap.setFWing)}
                ${getSetupCell(lap.setRWing)}
                ${getSetupCell(lap.setEngine)}
                ${getSetupCell(lap.setBrakes)}
                ${getSetupCell(lap.setGear)}
                ${getSetupCell(lap.setSusp)}
            </tr>
        `;
        
        // Driver Comments Row
        if (lap.driComments && lap.driComments.length > 0) {
             const comments = lap.driComments.map(c => `<span style="margin-right:15px;"><b style="color:var(--accent, #4caf50);">${c.part}:</b> ${c.text}</span>`).join('');
             tableHTML += `
                <tr>
                    <td colspan="11" style="padding:5px 15px 15px 15px; font-size:0.85em; color:var(--text-secondary); background:rgba(255,255,255,0.02);">
                        ${comments}
                    </td>
                </tr>
             `;
        }
    });

    tableHTML += `</tbody></table></div>`;
    
    card.innerHTML = `
        <div class="card-header">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3>${practiceData.trackName}</h3>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="font-size:0.9em; color:var(--text-secondary);">Practice Laps</div>
                    <button onclick="refreshPracticeData()" style="padding:4px 8px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px; font-size:0.8em;" title="Refresh only Practice Laps">Refresh Laps</button>
                </div>
            </div>
        </div>
        <div style="padding:0;">
            ${tableHTML}
        </div>
        <div style="padding:10px; font-size:0.8em; color:var(--text-secondary); text-align:right;">
            Remaining API Requests: ${practiceData.apiRequestsRemaining}
        </div>
    `;
    
    container.appendChild(card);
}

function updateProjectedStatus() {
    const select = document.getElementById('projectionRaceSelect');
    if (!select) return;

    const selectedUid = select.value;
    const historicalRace = allRaceData.find(r => {
        const uid = `${r.selSeasonNb}-${r.selRaceNb}-${r.driver ? r.driver.id : 'u'}`;
        return uid === selectedUid;
    });

    if (historicalRace && cachedNextRaceData) {
        renderProjectedCarStatus(historicalRace, cachedNextRaceData);
    }
}

function renderProjectedCarStatus(historicalRace, nextRaceData) {
    const container = document.getElementById('projectionResultContainer');
    if (!container) return;

    const excludeMaxWear = document.getElementById('excludeMaxWearParts')?.checked || false;

    // Fix for missing laps in API data: Fallback to historical race distance
    let nextLaps = nextRaceData.laps;
    if (!nextLaps && historicalRace.laps && historicalRace.laps.length > 1) {
        nextLaps = historicalRace.laps.length - 1;
    }

    if (!historicalRace.laps || historicalRace.laps.length <= 1 || !nextLaps) {
        container.innerHTML = '<p style="color:var(--text-secondary);">Not enough data for projection.</p>';
        return;
    }

    const clean = (name) => name ? name.split('(')[0].trim().toLowerCase() : '';
    const trackRaces = allRaceData.filter(r => clean(r.trackName) === clean(nextRaceData.trackName) && r.laps && r.laps.length > 1);

    const partMapping = {
        'chassis': 'Chassis', 'engine': 'Engine', 'FWing': 'FWing', 'RWing': 'RWing',
        'underbody': 'Underbody', 'sidepods': 'Sidepods', 'cooling': 'Cooling',
        'gear': 'Gear', 'brakes': 'Brakes', 'susp': 'Susp', 'electronics': 'Electronics'
    };

    let rowsHTML = '';
    Object.keys(partLabels).forEach(key => { // key is 'chassis', 'engine', etc.
        const apiWearKey = 'usa' + partMapping[key]; // e.g., 'usaChassis'
        const apiLvlKey = 'lvl' + partMapping[key];
        
        const currentLvl = nextRaceData[apiLvlKey];
        const currentWear = nextRaceData[apiWearKey];

        if (currentWear === undefined) {
            rowsHTML += `<tr><td style="text-align:left;">${partLabels[key]}</td><td colspan="4" style="text-align:center; color:var(--text-secondary); font-style:italic;">No current wear data</td></tr>`;
            return;
        }

        let sourceRace = historicalRace;
        let sourcePart = historicalRace[key];

        // Exclude base race if it meets the criteria
        if (excludeMaxWear && sourcePart && sourcePart.finishWear >= 100) {
            sourceRace = null;
            sourcePart = null;
        }

        // Smart Matching: If levels mismatch, or if the base race was excluded, search all history for a better match
        if (currentLvl !== undefined && (sourcePart === null || sourcePart.lvl != currentLvl)) {
            let bestRace = null;
            let minDiff = sourcePart ? Math.abs(sourcePart.lvl - currentLvl) : Infinity;

            let availableRaces = trackRaces;
            if (excludeMaxWear) {
                availableRaces = trackRaces.filter(r => !r[key] || r[key].finishWear < 100);
            }

            availableRaces.forEach(r => {
                if (r[key]) {
                    const diff = Math.abs(r[key].lvl - currentLvl);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestRace = r;
                    }
                }
            });

            // Use the better match if found
            if (bestRace) {
                sourceRace = bestRace;
                sourcePart = bestRace[key];
            }
        }

        if (!sourcePart) {
            rowsHTML += `<tr><td style="text-align:left;">${partLabels[key]}</td><td colspan="4" style="text-align:center; color:var(--text-secondary); font-style:italic;">No suitable historical data found</td></tr>`;
            return;
        }

        let hasRain = false, hasDry = false, hasCloud = false;
        (sourceRace.laps || []).forEach(l => {
            if (!l.weather) return;
            const w = l.weather.toLowerCase();
            if (w.includes('rain')) hasRain = true;
            else {
                hasDry = true;
                if (w.includes('cloud')) hasCloud = true;
            }
        });
        let wIcon = '☀️';
        if (hasRain && hasDry) wIcon = '🌦️';
        else if (hasRain) wIcon = '🌧️';
        else if (hasCloud) wIcon = '☁️';

        const sourceLaps = sourceRace.laps.length - 1;
        const histWear = sourcePart.finishWear - sourcePart.startWear;
        let histWearStyle = '';
        if (sourcePart.finishWear >= 100) {
            histWearStyle = 'color:#ff5252; font-weight:bold;';
        }
        const wearPerLap = sourceLaps > 0 ? histWear / sourceLaps : 0;
        const projectedRaceWear = wearPerLap * nextLaps;
        const projectedFinishWear = parseFloat(currentWear) + projectedRaceWear;
        
        let finishStyle = ''; // Default to no special style
        if (projectedFinishWear >= 100) finishStyle = 'color:#ff5252; font-weight:bold;'; // Red for 100% or more
        else if (projectedFinishWear > 75) finishStyle = 'color:#ff9800;';

        let lvlDisplay = `${sourcePart.lvl}`;
        let lvlAttr = '';
        
        const raceInfoStr = `(from S${sourceRace.selSeasonNb}R${sourceRace.selRaceNb} ${wIcon})`;

        if (currentLvl !== undefined && sourcePart.lvl != currentLvl) {
            lvlDisplay += ' ❓';
            const note = `Level mismatch!<br>Current: ${currentLvl}<br>Used: ${sourcePart.lvl} ${raceInfoStr}`;
            lvlAttr = createTooltipAttr(note, 'cursor:help; color:#ff9800; font-weight:bold;');
        } else if (sourceRace !== historicalRace) {
             lvlDisplay += ' ℹ️';
             lvlAttr = createTooltipAttr(`Using data from S${sourceRace.selSeasonNb}R${sourceRace.selRaceNb} ${wIcon} (Exact match)`, 'cursor:help; color:#4caf50;');
        } else {
            const note = `Using data from S${sourceRace.selSeasonNb}R${sourceRace.selRaceNb} ${wIcon}`;
            lvlAttr = createTooltipAttr(note);
        }

        let problemStr = '';
        if (sourceRace.problems) {
             const relevant = sourceRace.problems.filter(p => {
                 const r = p.reason.toLowerCase();
                 if (key === 'FWing') return r.includes('front wing');
                 if (key === 'RWing') return r.includes('rear wing');
                 if (key === 'gear') return r.includes('gear');
                 if (key === 'cooling') return r.includes('water') || r.includes('oil') || r.includes('leak') || r.includes('cooling');
                 if (key === 'electronics') return r.includes('electr');
                 if (key === 'susp') return r.includes('suspension');
                 if (key === 'brakes') return r.includes('brakes');
                 if (key === 'engine') return r.includes('engine');
                 return r.includes(partLabels[key].toLowerCase());
             });
             
             if (relevant.length > 0) {
                 const tooltip = relevant.map(p => `Lap ${p.lap}: ${p.reason}`).join('<br>');
                 problemStr = ` <span ${createTooltipAttr(tooltip)} style="cursor:help;">🔧</span>`;
             }
        }

        rowsHTML += `
            <tr>
                <td style="text-align:left;">${partLabels[key]}</td>
                <td ${lvlAttr}>${lvlDisplay}</td>
                <td>${currentWear}%</td>
                <td style="${histWearStyle}">${projectedRaceWear.toFixed(1)}%${problemStr}</td>
                <td style="${finishStyle}">${projectedFinishWear.toFixed(1)}%</td>
            </tr>
        `;
    });

    container.innerHTML = `
        <div class="subtitle" style="margin-bottom:10px;">Projection based on ${nextLaps} laps (Race Distance).</div>
        <table class="setup-table" style="width:100%; font-size:0.9em;">
            <thead>
                <tr>
                    <th style="text-align:left;">Part</th>
                    <th>Lvl Used</th>
                    <th>Current Wear</th>
                    <th>Proj. Race Wear</th>
                    <th>Proj. Finish Wear</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHTML}
            </tbody>
        </table>
    `;
}

function renderHistoricalTrackData(container, trackName) {
    if (typeof allRaceData === 'undefined' || !allRaceData || allRaceData.length === 0) return;

    const parseTime = (tStr) => {
        if (!tStr || tStr === '-') return 0;
        const parts = tStr.split(':');
        if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
        return parseFloat(tStr) || 0;
    };
    const fmtTime = (s) => {
        if (!s || s === Infinity) return '-';
        const m = Math.floor(s / 60);
        const sec = (s % 60).toFixed(3);
        return `${m}:${sec.padStart(6, '0')}`;
    };

    const clean = (name) => name ? name.split('(')[0].trim().toLowerCase() : '';
    const target = clean(trackName);

    const history = allRaceData.filter(r => clean(r.trackName) === target);

    if (history.length === 0) return;

    // Sort: Latest season first
    history.sort((a, b) => {
        if (a.selSeasonNb !== b.selSeasonNb) return b.selSeasonNb - a.selSeasonNb;
        return b.selRaceNb - a.selRaceNb;
    });

    const card = document.createElement('div');
    card.className = 'card';
    card.style.gridColumn = '1 / -1';

    let rows = '';
    
    const partKeys = [
        { k: 'chassis', l: 'Cha' }, { k: 'engine', l: 'Eng' }, { k: 'FWing', l: 'FW' },
        { k: 'RWing', l: 'RW' }, { k: 'underbody', l: 'Und' }, { k: 'sidepods', l: 'Sid' },
        { k: 'cooling', l: 'Coo' }, { k: 'gear', l: 'Gea' }, { k: 'brakes', l: 'Bra' },
        { k: 'susp', l: 'Sus' }, { k: 'electronics', l: 'Ele' }
    ];

    // Pre-calculate stats for all races to find overall bests
    const processedHistory = history.map(r => {
        let tSum = 0, cnt = 0;
        let hasRain = false;
        let bestLapTime = Infinity;
        let flyingLapTimeSum = 0;
        let flyingLapCount = 0;
        const pitLaps = new Set();
        if (r.pits) {
            r.pits.forEach(p => {
                pitLaps.add(p.lap);
                pitLaps.add(p.lap + 1);
            });
        }

        (r.laps || []).forEach(l => {
            const lapTime = parseTime(l.lapTime);
            if (l.idx > 0 && lapTime > 0 && lapTime < bestLapTime) {
                bestLapTime = lapTime;
            }

            if (l.temp) { tSum += l.temp; cnt++; }
            if (l.weather && l.weather.toLowerCase().includes('rain')) hasRain = true;

            const hasIssue = l.events && l.events.some(e => 
                e.event.toLowerCase().includes('mistake') || 
                e.event.toLowerCase().includes('problem') || 
                e.event.toLowerCase().includes('accident')
            );
            if (l.idx > 1 && !pitLaps.has(l.idx) && !hasIssue && lapTime > 0) {
                flyingLapTimeSum += lapTime;
                flyingLapCount++;
            }
        });

        const avgLapTime = flyingLapCount > 0 ? flyingLapTimeSum / flyingLapCount : 0;
        const avgT = cnt ? (tSum / cnt).toFixed(1) : '-';
        const wIcon = hasRain ? '🌧️' : '☀️';

        return { race: r, bestLapTime, avgLapTime, avgT, wIcon };
    });

    const allBestLaps = processedHistory.map(p => p.bestLapTime).filter(t => t > 0 && t !== Infinity);
    const allAvgLaps = processedHistory.map(p => p.avgLapTime).filter(t => t > 0);
    const overallBestLap = allBestLaps.length > 0 ? Math.min(...allBestLaps) : Infinity;
    const overallBestAvgLap = allAvgLaps.length > 0 ? Math.min(...allAvgLaps) : Infinity;

    processedHistory.forEach(item => {
        const r = item.race;
        const dName = r.driver ? r.driver.name.replace(/['"]/g, '') : 'Unknown';
        
        // Driver Tooltip
        let driverCell = dName;
        if (r.driver) {
            const d = r.driver;
            let dtContent = '<table class="tooltip-table" style="min-width:100px;">';
            const attrs = [
                ['OA', d.OA], ['Con', d.con], ['Tal', d.tal], ['Agr', d.agr],
                ['Exp', d.exp], ['TeI', d.tei], ['Sta', d.sta], ['Cha', d.cha],
                ['Mot', d.mot], ['Rep', d.rep], ['Wei', d.wei]
            ];
            attrs.forEach(([k, v]) => {
                if(v) dtContent += `<tr><td>${k}</td><td>${v}</td></tr>`;
            });
            dtContent += '</table>';
            const safeDt = dtContent.replace(/"/g, '&quot;').replace(/'/g, "\\'");
            driverCell = `<span style="cursor:help;" onmouseenter="showTooltip(event, '${safeDt}')" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()">${dName} ℹ️</span>`;
        }

        const group = r.group || '-';
        const finishPos = r.laps && r.laps.length ? r.laps[r.laps.length - 1].pos : '-';

        const { bestLapTime, avgLapTime, avgT, wIcon } = item;

        let avgLapStyle = '';
        if (avgLapTime > 0 && avgLapTime === overallBestAvgLap) {
            avgLapStyle = 'style="color:#4caf50; font-weight:bold;"';
        }

        let bestLapStyle = '';
        if (bestLapTime > 0 && bestLapTime !== Infinity && bestLapTime === overallBestLap) {
            bestLapStyle = 'style="color:#4caf50; font-weight:bold;"';
        }

        // Setup
        let setup = '-';
        if (r.setupsUsed) {
            const s = r.setupsUsed.find(x => x.session === 'Race');
            if (s) {
                const parts = [
                    { l: 'FW', v: s.setFWing }, { l: 'RW', v: s.setRWing },
                    { l: 'En', v: s.setEng }, { l: 'Br', v: s.setBra },
                    { l: 'Ge', v: s.setGear }, { l: 'Su', v: s.setSusp }
                ];
                setup = parts.map(p => 
                    `<span style="display:inline-block; margin-right:3px; padding:1px 4px; background:rgba(255,255,255,0.05); border-radius:3px; border:1px solid #444;">` +
                    `<span style="color:#aaa; font-size:0.8em; margin-right:2px;">${p.l}</span>` +
                    `<span style="color:#fff; font-weight:bold;">${p.v || '-'}</span>` +
                    `</span>`
                ).join('');
            }
        }

        // Stint 1 Data
        let s1Fuel = '-', s1Wear = '-', s1Tyre = '-';
        let startFuel = r.startFuel;
        
        let firstStintLaps = 0;
        let firstStintFuelUsed = 0;
        let firstStintWear = 0;
        
        if (r.pits && r.pits.length > 0) {
            const p1 = r.pits[0];
            firstStintLaps = p1.lap; 
            if (firstStintLaps > 0) {
                const fEnd = (p1.fuelLeft / 100) * 180;
                firstStintFuelUsed = startFuel - fEnd;
                firstStintWear = 100 - p1.tyreCond;
            }
        } else if (r.laps && r.laps.length > 0) {
             firstStintLaps = r.laps.length - 1;
             if (firstStintLaps > 0) {
                 firstStintFuelUsed = startFuel - r.finishFuel;
                 firstStintWear = 100 - r.finishTyres;
             }
        }
        
        if (firstStintLaps > 0) {
            s1Fuel = (firstStintFuelUsed / firstStintLaps).toFixed(3);
            s1Wear = (firstStintWear / firstStintLaps).toFixed(3);
            if (r.laps[1]) s1Tyre = r.laps[1].tyres;
        }

        // Parts Wear
        let partsTooltip = '<table class="tooltip-table" style="min-width:150px;"><tr><th>Part</th><th>Lvl</th><th>Wear</th></tr>';
        let maxWear = 0;
        let maxPart = '-';
        
        partKeys.forEach(p => {
            if (r[p.k]) {
                const wear = r[p.k].finishWear - r[p.k].startWear;
                partsTooltip += `<tr><td>${p.l}</td><td>${r[p.k].lvl}</td><td>${wear}%</td></tr>`;
                if (wear > maxWear) {
                    maxWear = wear;
                    maxPart = p.l;
                }
            }
        });
        partsTooltip += '</table>';
        
        const partsCell = `<span style="cursor:help; border-bottom:1px dotted #888;" onmouseenter="showTooltip(event, '${partsTooltip.replace(/"/g, '&quot;').replace(/'/g, "\\'")}')" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()">Max: ${maxPart} ${maxWear}% ⚙️</span>`;

        rows += `
            <tr>
                <td style="white-space:nowrap;">S${r.selSeasonNb} R${r.selRaceNb}</td>
                <td style="white-space:nowrap;">${driverCell}</td>
                <td>${group}</td>
                <td style="color:var(--accent); font-weight:bold;">P${finishPos}</td>
                <td style="white-space:nowrap;">${wIcon} ${avgT}°</td>
                <td>${s1Tyre}</td>
                <td>${s1Fuel}</td>
                <td>${s1Wear}</td>
                <td>${partsCell}</td>
                <td ${avgLapStyle}>${fmtTime(avgLapTime)}</td>
                <td ${bestLapStyle}>${fmtTime(bestLapTime)}</td>
                <td style="font-size:0.85em; white-space:nowrap;">${setup}</td>
            </tr>
        `;
    });

    card.innerHTML = `
        <div class="card-header">
            <h3>Historical Data: ${trackName}</h3>
            <div class="subtitle">Past races on this track (Stint 1 Averages)</div>
        </div>
        <div style="overflow-x:auto;">
            <table class="setup-table">
                <thead>
                    <tr>
                        <th>Race</th>
                        <th>Driver</th>
                        <th>Group</th>
                        <th>Pos</th>
                        <th>Weather</th>
                        <th>Tyre</th>
                        <th>Fuel/Lap</th>
                        <th>Wear/Lap</th>
                        <th>Parts Wear</th>
                        <th>Avg Lap</th>
                        <th>Best Lap</th>
                        <th>Race Setup</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
    
    container.appendChild(card);
}


async function refreshPracticeData() {
    const token = localStorage.getItem('gpro_api_token') || 
                  localStorage.getItem('gpro_token') || 
                  localStorage.getItem('token') || 
                  localStorage.getItem('api_token');
    
    if (!token) {
        alert("No API token found. Please enter it in the manual input section or settings.");
        return;
    }

    const btn = document.querySelector('button[onclick="refreshPracticeData()"]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '...';
    }

    try {
        const response = await fetch('https://gpro.net/gb/backend/api/v2/Practice', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const newData = await response.json();
            
            if (cachedNextRaceData && cachedNextRaceData.driverProfile) {
                newData.driverProfile = cachedNextRaceData.driverProfile;
            }

            const cName = getCountryName(newData.trackNat);
            if (cName && !newData.trackName.includes(cName)) {
                newData.trackName = `${newData.trackName} (${cName})`;
            }

            cachedNextRaceData = newData;
            localStorage.setItem('gpro_next_race_data', JSON.stringify(cachedNextRaceData));
            
            openNextRace();
        } else {
            alert(`Failed to refresh practice data. Status: ${response.status}`);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Refresh Laps';
            }
        }
    } catch (e) {
        console.error("Error refreshing practice data", e);
        alert("Error refreshing practice data: " + e.message);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Refresh Laps';
        }
    }
}

function handleNextRaceFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
             if (typeof parseHTML === 'function') {
                 const data = parseHTML(content);
                 if (data && data.weather) {
                     cachedNextRaceData = { weather: data.weather, trackName: data.trackName || '', lapsDone: [] };
                     localStorage.setItem('gpro_next_race_data', JSON.stringify(cachedNextRaceData));
                     openNextRace();
                 } else {
                     processManualNextRaceInput(content);
                 }
             } else {
                 processManualNextRaceInput(content);
             }
        } else {
            processManualNextRaceInput(content);
        }
    };
    reader.readAsText(file);
}

function processManualNextRaceInput(textInput) {
    const text = textInput || document.getElementById('nrTextInput').value;
    if (!text) return;

    const result = parseWeatherFromText(text);

    if (Object.keys(result.weather).length > 0) {
        cachedNextRaceData = { weather: result.weather, trackName: result.trackName || 'Manual Import', lapsDone: [] };
        localStorage.setItem('gpro_next_race_data', JSON.stringify(cachedNextRaceData));
        openNextRace();
    } else {
        if (!textInput) alert("No weather data found in text.");
    }
}

function renderCarAndDriver(container, data) {
    if (!data.driverProfile && !data.lvlChassis) return;

    const card = document.createElement('div');
    card.className = 'card';
    card.style.gridColumn = '1 / -1';

    let contentHTML = '';

    // Driver Column
    if (data.driverProfile) {
        const d = data.driverProfile;
        const attrs = [
            { k: 'Concentration', v: d.concentration },
            { k: 'Talent', v: d.talent },
            { k: 'Aggressiveness', v: d.aggressiveness },
            { k: 'Experience', v: d.experience },
            { k: 'Tech Insight', v: d.techInsight },
            { k: 'Stamina', v: d.stamina },
            { k: 'Charisma', v: d.charisma },
            { k: 'Motivation', v: d.motivation },
            { k: 'Reputation', v: d.reputation },
            { k: 'Weight', v: d.weight },
            { k: 'Age', v: d.age }
        ];

        contentHTML += `
            <div style="flex: 1; min-width: 250px;">
                <h4 style="border-bottom:1px solid var(--border); padding-bottom:5px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span>${d.driName}</span>
                    <span style="font-size:0.8em; font-weight:normal; color:var(--text-secondary);">OA: <b style="color:var(--text-primary)">${d.overall}</b></span>
                </h4>
                    <table class="setup-table" style="width:100%; font-size:0.9em;">
                        <thead><tr><th style="text-align:left;">Attribute</th><th style="text-align:right;">Value</th></tr></thead>
                        <tbody>
                            ${attrs.map(a => `<tr><td style="text-align:left;">${a.k}</td><td style="text-align:right; font-weight:bold; color:var(--accent);">${a.v}</td></tr>`).join('')}
                        </tbody>
                    </table>
            </div>
        `;
    }

    // Car Column
    if (data.lvlChassis) {
        const parts = [
            { key: 'Chassis', lvl: data.lvlChassis, wear: data.usaChassis },
            { key: 'Engine', lvl: data.lvlEngine, wear: data.usaEngine },
            { key: 'FWing', lvl: data.lvlFWing, wear: data.usaFWing },
            { key: 'RWing', lvl: data.lvlRWing, wear: data.usaRWing },
            { key: 'Underbody', lvl: data.lvlUnderbody, wear: data.usaUnderbody },
            { key: 'Sidepods', lvl: data.lvlSidepods, wear: data.usaSidepods },
            { key: 'Cooling', lvl: data.lvlCooling, wear: data.usaCooling },
            { key: 'Gearbox', lvl: data.lvlGear, wear: data.usaGear },
            { key: 'Brakes', lvl: data.lvlBrakes, wear: data.usaBrakes },
            { key: 'Suspension', lvl: data.lvlSusp, wear: data.usaSusp },
            { key: 'Electronics', lvl: data.lvlElectronics, wear: data.usaElectronics }
        ];

        contentHTML += `
            <div style="flex: 1; min-width: 300px;">
                <h4 style="border-bottom:1px solid var(--border); padding-bottom:5px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Car Status</span>
                    <span style="font-size:0.8em; font-weight:normal; color:var(--text-secondary);">
                        P:<b style="color:var(--text-primary)">${data.carPower||'-'}</b> 
                        H:<b style="color:var(--text-primary)">${data.carHandl||'-'}</b> 
                        A:<b style="color:var(--text-primary)">${data.carAccel||'-'}</b>
                    </span>
                </h4>
                    <table class="setup-table" style="width:100%; font-size:0.9em;">
                        <thead><tr><th style="text-align:left;">Part</th><th>Level</th><th>Wear</th></tr></thead>
                        <tbody>
                            ${parts.map(p => `
                                <tr>
                                    <td style="text-align:left;">${p.key}</td>
                                    <td>${p.lvl || '-'}</td>
                                    <td style="${parseInt(p.wear) > 90 ? 'color:#ff5252; font-weight:bold;' : ''}">${p.wear || '-'}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="card-header">
            <h3>Current Status</h3>
        </div>
        <div style="padding: 15px; display: flex; flex-wrap: wrap; gap: 20px;">
            ${contentHTML}
        </div>
    `;
    
    container.appendChild(card);
}
