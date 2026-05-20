/*
    GPRO Testing Data Analysis
    Copyright (C) 2026 Olegas Spausdinimas
*/

let testingHistory = [];
let currentTestingData = null;

/**
 * Helper to parse time strings (m:ss.ms) into seconds.
 */
function parseTestingTime(tStr) {
    if (!tStr || tStr === '-') return 0;
    const parts = tStr.split(':');
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    return parseFloat(tStr) || 0;
}

/**
 * Calculates the best lap time for a session across all stints.
 */
function getSessionBestLap(session) {
    const stints = session.stintsDone || session.testLapsDone || session.lapsDone || [];
    let best = Infinity;
    stints.forEach(s => {
        const t = parseTestingTime(s.bestLapTime);
        if (t > 0 && t < best) best = t;
    });
    return best;
}

/**
 * Checks if two testing sessions are identical based on temp, hum, and best lap.
 */
function areSessionsEqual(s1, s2) {
    if (!s1 || !s2) return false;
    if (s1.temp !== s2.temp || s1.hum !== s2.hum) return false;
    
    const b1 = getSessionBestLap(s1);
    const b2 = getSessionBestLap(s2);
    if (b1 === Infinity || b2 === Infinity) return false;
    return Math.abs(b1 - b2) < 0.0001;
}

/**
 * Opens the Testing Data view and renders the initial UI.
 */
async function openTestingData() {
    currentView = 'testing';
    const container = document.getElementById('cardsContainer');
    container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'card';
    card.style.gridColumn = '1 / -1';

    card.innerHTML = `
        <div class="card-header">
            <h3>Testing Data</h3>
            <div class="subtitle">Analyze your car testing sessions and character points</div>
            <div style="margin-top:10px;">
                <button onclick="returnToDashboard()" style="padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
                <button id="fetchTestingBtn" onclick="fetchTestingData()" style="margin-left:10px; padding:5px 10px; cursor:pointer; background:#4caf50; color:white; border:none; border-radius:4px;">Fetch Testing</button>
                <button onclick="exportAllTestingData()" style="margin-left:10px; padding:5px 10px; cursor:pointer; background:#2196f3; color:white; border:none; border-radius:4px;">Export All</button>
                <button onclick="triggerTestingLoad()" style="margin-left:10px; padding:5px 10px; cursor:pointer; background:#673ab7; color:white; border:none; border-radius:4px;">Load JSONs</button>
                <button onclick="clearTestingHistory()" style="margin-left:10px; padding:5px 10px; cursor:pointer; background:#f44336; color:white; border:none; border-radius:4px;">Clear History</button>
                <input type="file" id="loadTestingInput" multiple accept=".json" style="display:none;" onchange="loadTestingJsonFiles(this.files)">
            </div>
        </div>
    `;
    container.appendChild(card);

    // Container for history cards
    const historyContainer = document.createElement('div');
    historyContainer.id = 'testingHistoryContainer';
    historyContainer.style.display = 'contents'; // Allows grid behavior from parent
    container.appendChild(historyContainer);

    // Load from cache if available
    const storedData = localStorage.getItem('gpro_testing_history');
    if (storedData) {
        try {
            testingHistory = JSON.parse(storedData);
            
            // Ensure history is sorted by date descending
            testingHistory.sort((a, b) => {
                const da = a.fetchedAt ? new Date(a.fetchedAt).getTime() : 0;
                const db = b.fetchedAt ? new Date(b.fetchedAt).getTime() : 0;
                return db - da;
            });

            renderTestingHistory();
            if (testingHistory.length > 0 && typeof renderChart === 'function') {
                const latestTrack = testingHistory[0].trackName;
                const clean = (name) => name ? name.split('(')[0].trim().toLowerCase() : '';
                const target = clean(latestTrack);
                const trackRaces = allRaceData.filter(r => clean(r.trackName) === target);
                renderChart(trackRaces);

                // Update track dropdown to match
                const histTrack = allRaceData.find(r => clean(r.trackName) === target)?.trackName;
                if (histTrack && typeof populateTrackSelector === 'function') {
                    populateTrackSelector(histTrack, true);
                }
            }
        } catch (e) {
            console.error("Error parsing cached testing history:", e);
            localStorage.removeItem('gpro_testing_history');
        }
    }
}

/**
 * Fetches testing data from the GPRO API.
 */
async function fetchTestingData() {
    const token = localStorage.getItem('gpro_api_token');
    if (!token) {
        alert('API Token not found. Please set it in the Race Fetcher tool.');
        return;
    }

    const fetchBtn = document.getElementById('fetchTestingBtn');
    if (fetchBtn) {
        fetchBtn.disabled = true;
        fetchBtn.textContent = 'Fetching...';
    }

    try {
        const [testingRes, driverRes] = await Promise.all([
            fetch(`https://gpro.net/gb/backend/api/v2/Testing`, {
                headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
            }),
            fetch(`https://gpro.net/gb/backend/api/v2/DriProfile`, {
                headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
            })
        ]);

        if (!testingRes.ok) {
            throw new Error(`API Error: ${testingRes.status} ${testingRes.statusText}`);
        }

        const json = await testingRes.json();
        if (driverRes.ok) {
            json.driverProfile = await driverRes.json();
        }

        // Fetch track profile to get lap distance for km calculations
        if (json.trackId) {
            try {
                const trackRes = await fetch(`https://gpro.net/gb/backend/api/v2/TrackProfile?id=${json.trackId}`, {
                    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
                });
                if (trackRes.ok) {
                    json.trackProfile = await trackRes.json();
                }
            } catch (trackErr) {
                console.warn("Failed to fetch track profile details:", trackErr);
            }
        }
        
        // Add a timestamp for reference
        json.fetchedAt = new Date().toLocaleString();
        
        currentTestingData = json;
        renderTestingHistory();
        
        if (json.trackName && typeof renderChart === 'function') {
            const clean = (name) => name ? name.split('(')[0].trim().toLowerCase() : '';
            const target = clean(json.trackName);
            const trackRaces = allRaceData.filter(r => clean(r.trackName) === target);
            renderChart(trackRaces);

            // Update track dropdown to match
            const histTrack = allRaceData.find(r => clean(r.trackName) === target)?.trackName;
            if (histTrack && typeof populateTrackSelector === 'function') {
                populateTrackSelector(histTrack, true);
            }
        }

        if (json.stintsDone && json.stintsDone.length > 0) {
            logDebug(`Fetched ${json.stintsDone.length} testing stints.`);
        }

    } catch (e) {
        let errorMsg = `Error fetching testing data: ${e.message}`;
        if (e.message.includes('401')) {
            errorMsg = `API Error 401 (Unauthorized). Your token is likely invalid.`;
        }
        alert(errorMsg);
    } finally {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.textContent = 'Fetch Testing';
        }
    }
}

/**
 * Deletes all testing history from storage.
 */
function clearTestingHistory() {
    if (confirm("Are you sure you want to clear all testing history?")) {
        testingHistory = [];
        localStorage.removeItem('gpro_testing_history');
        renderTestingHistory();
        logDebug("Testing history cleared.");
    }
}

/**
 * Renders all saved testing sessions as individual cards.
 */
function renderTestingHistory() {
    const container = document.getElementById('testingHistoryContainer');
    if (!container) return;
    
    // Capture the state of the currently focused element
    const activeEl = document.activeElement;
    const activeId = activeEl ? activeEl.id : null;
    const selectionStart = (activeEl && typeof activeEl.selectionStart === 'number') ? activeEl.selectionStart : null;
    const selectionEnd = (activeEl && typeof activeEl.selectionEnd === 'number') ? activeEl.selectionEnd : null;
    
    container.innerHTML = '';

    if (testingHistory.length === 0 && !currentTestingData) {
        container.innerHTML = '<div class="card" style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--text-secondary);">No testing sessions found. Click Fetch to begin.</div>';
        return;
    }

    // Render unified Dashboard only for live session or promote the first history item
    if (currentTestingData) {
        renderTestingDashboard(container, currentTestingData, 'current', true);
    } else if (testingHistory.length > 0) {
        renderTestingDashboard(container, testingHistory[0], 'dash_0', false);
    }

    testingHistory.forEach((session, idx) => {
        const sessionCard = document.createElement('div');
        sessionCard.className = 'card testing-session-card';
        sessionCard.style.gridColumn = '1 / -1';
        sessionCard.innerHTML = renderTestingSessionContent(session, idx);
        container.appendChild(sessionCard);
    });

    // Restore focus after the DOM has been updated to ensure Tab navigation isn't interrupted
    if (activeId) {
        setTimeout(() => {
            const el = document.getElementById(activeId);
            if (el) {
                el.focus();
                if (selectionStart !== null && el.setSelectionRange) {
                    el.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }, 0);
    }
}

/**
 * Renders the primary dashboard containing current weather, car status, 
 * and the next race forecast for preparation.
 */
function renderTestingDashboard(container, data, idx, canSave = false) {
    const dashboardCard = document.createElement('div');
    dashboardCard.className = 'card';
    dashboardCard.style.gridColumn = '1 / -1';
    dashboardCard.style.border = '1px solid var(--accent)';
    
    const getWIcon = (w) => {
        if (!w) return '';
        const l = w.toLowerCase();
        if (l.includes('rain')) return '🌧️';
        if (l.includes('sun')) return '☀️';
        if (l.includes('cloud')) return '☁️';
        return '';
    };

    // Driver Info
    let driverHTML = '';
    if (data.driverProfile) {
        const d = data.driverProfile;
        driverHTML = `
            <div style="flex: 1; min-width: 220px; padding: 10px; border-left: 1px solid var(--border);">
                <h4 style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Driver Attributes</span>
                    <span style="font-size:0.8em; font-weight:normal; color:var(--text-secondary);">OA: <b style="color:var(--text-primary)">${d.overall}</b></span>
                </h4>
                <table class="setup-table" style="width:100%; font-size:0.85em;">
                    <tbody>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Name</td><td style="text-align:right;"><strong>${d.driName}</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Concentration</td><td style="text-align:right;"><strong>${d.concentration}</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Stamina</td><td style="text-align:right;"><strong>${d.stamina}</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Talent</td><td style="text-align:right;"><strong>${d.talent}</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Charisma</td><td style="text-align:right;"><strong>${d.charisma}</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Aggressiveness</td><td style="text-align:right;"><strong>${d.aggressiveness}</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Motivation</td><td style="text-align:right;"><strong>${d.motivation}</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Experience</td><td style="text-align:right;"><strong>${d.experience}</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Reputation</td><td style="text-align:right;"><strong>${d.reputation}</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Tech Insight</td><td style="text-align:right;"><strong>${d.techInsight}</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Weight</td><td style="text-align:right;"><strong>${d.weight}kg</strong></td></tr>
                        <tr><td style="text-align:left; color:var(--text-secondary)">Age</td><td style="text-align:right;"><strong>${d.age}</strong></td></tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    // Car Status
    let carHTML = '';
    if (data.lvlChassis) {
        const parts = [
            { k: 'Cha', v: data.lvlChassis, w: data.usaChassis }, { k: 'Eng', v: data.lvlEngine, w: data.usaEngine },
            { k: 'FW', v: data.lvlFWing, w: data.usaFWing }, { k: 'RW', v: data.lvlRWing, w: data.usaRWing },
            { k: 'Und', v: data.lvlUnderbody, w: data.usaUnderbody }, { k: 'Sid', v: data.lvlSidepods, w: data.usaSidepods },
            { k: 'Coo', v: data.lvlCooling, w: data.usaCooling }, { k: 'Gea', v: data.lvlGear, w: data.usaGear },
            { k: 'Bra', v: data.lvlBrakes, w: data.usaBrakes }, { k: 'Sus', v: data.lvlSusp, w: data.usaSusp },
            { k: 'Ele', v: data.lvlElectronics, w: data.usaElectronics }
        ];
        carHTML = `
            <div style="flex: 1; min-width: 250px; padding: 10px; border-left: 1px solid var(--border);">
                <h4 style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Car Status</span>
                    <span style="font-size:0.8em; font-weight:normal; color:var(--text-secondary);">P:<b>${data.carPower||0}</b> H:<b>${data.carHandl||0}</b> A:<b>${data.carAccel||0}</b></span>
                </h4>
                <table class="setup-table" style="width:100%; font-size:0.85em;">
                    <thead><tr><th style="text-align:left;">Part</th><th>Lvl</th><th style="text-align:right;">Wear</th></tr></thead>
                    <tbody>
                        ${parts.map(p => `<tr><td style="text-align:left; color:var(--text-secondary)">${p.k}</td><td>L${p.v}</td><td style="text-align:right; ${parseInt(p.w) > 90 ? 'color:#ff5252; font-weight:bold;' : ''}">${p.w}%</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    const stints = data.stintsDone || data.testLapsDone || data.lapsDone || [];
    let tableRows = '';
    if (stints.length === 0) {
        tableRows = `<tr><td colspan="16" style="text-align:center; padding:20px; color:var(--text-secondary); font-style:italic;">No stints done in current session.</td></tr>`;
    } else {
        stints.forEach(stint => {
            const getVal = (val) => (val && typeof val === 'object') ? val.value : (val ?? '-');
            const sLaps = stint.lapsDone ? parseInt(stint.lapsDone.toString().split('/')[0]) : 1;
            const sFuelUsed = parseFloat(stint.setFuel || 0) - parseFloat(stint.fuelLeft || 0);
            const fuelCons = sLaps > 0 ? (sFuelUsed / sLaps).toFixed(3) : '0.000';

            tableRows += `
                <tr>
                    <td style="font-weight:bold;">${stint.idx}</td>
                    <td>${stint.lapsDone || '-'}</td>
                    <td style="color:${stint.bestLapTimeColor || 'inherit'};">${stint.bestLapTime}</td>
                    <td style="color:${stint.meanTimeColor || 'inherit'};">${stint.meanLapTime}</td>
                    <td style="font-size:0.85rem;">${stint.stintPriority || '-'}</td>
                    <td>${stint.setTyres}</td>
                    <td style="font-weight:bold; color:${stint.tyreCond < 20 ? '#f44336' : 'inherit'};">${stint.tyreCond}%</td>
                    <td style="font-weight:bold; color:${stint.fuelLeft < 5 ? '#f44336' : 'inherit'};">${stint.fuelLeft}L</td>
                    <td style="font-weight:bold; color:var(--accent);">${fuelCons}</td>
                    <td>${getVal(stint.setFWing)}</td><td>${getVal(stint.setRWing)}</td>
                    <td>${getVal(stint.setEngine)}</td><td>${getVal(stint.setBrakes)}</td>
                    <td>${getVal(stint.setGear)}</td><td>${getVal(stint.setSusp)}</td>
                    <td>${stint.setFuel}L</td>
                </tr>
            `;
        });
    }

    dashboardCard.innerHTML = `
        <div class="card-header">
            <h3>Current Testing Status</h3>
            <div style="display:flex; gap:10px; align-items:center;">
                ${canSave ? `<button onclick="saveCurrentTestingToHistory()" style="padding:4px 8px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px; font-size:0.8rem;">Create New Card</button>` : ''}
            </div>
        </div>

        <div style="padding: 15px; display: flex; flex-wrap: wrap; gap: 20px;">
            <div style="flex: 1; min-width: 150px;">
                <h4 style="margin-bottom:8px;">Test Track Weather: ${data.trackName}</h4>
                <div style="font-size: 1.2rem; font-weight: bold;">${getWIcon(data.weather)} ${data.weather}</div>
                <div style="color:var(--text-secondary); margin-top:4px;">${data.temp}°C / ${data.hum}% Humidity</div>
                <div style="margin-top:10px; font-size:0.85em;">
                    Character Pts: <span style="color:#2196f3;">P:+${data.TestPPoints||0}</span> | <span style="color:#4caf50;">H:+${data.TestHPoints||0}</span> | <span style="color:#ff9800;">A:+${data.TestAPoints||0}</span><br>
                    Resources Left: <strong>${data.lapsLeft ?? '-'} Laps</strong> | <strong>${data.stintsLeft ?? '-'} Stints</strong>
                </div>
            </div>
            ${driverHTML}
            ${carHTML}
        </div>
        ${renderPasteContainerHTML('current', data.trackName, data.weather)}
        <div style="border-bottom: 0px solid var(--border);">
            <h4 style="margin:0;">Session Stints (Laps Done)</h4>
            <div style="overflow-x:auto;">
                <table class="setup-table" style="width:100%; border:none;">
                    <thead>
                        <tr>
                            <th>Stint</th><th>Laps</th><th>Best</th><th>Mean</th><th>Priority</th><th>Tyres</th><th>Cond</th><th>Fuel Left</th><th>L/lap</th><th>FW</th><th>RW</th><th>Eng</th><th>Bra</th><th>Gea</th><th>Sus</th><th>Start Fuel</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    container.appendChild(dashboardCard);
}

function getSessionDate(s) {
    if (!s || !s.fetchedAt) return 0;
    const d = new Date(s.fetchedAt);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

function deleteTestingSession(idx) {
    testingHistory.splice(idx, 1);
    localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
    renderTestingHistory();
}

/**
 * Generates the HTML content for a single testing session card.
 */
function renderTestingSessionContent(data, idx) {
    // Find latest race for this driver for wear calculation
    const driverId = data.driverProfile ? data.driverProfile.id : null;
    let latestRace = null;
    if (typeof allRaceData !== 'undefined' && allRaceData.length > 0) {
        latestRace = allRaceData
            .filter(r => !driverId || (r.driver && r.driver.id == driverId))
            .sort((a, b) => {
                const sA = parseInt(a.selSeasonNb) || 0, sB = parseInt(b.selSeasonNb) || 0;
                if (sA !== sB) return sB - sA;
                return (parseInt(b.selRaceNb) || 0) - (parseInt(a.selRaceNb) || 0);
            })[0];
    }

    // Identify season start: Manual override or if last race was R17
    const isSeasonStart = (data.isSeasonStart !== undefined) 
        ? data.isSeasonStart 
        : (latestRace && parseInt(latestRace.selRaceNb) === 17);

    const isFixed = !!data.isFixed;
    const isManualWear = !!data.isManualWear;
    const manualStartWear = data.manualStartWear || {};
    const isManualEndWear = !!data.isManualEndWear;
    const manualEndWear = data.manualEndWear || {};
    const isManualLvl = !!data.isManualLvl;
    const manualLvl = data.manualLvl || {};
    const isManualWeather = !!data.isManualWeather;
    const isManualCharPoints = !!data.isManualCharPoints;
    const isManualCarChar = !!data.isManualCarChar;
    const isManualDriver = !!data.isManualDriver;

    const partMapping = [
        { name: 'Chassis', key: 'Chassis', raceKey: 'chassis' },
        { name: 'Engine', key: 'Engine', raceKey: 'engine' },
        { name: 'F. Wing', key: 'FWing', raceKey: 'FWing' },
        { name: 'R. Wing', key: 'RWing', raceKey: 'RWing' },
        { name: 'Underbody', key: 'Underbody', raceKey: 'underbody' },
        { name: 'Sidepods', key: 'Sidepods', raceKey: 'sidepods' },
        { name: 'Cooling', key: 'Cooling', raceKey: 'cooling' },
        { name: 'Gearbox', key: 'Gear', raceKey: 'gear' },
        { name: 'Brakes', key: 'Brakes', raceKey: 'brakes' },
        { name: 'Suspension', key: 'Susp', raceKey: 'susp' },
        { name: 'Electronics', key: 'Electronics', raceKey: 'electronics' }
    ];

    // Aligning with gpro-public-api.yml schema
    const stints = data.stintsDone || data.testLapsDone || data.lapsDone || [];
    const pPow = data.TestPPoints || 0;
    const pHand = data.TestHPoints || 0;
    const pAcc = data.TestAPoints || 0;

    const d = data.driverProfile;

    // Group stats by tyre compound
    const tyreStats = {};
    let totalLaps = 0;
    let totalFuelUsed = 0;
    let totalTyreUsed = 0;

    stints.forEach(s => {
        const tyre = s.setTyres || 'Unknown';
        if (!tyreStats[tyre]) tyreStats[tyre] = { laps: 0, fuel: 0, wear: 0 };
        
        const laps = s.lapsDone ? parseInt(s.lapsDone.toString().split('/')[0]) : 0;
        if (!isNaN(laps)) {
            const fuel = parseFloat(s.setFuel || 0) - parseFloat(s.fuelLeft || 0);
            const wear = 100 - parseFloat(s.tyreCond || 100);
            
            tyreStats[tyre].laps += laps;
            tyreStats[tyre].fuel += fuel;
            tyreStats[tyre].wear += wear;
            
            totalLaps += laps;
            totalFuelUsed += fuel;
            totalTyreUsed += wear;
        }
    });

    const trackLengthKm = parseFloat(data.trackLengthKm || (data.trackProfile ? data.trackProfile.lapDistance : 0) || 0);
    const tyreEntries = Object.entries(tyreStats);

    const avgFuelPerLap = totalLaps > 0 ? (totalFuelUsed / totalLaps).toFixed(3) : '0.000';
    const avgFuelPerKm = (totalLaps > 0 && trackLengthKm > 0) ? (totalFuelUsed / (totalLaps * trackLengthKm)).toFixed(3) : 'N/A';

    const consumptionHtml = `<div style="display:flex; justify-content:flex-end; align-items:center;"><span style="margin-right:15px;">Fuel: <strong>${avgFuelPerLap}</strong> L/lap</span>${trackLengthKm > 0 ? `<span>(<strong>${avgFuelPerKm}</strong> L/km)</span>` : ''}</div>`;

    const wearHtml = tyreEntries.map(([tyre, stats]) => {
        const avg = stats.laps > 0 ? (stats.wear / stats.laps).toFixed(3) : '0.000';
        const avgKm = (stats.laps > 0 && trackLengthKm > 0) ? (stats.wear / (stats.laps * trackLengthKm)).toFixed(3) : 'N/A';
        const icon = typeof getTyreIconHtml === 'function' ? getTyreIconHtml(tyre) : '';
        const text = tyreEntries.length > 1 ? ` ${tyre}:` : '';
        const label = `<span style="font-size:0.9em; color:var(--text-secondary); margin-right:8px;">${icon}${text}</span>`;
        return `<div style="display:flex; justify-content:flex-end; align-items:center;">${label}<span style="margin-right:15px;">Tyres: <strong>${avg}</strong> %/lap</span>${trackLengthKm > 0 ? `<span>(<strong>${avgKm}</strong> %/km)</span>` : ''}</div>`;
    }).join('');

    // Time helpers for race projection
    const fmtStrategyTime = (s) => {
        if (!s || s <= 0) return '-';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        return (h > 0 ? h + ':' : '') + m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
    };

    // Calculate weighted average testing lap time
    let totalTestingTime = 0;
    let lapCountForTime = 0;
    stints.forEach(s => {
        const laps = s.lapsDone ? parseInt(s.lapsDone.toString().split('/')[0]) : 0;
        const meanSecs = parseTestingTime(s.meanLapTime);
        if (laps > 0 && meanSecs > 0) {
            totalTestingTime += (meanSecs * laps);
            lapCountForTime += laps;
        }
    });
    const avgLapTime = lapCountForTime > 0 ? totalTestingTime / lapCountForTime : 0;

    // Calculate race distance for projection from historical data
    let raceLaps = 0;
    let pitCost = 30; // 30s fallback if no history
    if (typeof allRaceData !== 'undefined' && data.trackName) {
        const clean = (name) => name ? name.split('(')[0].trim().toLowerCase() : '';
        const target = clean(data.trackName);
        let sumPitCost = 0;
        let pitsFound = 0;

        allRaceData.forEach(r => {
            if (clean(r.trackName) === target && r.laps) {
                const l = r.laps.length - 1;
                if (l > raceLaps) raceLaps = l;

                if (r.pits) {
                    r.pits.forEach(p => {
                        const pt = parseFloat(p.pitTime) || 0;
                        if (pt > 0) {
                            const pl = (typeof calculatePitLoss === 'function') ? (calculatePitLoss(r, p.lap) || 0) : 0;
                            sumPitCost += (pt + pl);
                            pitsFound++;
                        }
                    });
                }
            }
        });
        if (pitsFound > 0) pitCost = sumPitCost / pitsFound;
    }

    const projectedFuel = raceLaps > 0 ? (parseFloat(avgFuelPerLap) * raceLaps).toFixed(1) : null;
    const projectedWearHtml = raceLaps > 0 ? tyreEntries.map(([tyre, stats]) => {
        const totalWear = (stats.laps > 0 ? (stats.wear / stats.laps) * raceLaps : 0).toFixed(1);
        return `<span style="margin-left:15px;">${typeof getTyreIconHtml === 'function' ? getTyreIconHtml(tyre) : ''} <strong>${totalWear}</strong>%</span>`;
    }).join('') : '';

    const strategyHtml = tyreEntries.map(([tyre, stats]) => {
        const wearPerLap = stats.laps > 0 ? (stats.wear / stats.laps) : 0;
        if (wearPerLap <= 0 || raceLaps <= 0) return '';
        const maxLaps = 82 / wearPerLap;
        const numStints = Math.ceil(raceLaps / maxLaps);
    
        let calculatedStints = [];
        let remainingLaps = raceLaps;
    
        for (let i = 1; i <= numStints; i++) {
            let stintLaps = Math.min(maxLaps, remainingLaps);
            if (stintLaps <= 0) break;
    
            calculatedStints.push({
                laps: stintLaps,
                fuel: (parseFloat(avgFuelPerLap) * stintLaps),
                wear: (wearPerLap * stintLaps)
            });
            remainingLaps -= stintLaps;
        }
    
        // Merge last stint if it's less than 25% of the previous one
        if (calculatedStints.length > 1) {
            const lastStint = calculatedStints[calculatedStints.length - 1];
            const previousStint = calculatedStints[calculatedStints.length - 2];
            if (lastStint.laps < (0.25 * previousStint.laps)) {
                previousStint.laps += lastStint.laps;
                previousStint.fuel += lastStint.fuel;
                previousStint.wear += lastStint.wear;
                calculatedStints.pop(); // Remove the merged last stint
            }
        }
    
        const totalRaceTime = avgLapTime > 0 ? (avgLapTime * raceLaps) + ((calculatedStints.length - 1) * pitCost) : 0;

        const stintListHtml = calculatedStints.map((stint, i) => `<span>S${i + 1}: <strong>${stint.laps.toFixed(1)}</strong> (${stint.fuel.toFixed(1)}L, ${(100 - stint.wear).toFixed(1)}%)</span>`).join('<span style="color:var(--border); margin:0 2px;">|</span>');
        const icon = typeof getTyreIconHtml === 'function' ? getTyreIconHtml(tyre) : '';
        return `<div style="display:flex; justify-content:flex-end; align-items:flex-start; margin-top:4px;">
            <span style="font-size:0.85em; color:var(--text-secondary); margin-right:8px; white-space:nowrap;">${icon} ${tyre} (<strong>${fmtStrategyTime(totalRaceTime)}</strong>):</span>
            <div style="font-size:0.85em; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; row-gap:2px; flex:1;">${stintListHtml}</div>
        </div>`;
    }).join('');

    const stintProjectionHtml = tyreEntries.map(([tyre, stats]) => {
        const wearPerLap = stats.laps > 0 ? (stats.wear / stats.laps) : 0;
        if (wearPerLap <= 0) return '';
        const lapsTo18 = (82 / wearPerLap).toFixed(1);
        const fuelForStint = (parseFloat(avgFuelPerLap) * lapsTo18).toFixed(1);
        const icon = typeof getTyreIconHtml === 'function' ? getTyreIconHtml(tyre) : '';
        return `<div style="display:flex; justify-content:flex-end; align-items:center;">
            <span style="font-size:0.9em; color:var(--text-secondary); margin-right:8px;">${icon} ${tyre}:</span>
            <span><strong>${lapsTo18}</strong> laps (${fuelForStint}L)</span>
        </div>`;
    }).join('');

    const lapsBreakdown = stints.map(s => s.lapsDone || 0).join(' / ');

    const wText = data.weather || '';
    const temp = data.temp ?? 0;
    const hum = data.hum ?? 0;

    const driverAttrMap = [
        { k: 'overall', s: 'OA' }, { k: 'concentration', s: 'Con' }, { k: 'talent', s: 'Tal' },
        { k: 'aggressiveness', s: 'Agg' }, { k: 'experience', s: 'Exp' }, { k: 'techInsight', s: 'Tech' },
        { k: 'stamina', s: 'Sta' }, { k: 'charisma', s: 'Cha' }, { k: 'motivation', s: 'Mot' },
        { k: 'reputation', s: 'Rep' }, { k: 'weight', s: 'Wei' }
    ];

    const getWIcon = (w) => {
        if (!w) return '';
        const l = w.toLowerCase();
        if (l.includes('rain')) return '🌧️';
        if (l.includes('sun')) return '☀️';
        if (l.includes('cloud')) return '☁️';
        return '';
    };

    let html = `
        <div class="card-header">
            <button class="dismiss-card-btn" onclick="deleteTestingSession(${idx})" title="Delete this session">&times;</button>
            <h3>${data.trackName || 'Unknown Track'}</h3>
            <div class="subtitle">Testing Session — ${data.fetchedAt || 'Unknown Date'}</div>
        </div>
        ${renderPasteContainerHTML(idx, data.trackName, data.weather)}
        <div class="stat-row">
            <span class="stat-label">Weather</span>
            <span class="stat-val">
                ${(isManualWeather && !isFixed) ? `
                    <input type="text" id="manualWeather_${idx}_weather" value="${wText}" 
                        onchange="updateTestingManualWeather('${idx}', 'weather', this.value)" style="width:80px; background:var(--bg-color); color:var(--text-primary); border:1px solid #555; border-radius:3px; padding:2px;">
                    <input type="number" id="manualWeather_${idx}_temp" value="${temp}" 
                        onchange="updateTestingManualWeather('${idx}', 'temp', this.value)" style="width:40px; background:var(--bg-color); color:var(--text-primary); border:1px solid #555; border-radius:3px; padding:2px;"> °C
                    <input type="number" id="manualWeather_${idx}_hum" value="${hum}" 
                        onchange="updateTestingManualWeather('${idx}', 'hum', this.value)" style="width:40px; background:var(--bg-color); color:var(--text-primary); border:1px solid #555; border-radius:3px; padding:2px;"> %
                ` : `${getWIcon(wText)} ${wText} (${temp}°C / ${hum}% Hum)`}
            </span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Total Laps</span>
            <span class="stat-val">${totalLaps} ${lapsBreakdown ? `<span style="font-weight:normal; color:var(--text-secondary); margin-left:5px;">(${lapsBreakdown})</span>` : ''}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Consumption (Avg)</span>
            <span class="stat-val">
                ${consumptionHtml || '0.000 L/lap'}
                ${trackLengthKm <= 0 ? `<div style="font-size:0.8em; color:var(--text-secondary); text-align:right;" title="Track length (km) not available for per-km calculation.">(N/A km)</div>` : ''}
            </span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Wear (Avg)</span>
            <span class="stat-val">
                ${wearHtml || '0.000 %/lap'}
                ${trackLengthKm <= 0 ? `<div style="font-size:0.8em; color:var(--text-secondary); text-align:right;" title="Track length (km) not available for per-km calculation.">(N/A km)</div>` : ''}
            </span>
        </div>
        ${raceLaps > 0 ? `
        <div class="stat-row" style="background: rgba(76, 175, 80, 0.05); border-left: 2px solid #4caf50;">
            <span class="stat-label">Projected Race (${raceLaps} laps)</span>
            <span class="stat-val">
                <div style="margin-bottom:4px;">Fuel: <strong>${projectedFuel}</strong>L ${projectedWearHtml}</div>
                <div style="border-top: 1px dashed rgba(76, 175, 80, 0.3); padding-top:4px;">${strategyHtml}</div>
            </span>
        </div>
        <div class="stat-row" style="background: rgba(33, 150, 243, 0.05); border-left: 2px solid #2196f3;">
            <span class="stat-label">Max Stint (to 18%)</span>
            <span class="stat-val">${stintProjectionHtml}</span>
        </div>
        ` : ''}
        <div class="stat-row">
            <span class="stat-label">Character Points</span>
            <span class="stat-val" style="display:flex; gap:10px; justify-content:flex-end;">
                ${(isManualCharPoints && !isFixed) ? `
                    <span style="color:#2196f3;">P: <input type="number" id="manualChar_${idx}_P" value="${pPow}" 
                        onchange="updateTestingManualCharPoints('${idx}', 'TestPPoints', this.value)" style="width:40px; background:var(--bg-color); color:inherit; border:1px solid #555; border-radius:3px;"></span>
                    <span style="color:#4caf50;">H: <input type="number" id="manualChar_${idx}_H" value="${pHand}" 
                        onchange="updateTestingManualCharPoints('${idx}', 'TestHPoints', this.value)" style="width:40px; background:var(--bg-color); color:inherit; border:1px solid #555; border-radius:3px;"></span>
                    <span style="color:#ff9800;">A: <input type="number" id="manualChar_${idx}_A" value="${pAcc}" 
                        onchange="updateTestingManualCharPoints('${idx}', 'TestAPoints', this.value)" style="width:40px; background:var(--bg-color); color:inherit; border:1px solid #555; border-radius:3px;"></span>
                ` : `
                    <span style="color:#2196f3;">P: +${pPow}</span>
                    <span style="color:#4caf50;">H: +${pHand}</span>
                    <span style="color:#ff9800;">A: +${pAcc}</span>
                `}
            </span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Car Character</span>
            <span class="stat-val" style="display:flex; gap:10px; justify-content:flex-end;">
                ${(isManualCarChar && !isFixed) ? `
                    <span style="color:#2196f3;">P: <input type="number" id="manualCar_${idx}_P" value="${data.carPower || 0}" 
                        onchange="updateTestingManualCarChar('${idx}', 'carPower', this.value)" style="width:40px; background:var(--bg-color); color:inherit; border:1px solid #555; border-radius:3px;"></span>
                    <span style="color:#4caf50;">H: <input type="number" id="manualCar_${idx}_H" value="${data.carHandl || 0}" 
                        onchange="updateTestingManualCarChar('${idx}', 'carHandl', this.value)" style="width:40px; background:var(--bg-color); color:inherit; border:1px solid #555; border-radius:3px;"></span>
                    <span style="color:#ff9800;">A: <input type="number" id="manualCar_${idx}_A" value="${data.carAccel || 0}" 
                        onchange="updateTestingManualCarChar('${idx}', 'carAccel', this.value)" style="width:40px; background:var(--bg-color); color:inherit; border:1px solid #555; border-radius:3px;"></span>
                ` : `
                    <span style="color:#2196f3;">P: ${data.carPower || 0}</span>
                    <span style="color:#4caf50;">H: ${data.carHandl || 0}</span>
                    <span style="color:#ff9800;">A: ${data.carAccel || 0}</span>
                `}
            </span>
        </div>
            <div class="stat-row">
                <span class="stat-label">Driver Attributes</span>
                <span class="stat-val" style="text-align: right; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px;">
                    ${(isManualDriver && !isFixed) ? 
                        driverAttrMap.map(a => `
                            <span style="font-size:0.9em; white-space:nowrap;">${a.s}: <input type="number" id="manualDri_${idx}_${a.k}" 
                                value="${d[a.k] || 0}" onchange="updateTestingManualDriver('${idx}', '${a.k}', this.value)" style="width:35px; background:var(--bg-color); color:var(--text-primary); border:1px solid #555; border-radius:3px; padding:1px;"></span>
                        `).join('')
                        : `
                        <span style="margin-left:10px;">OA: <span style="color:#2196f3;"><b>${d.overall}</b></span></span>
                        <span style="margin-left:10px;">Con: <span style="color:#4caf50;">${d.concentration}</span></span>
                        <span style="margin-left:10px;">Tal: <span style="color:#4caf50;">${d.talent}</span></span>
                        <span style="margin-left:10px;">Agg: <span style="color:#4caf50;">${d.aggressiveness}</span></span>
                        <span style="margin-left:10px;">Exp: <span style="color:#4caf50;">${d.experience}</span></span>
                        <span style="margin-left:10px;">Tech: <span style="color:#4caf50;">${d.techInsight}</span></span>
                        <span style="margin-left:10px;">Sta: <span style="color:#4caf50;">${d.stamina}</span></span>
                        <span style="margin-left:10px;">Cha: <span style="color:#4caf50;">${d.charisma}</span></span>
                        <span style="margin-left:10px;">Mot: <span style="color:#4caf50;">${d.motivation}</span></span>
                        <span style="margin-left:10px;">Rep: <span style="color:#4caf50;">${d.reputation}</span></span>
                        <span style="margin-left:10px;">Wei: <span style="color:#4caf50;">${d.weight} kg</span></span>
                    `}
                </span>
            </div>

            <div class="stat-row" style="flex-direction: column; align-items: stretch;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-up:40px; ">
                    <span style="font-weight:bold; color:var(--text-primary);">
                        ${isFixed ? 'Fixed Data (Static)' : ((isManualWear || isManualEndWear || isManualLvl || isManualWeather || isManualCharPoints || isManualCarChar || isManualDriver) ? 'Manual Data Tracking' : (isSeasonStart ? 'Season Start Tracking' : (latestRace ? `Comparison with S${latestRace.selSeasonNb} R${latestRace.selRaceNb}` : 'Current Car Status')))}
                    </span>
                    <div style="font-size: 0.8em; color: var(--text-secondary); display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:flex-end;">
                        ${isFixed ? '<span style="color:var(--accent); font-weight:bold;">FIXED</span>' : `
                        <label style="cursor: pointer;"><input type="checkbox" ${isSeasonStart ? 'checked' : ''} onchange="toggleTestingSeasonStart(${idx}, this.checked)"> Season start</label>
                        <label style="cursor: pointer;"><input type="checkbox" ${isManualWeather ? 'checked' : ''} onchange="toggleTestingManualWeather('${idx}', this.checked)"> Weather</label>
                        <label style="cursor: pointer;"><input type="checkbox" ${isManualCharPoints ? 'checked' : ''} onchange="toggleTestingManualCharPoints('${idx}', this.checked)"> Char Pts</label>
                        <label style="cursor: pointer;"><input type="checkbox" ${isManualCarChar ? 'checked' : ''} onchange="toggleTestingManualCarChar('${idx}', this.checked)"> Car Char</label>
                        <label style="cursor: pointer;"><input type="checkbox" ${isManualDriver ? 'checked' : ''} onchange="toggleTestingManualDriver('${idx}', this.checked)"> Driver</label>
                        <label style="cursor: pointer;"><input type="checkbox" ${isManualLvl ? 'checked' : ''} onchange="toggleTestingManualLvl(${idx}, this.checked)"> Manual lvl</label>
                        <label style="cursor: pointer;"><input type="checkbox" ${isManualWear ? 'checked' : ''} onchange="toggleTestingManualWear(${idx}, this.checked)"> Manual start</label>
                        <label style="cursor: pointer;"><input type="checkbox" ${isManualEndWear ? 'checked' : ''} onchange="toggleTestingManualEndWear(${idx}, this.checked)"> Manual end</label>
                        ${(isManualWear || isManualEndWear || isManualLvl || isManualWeather || isManualCharPoints || isManualCarChar || isManualDriver) ? `<button onclick="clearManualTestingWear(${idx})" style="padding: 1px 5px; cursor:pointer; background:#444; color:#ccc; border:1px solid #666; border-radius:3px;">Clear</button>` : ''}
                        `}
                    </div>
                </div>
                <div style="overflow-x: auto;">
                    <table class="setup-table" style="width: 100%; font-size: 0.85em;">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Part</th>
                                ${partMapping.map(p => `<th>${p.name}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="text-align: left; font-weight: bold;">Level</td>
                                ${partMapping.map(p => {
                                    const lvl = isManualLvl ? (manualLvl[p.raceKey] ?? '') : (data['lvl' + p.key] || '-');
                                    if (isManualLvl && !isFixed) {
                                        return `<td><input type="text" id="manualLvl_${idx}_${p.raceKey}"
                                            value="${lvl}" 
                                            placeholder="1" onchange="updateTestingManualLvl(${idx}, '${p.raceKey}', this.value)" 
                                            style="width:35px; text-align:center; background:var(--bg-color); color:var(--text-primary); border:1px solid #555; border-radius:3px; padding: 2px;"></td>`;
                                    }
                                    return `<td>${lvl}</td>`;
                                }).join('')}
                            </tr>
                            <tr>
                                <td style="text-align: left; font-weight: bold;">Starting Wear</td>
                                ${partMapping.map(p => {
                                    let baseline = 0;
                                    if (isManualWear) baseline = parseFloat(manualStartWear[p.raceKey] || 0);
                                    else if (isSeasonStart) baseline = 0;
                                    else if (latestRace && latestRace[p.raceKey] && latestRace[p.raceKey].lvl == (isManualLvl ? manualLvl[p.raceKey] : data['lvl' + p.key])) baseline = latestRace[p.raceKey].finishWear;
                                    else baseline = 0; // Default to 0% if no other starting wear info is available

                                    if (isManualWear && !isFixed) {
                                        return `<td><input type="text" id="manualStart_${idx}_${p.raceKey}"
                                            value="${manualStartWear[p.raceKey] !== undefined ? manualStartWear[p.raceKey] : ''}" 
                                            placeholder="0" onchange="updateTestingManualWear(${idx}, '${p.raceKey}', this.value)" 
                                            style="width:35px; text-align:center; background:var(--bg-color); color:var(--text-primary); border:1px solid #555; border-radius:3px; padding: 2px;"></td>`;
                                    }
                                    return `<td>${Math.round(baseline)}%</td>`;
                                }).join('')}
                            </tr>
                            <tr>
                                <td style="text-align: left; font-weight: bold;">End Wear</td>
                                ${partMapping.map(p => {
                                    const curr = isManualEndWear ? parseFloat(manualEndWear[p.raceKey] || 0) : parseFloat(data['usa' + p.key] || 0);
                                    if (isManualEndWear && !isFixed) {
                                        return `<td><input type="text" id="manualEnd_${idx}_${p.raceKey}"
                                            value="${manualEndWear[p.raceKey] !== undefined ? manualEndWear[p.raceKey] : ''}" 
                                            placeholder="0" onchange="updateTestingManualEndWear(${idx}, '${p.raceKey}', this.value)" 
                                            style="width:35px; text-align:center; background:var(--bg-color); color:var(--text-primary); border:1px solid #555; border-radius:3px; padding: 2px;"></td>`;
                                    }
                                    const color = curr > 80 ? '#f44336' : (curr > 50 ? '#ff9800' : 'var(--text-primary)');
                                    return `<td style="color:${color}; font-weight:bold;">${curr}%</td>`;
                                }).join('')}
                            </tr>
                            <tr>
                                <td style="text-align: left; font-weight: bold;">Used</td>
                                ${partMapping.map(p => {
                                    const curr = isManualEndWear ? parseFloat(manualEndWear[p.raceKey] || 0) : parseFloat(data['usa' + p.key] || 0);
                                    let baseline = 0;
                                    const currentLvl = isManualLvl ? manualLvl[p.raceKey] : data['lvl' + p.key];

                                    if (isManualWear) baseline = parseFloat(manualStartWear[p.raceKey] || 0);
                                    else if (isSeasonStart) baseline = 0;
                                    else if (latestRace && latestRace[p.raceKey] && latestRace[p.raceKey].lvl == currentLvl) baseline = latestRace[p.raceKey].finishWear;
                                    else baseline = 0; // Default to 0% if no other starting wear info is available

                                    const diff = curr - baseline;
                                    return `<td style="color:var(--accent); font-weight:bold;">${diff >= 0 ? '+' : ''}${Math.round(diff)}%</td>`;
                                }).join('')}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <h4 style="margin-top: 40px; margin:0;">Session Stints (Laps Done)</h4>
            ${stints.length === 0 ? '<p style="margin: 15px; font-style: italic; color: var(--text-secondary);">No testing laps recorded.</p>' : `
            <div style="overflow-x: auto;">
                <table class="setup-table" style="width:100%;">
                    <thead>
                        <tr>
                            <th>Stint</th>
                            <th>Laps</th>
                            <th>Best</th>
                            <th>Mean</th>
                            <th>Priority</th>
                            <th>Tyres</th>
                            <th>Cond</th>
                            <th>Fuel Left</th>
                            <th>L/lap</th>
                            <th>FW</th><th>RW</th><th>Eng</th><th>Bra</th><th>Gea</th><th>Sus</th>
                            <th>Start Fuel</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stints.map(stint => {
                            const getVal = (val) => (val && typeof val === 'object') ? val.value : (val ?? '-');
                            const sLaps = stint.lapsDone ? parseInt(stint.lapsDone.toString().split('/')[0]) : 1;
                            const sFuelUsed = parseFloat(stint.setFuel || 0) - parseFloat(stint.fuelLeft || 0);
                            const sTyreUsed = 100 - parseFloat(stint.tyreCond || 100);
                            const fuelCons = sLaps > 0 ? (sFuelUsed / sLaps).toFixed(3) : '0.000';
                            return `
                                <tr>
                                    <td style="font-weight:bold;">${stint.idx}</td>
                                    <td>${stint.lapsDone || '-'}</td>
                                    <td style="color:${stint.bestLapTimeColor || 'inherit'};">${stint.bestLapTime}</td>
                                    <td style="color:${stint.meanTimeColor || 'inherit'};">${stint.meanLapTime}</td>
                                    <td style="font-size:0.85rem;">${stint.stintPriority || '-'}</td>
                                    <td>${stint.setTyres}</td>
                                    <td title="Used: ${(sTyreUsed/sLaps).toFixed(3)}% per lap" style="font-weight:bold; color:${stint.tyreCond < 20 ? '#f44336' : 'inherit'};">${stint.tyreCond}%</td>
                                    <td title="Used: ${(sFuelUsed/sLaps).toFixed(3)}L per lap" style="font-weight:bold; color:${stint.fuelLeft < 5 ? '#f44336' : 'inherit'};">${stint.fuelLeft}L</td>
                                    <td style="font-weight:bold; color:var(--accent);">${fuelCons}</td>
                                    <td>${getVal(stint.setFWing)}</td><td>${getVal(stint.setRWing)}</td>
                                    <td>${getVal(stint.setEngine)}</td><td>${getVal(stint.setBrakes)}</td>
                                    <td>${getVal(stint.setGear)}</td><td>${getVal(stint.setSusp)}</td>
                                    <td>${stint.setFuel}L</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>`}

    `;

    html += `
            </div>
        </details>
        <div style="margin-top: 10px; text-align: right; border-top: 1px solid var(--border); padding-top: 10px; display: flex; justify-content: flex-end; gap: 10px;">
            ${!isFixed ? `<button onclick="updateTestingSessionWithCurrent(${idx})" style="padding: 4px 8px; cursor: pointer; background: #4caf50; color: white; border: none; border-radius: 4px; font-size: 0.8rem;">Update Status</button>` : ''}
            <button onclick="toggleTestingPaste(${idx})" style="padding: 4px 8px; cursor: pointer; background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; font-size: 0.8rem;">Paste Stints</button>
            ${!isFixed ? `<button onclick="fixTestingSession(${idx})" style="padding: 4px 8px; cursor: pointer; background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--accent); border-radius: 4px; font-size: 0.8rem;">Fix Card</button>` : ''}
            <button onclick="downloadTestingJson(${idx})" style="padding: 4px 8px; cursor: pointer; background: var(--card-bg); color: var(--text-secondary); border: 1px solid var(--border); border-radius: 4px; font-size: 0.8rem;">Download JSON</button>
        </div>
    `;

    return html;
}

window.toggleTestingSeasonStart = function(idx, checked) {
    if (testingHistory[idx]) {
        testingHistory[idx].isSeasonStart = checked;
        localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        // Re-render to update calculations
        renderTestingHistory();
    }
};

window.clearManualTestingWear = function(idx) {
    if (testingHistory[idx]) {
        testingHistory[idx].manualStartWear = {};
        testingHistory[idx].manualEndWear = {};
        testingHistory[idx].manualLvl = {};
        localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.toggleTestingManualEndWear = function(idx, checked) {
    if (testingHistory[idx]) {
        testingHistory[idx].isManualEndWear = checked;
        if (checked && !testingHistory[idx].manualEndWear) {
            testingHistory[idx].manualEndWear = {};
        }
        localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.updateTestingManualEndWear = function(idx, partKey, value) {
    if (testingHistory[idx]) {
        if (!testingHistory[idx].manualEndWear) testingHistory[idx].manualEndWear = {};
        testingHistory[idx].manualEndWear[partKey] = parseFloat(value) || 0;
        localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.toggleTestingManualLvl = function(idx, checked) {
    if (testingHistory[idx]) {
        testingHistory[idx].isManualLvl = checked;
        if (checked && !testingHistory[idx].manualLvl) {
            testingHistory[idx].manualLvl = {};
        }
        localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.updateTestingManualLvl = function(idx, partKey, value) {
    if (testingHistory[idx]) {
        if (!testingHistory[idx].manualLvl) testingHistory[idx].manualLvl = {};
        testingHistory[idx].manualLvl[partKey] = value;
        localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};
window.toggleTestingManualWear = function(idx, checked) {
    if (testingHistory[idx]) {
        testingHistory[idx].isManualWear = checked;
        if (checked && !testingHistory[idx].manualStartWear) {
            testingHistory[idx].manualStartWear = {};
        }
        localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.updateTestingManualWear = function(idx, partKey, value) {
    if (testingHistory[idx]) {
        if (!testingHistory[idx].manualStartWear) testingHistory[idx].manualStartWear = {};
        testingHistory[idx].manualStartWear[partKey] = parseFloat(value) || 0;
        localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.fixTestingSession = function(idx) {
    const data = testingHistory[idx];
    if (!data) return;

    if (!confirm("Fixing this card will lock all current data as static. It will no longer update if new race data is added. Continue?")) return;

    const driverId = data.driverProfile ? data.driverProfile.id : null;
    let latestRace = null;
    if (typeof allRaceData !== 'undefined' && allRaceData.length > 0) {
        latestRace = allRaceData
            .filter(r => !driverId || (r.driver && r.driver.id == driverId))
            .sort((a, b) => {
                const sA = parseInt(a.selSeasonNb) || 0, sB = parseInt(b.selSeasonNb) || 0;
                if (sA !== sB) return sB - sA;
                return (parseInt(b.selRaceNb) || 0) - (parseInt(a.selRaceNb) || 0);
            })[0];
    }

    const isSeasonStart = (data.isSeasonStart !== undefined) 
        ? data.isSeasonStart 
        : (latestRace && parseInt(latestRace.selRaceNb) === 17);

    const partMapping = [
        { name: 'Chassis', key: 'Chassis', raceKey: 'chassis' },
        { name: 'Engine', key: 'Engine', raceKey: 'engine' },
        { name: 'F. Wing', key: 'FWing', raceKey: 'FWing' },
        { name: 'R. Wing', key: 'RWing', raceKey: 'RWing' },
        { name: 'Underbody', key: 'Underbody', raceKey: 'underbody' },
        { name: 'Sidepods', key: 'Sidepods', raceKey: 'sidepods' },
        { name: 'Cooling', key: 'Cooling', raceKey: 'cooling' },
        { name: 'Gearbox', key: 'Gear', raceKey: 'gear' },
        { name: 'Brakes', key: 'Brakes', raceKey: 'brakes' },
        { name: 'Suspension', key: 'Susp', raceKey: 'susp' },
        { name: 'Electronics', key: 'Electronics', raceKey: 'electronics' }
    ];

    if (!data.manualLvl) data.manualLvl = {};
    if (!data.manualStartWear) data.manualStartWear = {};
    if (!data.manualEndWear) data.manualEndWear = {};

    partMapping.forEach(p => {
        const currentLvl = data.isManualLvl ? (data.manualLvl[p.raceKey] ?? '') : (data['lvl' + p.key] || '-');
        data.manualLvl[p.raceKey] = currentLvl;

        let baseline = 0;
        if (data.isManualWear) baseline = parseFloat(data.manualStartWear[p.raceKey] || 0);
        else if (isSeasonStart) baseline = 0;
        else if (latestRace && latestRace[p.raceKey] && latestRace[p.raceKey].lvl == currentLvl) baseline = latestRace[p.raceKey].finishWear;
        else baseline = parseFloat(data['usa' + p.key] || 0);
        data.manualStartWear[p.raceKey] = Math.round(baseline);

        const curr = data.isManualEndWear ? parseFloat(data.manualEndWear[p.raceKey] || 0) : parseFloat(data['usa' + p.key] || 0);
        data.manualEndWear[p.raceKey] = Math.round(curr);
    });

    data.isManualLvl = true;
    data.isManualWear = true;
    data.isManualEndWear = true;
    data.isManualWeather = true;
    data.isManualCharPoints = true;
    data.isManualCarChar = true;
    data.isManualDriver = true;
    data.isSeasonStart = false;
    data.isFixed = true;

    localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
    renderTestingHistory();
};

/**
 * Downloads a single testing session as a JSON file.
 */
function downloadTestingJson(idx) {
    const session = testingHistory[idx];
    if (!session) return;

    const filename = `Testing_${session.trackName.replace(/\s+/g, '_')}_${session.fetchedAt.replace(/[:\/, ]+/g, '_')}.json`;
    const jsonStr = JSON.stringify(session, null, 2);
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

/**
 * Exports all saved testing sessions into a single ZIP file containing separate JSON files.
 */
async function exportAllTestingData() {
    if (testingHistory.length === 0) {
        alert("No testing data to export.");
        return;
    }
    if (typeof JSZip === 'undefined') {
        alert("Error: JSZip library not loaded.");
        return;
    }

    const zip = new JSZip();
    testingHistory.forEach(session => {
        const filename = `Testing_${session.trackName.replace(/\s+/g, '_')}_${session.fetchedAt.replace(/[:\/, ]+/g, '_')}.json`;
        zip.file(filename, JSON.stringify(session, null, 2));
    });

    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = "GPRO_Testing_History_Export.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

/**
 * Triggers the hidden file input for loading JSON files.
 */
function triggerTestingLoad() {
    const input = document.getElementById('loadTestingInput');
    if (input) input.click();
}

/**
 * Processes multiple uploaded JSON files and adds them to history.
 */
async function loadTestingJsonFiles(files) {
    if (!files || files.length === 0) return;

    let addedCount = 0;
    for (const file of files) {
        try {
            const text = await file.text();
            const json = JSON.parse(text);

            // Basic validation to ensure it's GPRO testing data
            if (!json.trackName || (!json.stintsDone && !json.testLapsDone && !json.lapsDone)) {
                console.warn(`Skipping ${file.name}: Not a valid GPRO testing session.`);
                continue;
            }

            // Check for duplicates based on the new criteria (temp, hum, best lap)
            const dupIdx = testingHistory.findIndex(s => areSessionsEqual(s, json));

            if (dupIdx === -1) {
                testingHistory.unshift(json);
                addedCount++;
            } else {
                // Duplicate found. Keep the one with the earlier date.
                const existingDate = getSessionDate(testingHistory[dupIdx]);
                const newDate = getSessionDate(json);
                if (newDate > 0 && (existingDate === 0 || newDate < existingDate)) {
                    testingHistory[dupIdx] = json;
                    logDebug(`Replaced testing session for ${json.trackName} with an earlier version.`);
                }
            }
        } catch (e) {
            console.error(`Error parsing ${file.name}:`, e);
        }
    }

    // Sort after importing all to keep the UI consistent
    testingHistory.sort((a, b) => {
        const da = getSessionDate(a);
        const db = getSessionDate(b);
        return db - da;
    });

    if (addedCount > 0) {
        localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
        logDebug(`Imported ${addedCount} testing sessions from files.`);
    }
    // Reset input so the same files can be picked again if needed
    document.getElementById('loadTestingInput').value = '';
}

/**
 * Saves the currently fetched testing data into history as a static card.
 */
window.saveCurrentTestingToHistory = function() {
    if (!currentTestingData) return;
    
    const dupIdx = testingHistory.findIndex(s => areSessionsEqual(s, currentTestingData));
    if (dupIdx > -1 && !confirm("An identical session already exists in history. Create another card anyway?")) return;

    // Capture starting wear from current status as requested
    const manualStartWear = {};
    const parts = ['Chassis', 'Engine', 'FWing', 'RWing', 'Underbody', 'Sidepods', 'Cooling', 'Gear', 'Brakes', 'Susp', 'Electronics'];
    const raceKeys = ['chassis', 'engine', 'FWing', 'RWing', 'underbody', 'sidepods', 'cooling', 'gear', 'brakes', 'susp', 'electronics'];

    parts.forEach((key, i) => {
        manualStartWear[raceKeys[i]] = parseFloat(currentTestingData['usa' + key]) || 0;
    });

    // Create a new session object with manual tracking enabled
    const sessionToSave = {
        ...currentTestingData,
        isManualWear: true,
        manualStartWear: manualStartWear,
        isManualEndWear: true,
        manualEndWear: {} // End wear remains empty until "Update Status" is pressed
    };
    
    testingHistory.unshift(sessionToSave);
    currentTestingData = null;
    localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
    renderTestingHistory();
    logDebug("New testing card created.");
};

/**
 * Updates an existing testing card in history with the data currently in the dashboard.
 */
window.updateTestingSessionWithCurrent = function(idx) {
    if (!currentTestingData) {
        alert("No current testing data available. Please Fetch latest data first.");
        return;
    }
    const session = testingHistory[idx];
    if (!session) return;
    
    if (session.trackName !== currentTestingData.trackName) {
        if (!confirm(`Track names do not match (Card: ${session.trackName}, Current: ${currentTestingData.trackName}). Update anyway?`)) return;
    }

    // Capture end wear from the latest current status
    const manualEndWear = {};
    const parts = ['Chassis', 'Engine', 'FWing', 'RWing', 'Underbody', 'Sidepods', 'Cooling', 'Gear', 'Brakes', 'Susp', 'Electronics'];
    const raceKeys = ['chassis', 'engine', 'FWing', 'RWing', 'underbody', 'sidepods', 'cooling', 'gear', 'brakes', 'susp', 'electronics'];

    parts.forEach((key, i) => {
        manualEndWear[raceKeys[i]] = parseFloat(currentTestingData['usa' + key]) || 0;
    });

    // Update the history session with current results while preserving tracking settings
    testingHistory[idx] = {
        ...currentTestingData,
        fetchedAt: session.fetchedAt, // Retain original creation date
        isSeasonStart: session.isSeasonStart,
        isManualWear: session.isManualWear,
        manualStartWear: session.manualStartWear,
        isManualEndWear: true, // Ensure manual end wear is now active
        manualEndWear: manualEndWear,
        isManualLvl: session.isManualLvl,
        manualLvl: session.manualLvl
    };

    localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
    renderTestingHistory();
    logDebug(`Testing card for ${session.trackName} updated with latest status.`);
};

/**
 * Generates the HTML for the paste stint container.
 */
function renderPasteContainerHTML(suffix, defaultTrack, defaultWeather) {
    return `
        <div id="testingPasteContainer_${suffix}" style="display:none; padding:15px; border-top:1px solid var(--border); background: rgba(255,255,255,0.02);">
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="text" id="pasteTrackName_${suffix}" value="${defaultTrack || ''}" placeholder="Track Name" style="flex:2; padding:5px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
                <input type="text" id="pasteWeather_${suffix}" value="${defaultWeather || ''}" placeholder="Weather (e.g. Sunny)" style="flex:1; padding:5px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
            </div>
            <p style="font-size: 0.85em; color: var(--text-secondary); margin-bottom: 8px;">Paste stint table data from GPRO (Tab-separated). Supports standard and custom table layouts.</p>
            <textarea id="testingPasteArea_${suffix}" rows="5" style="width:100%; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); padding:5px; font-family:monospace;" placeholder="1	10/10	1:23.456	..."></textarea>
            <div style="margin-top:8px; display:flex; gap:10px;">
                <button onclick="importStintsFromPastedData('${suffix}')" style="padding:5px 15px; cursor:pointer; background:#4caf50; color:white; border:none; border-radius:4px;">Parse & Load</button>
                <button onclick="toggleTestingPaste('${suffix}')" style="padding:5px 15px; cursor:pointer; background:#444; color:#ccc; border:none; border-radius:4px;">Cancel</button>
            </div>
        </div>
    `;
}

window.toggleTestingPaste = function(suffix) {
    const el = document.getElementById('testingPasteContainer_' + suffix);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.importStintsFromPastedData = function(suffix) {
    const area = document.getElementById('testingPasteArea_' + suffix);
    const trackInput = document.getElementById('pasteTrackName_' + suffix);
    const weatherInput = document.getElementById('pasteWeather_' + suffix);
    
    const text = area.value.trim();
    if (!text) return;
    
    const lines = text.split('\n');
    const stints = [];
    
    lines.forEach((line, lineIdx) => {
        const parts = line.split('\t');
        if (parts.length < 8) return;
        if (lineIdx === 0 && (parts[0].toLowerCase().includes('stint') || isNaN(parseInt(parts[0])))) return;

        const isCustomFormat = !isNaN(parseInt(parts[4])) && parts.length >= 13;

        if (isCustomFormat) {
            // Format: Stint, Laps, Best, Mean, FW, RW, Eng, Bra, Gea, Sus, Tyres, StartFuel, Cond, FuelLeft
            stints.push({
                idx: parseInt(parts[0]) || (stints.length + 1),
                lapsDone: parts[1],
                bestLapTime: parts[2].replace('s', ''),
                meanLapTime: parts[3].replace('s', ''),
                setFWing: { value: parts[4] },
                setRWing: { value: parts[5] },
                setEngine: { value: parts[6] },
                setBrakes: { value: parts[7] },
                setGear: { value: parts[8] },
                setSusp: { value: parts[9] },
                setTyres: parts[10],
                setFuel: parts[11],
                tyreCond: parseInt(parts[12]) || 0,
                fuelLeft: parseFloat(parts[13]) || 0,
                stintPriority: "-" 
            });
        } else {
            // Standard format: Stint, Laps, Best, Mean, Priority, Tyres, Cond, Fuel Left, FW, RW, Eng, Bra, Gea, Sus, Start Fuel
            stints.push({
                idx: parseInt(parts[0]) || (stints.length + 1),
                lapsDone: parts[1],
                bestLapTime: parts[2],
                meanLapTime: parts[3],
                stintPriority: parts[4],
                setTyres: parts[5],
                tyreCond: parseInt(parts[6]) || 0,
                fuelLeft: parseFloat(parts[7]) || 0,
                setFWing: { value: parts[8] },
                setRWing: { value: parts[9] },
                setEngine: { value: parts[10] },
                setBrakes: { value: parts[11] },
                setGear: { value: parts[12] },
                setSusp: { value: parts[13] },
                setFuel: parts[14] ? parts[14].replace(/L/i, '').trim() : "0"
            });
        }
    });

    if (stints.length > 0) {
        const trackName = trackInput.value.trim() || "Pasted Session";
        const weather = weatherInput.value.trim() || "Sunny";

        if (suffix === 'current') {
            currentTestingData = {
                ...currentTestingData,
                trackName: trackName,
                weather: weather,
                stintsDone: stints,
                temp: currentTestingData?.temp || 20,
                hum: currentTestingData?.hum || 50
            };
        } else {
            const idx = parseInt(suffix);
            if (testingHistory[idx]) {
                testingHistory[idx].trackName = trackName;
                testingHistory[idx].weather = weather;
                testingHistory[idx].stintsDone = stints;
                localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
            }
        }
        
        window.toggleTestingPaste(suffix);
        renderTestingHistory();
    }
};

window.toggleTestingManualWeather = function(idx, checked) {
    const d = (idx === 'current') ? currentTestingData : testingHistory[idx];
    if (d) {
        d.isManualWeather = checked;
        if (idx !== 'current') localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.updateTestingManualWeather = function(idx, field, value) {
    const d = (idx === 'current') ? currentTestingData : testingHistory[idx];
    if (d) {
        d[field] = (field === 'weather') ? value : parseFloat(value);
        if (idx !== 'current') localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.toggleTestingManualCharPoints = function(idx, checked) {
    const d = (idx === 'current') ? currentTestingData : testingHistory[idx];
    if (d) {
        d.isManualCharPoints = checked;
        if (idx !== 'current') localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.updateTestingManualCharPoints = function(idx, field, value) {
    const d = (idx === 'current') ? currentTestingData : testingHistory[idx];
    if (d) {
        d[field] = parseFloat(value) || 0;
        if (idx !== 'current') localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.toggleTestingManualCarChar = function(idx, checked) {
    const d = (idx === 'current') ? currentTestingData : testingHistory[idx];
    if (d) {
        d.isManualCarChar = checked;
        if (idx !== 'current') localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.updateTestingManualCarChar = function(idx, field, value) {
    const d = (idx === 'current') ? currentTestingData : testingHistory[idx];
    if (d) {
        d[field] = parseInt(value) || 0;
        if (idx !== 'current') localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.toggleTestingManualDriver = function(idx, checked) {
    const d = (idx === 'current') ? currentTestingData : testingHistory[idx];
    if (d) {
        d.isManualDriver = checked;
        if (idx !== 'current') localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};

window.updateTestingManualDriver = function(idx, attr, value) {
    const d = (idx === 'current') ? currentTestingData : testingHistory[idx];
    if (d && d.driverProfile) {
        d.driverProfile[attr] = parseInt(value) || 0;
        if (idx !== 'current') localStorage.setItem('gpro_testing_history', JSON.stringify(testingHistory));
        renderTestingHistory();
    }
};