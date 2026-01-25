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

    // --- Render Car & Driver ---
    renderCarAndDriver(container, data);

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

    partsKeys.forEach(p => {
        let maxScore = -1;
        let bestVal = '-';
        let minTime = Infinity;

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
        });
        calculatedSetup[p.key] = bestVal;
    });

    const bestSetupHTML = partsKeys.map(p => `
        <div style="text-align:center; padding:10px; background:var(--bg-color); border:1px solid var(--border); border-radius:4px; min-width:80px; flex:1;">
            <div style="font-size:0.8em; color:var(--text-secondary); margin-bottom:5px;">${p.label}</div>
            <div style="font-size:1.2em; font-weight:bold; color:var(--accent);">${calculatedSetup[p.key]}</div>
        </div>
    `).join('');

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
                <div style="font-size:0.9em; color:var(--text-secondary);">Practice Laps</div>
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
