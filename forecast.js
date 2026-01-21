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

let currentForecastData = null;

function openRaceForecast() {
    const container = document.getElementById('cardsContainer');
    container.innerHTML = '';
    
    const card = document.createElement('div');
    card.className = 'card';
    card.style.gridColumn = '1 / -1';
    
    const savedToken = localStorage.getItem('gpro_api_token') || '';

    card.innerHTML = `
        <div class="card-header">
            <h3>Race Forecast Parser</h3>
            <div class="subtitle">Extract forecast data from text, HTML file, or API</div>
            <button onclick="returnToDashboard()" style="margin-top:10px; padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
        </div>
        <div style="padding: 20px;">
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border);">
                <label style="display:block; margin-bottom:5px; font-weight:bold;">Fetch from GPRO API:</label>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="apiTokenInput" value="${savedToken}" placeholder="Paste Bearer Token (from GPRO App -> Misc -> API access)" style="flex-grow:1; padding:8px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
                    <button onclick="fetchForecastFromApi()" style="padding:8px 16px; cursor:pointer; background:#2196f3; color:white; border:none; border-radius:4px;">Fetch</button>
                    <button onclick="clearApiToken()" style="padding:8px 16px; cursor:pointer; background:#f44336; color:white; border:none; border-radius:4px;" title="Clear saved token">Clear</button>
                </div>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:5px;">Note: This connects to gpro.net/gb/backend/api/v2/Practice</p>
            </div>
            <div class="upload-box" id="forecastDropZone" onclick="document.getElementById('forecastFileInput').click()">
                <h3>Drop HTML File or Click to Upload</h3>
                <p>Upload a saved Race Analysis or Race Forecast page</p>
                <input type="file" id="forecastFileInput" style="display:none" onchange="handleForecastFile(this.files[0])">
            </div>
            <div style="margin-top: 20px;">
                <label for="forecastText" style="display:block; margin-bottom:5px; font-weight:bold;">Or Paste Forecast Text:</label>
                <textarea id="forecastText" rows="10" style="width:100%; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); padding:10px; font-family:monospace;" placeholder="Paste the weather forecast section here...
Example:
Temp: 16° - 21°
Humidity: 22% - 30%
Rain probability: 0%"></textarea>
                <button onclick="parseForecastText()" style="margin-top:10px; padding:8px 16px; cursor:pointer; background:#4caf50; color:white; border:none; border-radius:4px;">Parse Text</button>
            </div>
            <div id="forecastResult" style="margin-top: 20px;"></div>
        </div>
    `;
    
    container.appendChild(card);
    
    // Setup drag and drop for this specific zone
    const dropZone = document.getElementById('forecastDropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                handleForecastFile(e.dataTransfer.files[0]);
            }
        });
    }
}

function handleForecastFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
             // Use the global parseHTML from gpro_parser.js
             if (typeof parseHTML === 'function') {
                 const data = parseHTML(content);
                 if (data && data.weather && (data.weather.raceQ1TempLow !== undefined || data.weather.q1Temp !== undefined)) {
                     let tName = data.trackName || '';
                     if (data.trackCountry) tName += ` (${data.trackCountry})`;
                     displayForecastResult(data.weather, tName);
                 } else {
                     // Try to parse as text if HTML parsing didn't yield weather
                     parseForecastText(content);
                 }
             } else {
                 parseForecastText(content);
             }
        } else {
            parseForecastText(content);
        }
    };
    reader.readAsText(file);
}

function parseForecastText(textInput) {
    const text = textInput || document.getElementById('forecastText').value;
    if (!text) return;

    const weather = {};
    let trackName = '';

    const trackMatch1 = text.match(/Race analysis:\s*(.+?\(.+?\))\s*-\s*Season/i);
    if (trackMatch1) {
        trackName = trackMatch1[1].trim();
    } else {
        const trackMatch2 = text.match(/Track:\s*(.+?\(.+?\))/i);
        if (trackMatch2) {
            trackName = trackMatch2[1].trim();
        } else {
            const trackMatch3 = text.match(/Next race:\s*(.+?\(.+?\))/i);
            if (trackMatch3) trackName = trackMatch3[1].trim();
        }
    }
    
    // Clean up track name if it contains HTML tags (e.g. from fallback parsing)
    if (trackName) {
        trackName = trackName.replace(/<[^>]*>/g, '');
    }
    
    // Regex to find patterns like "Temp: 10° - 15°" or "Temp: 10 - 15"
    const tempRegex = /Temp:?\s*(\d+)(?:°|C)?\s*[-–—]\s*(\d+)(?:°|C)?/gi;
    const humRegex = /Humidity:?\s*(\d+)%?\s*[-–—]\s*(\d+)%?/gi;
    const rainRegex = /Rain(?: probability)?:?\s*(\d+)%?(?:\s*[-–—]\s*(\d+)%)?/gi;
    
    const temps = [...text.matchAll(tempRegex)];
    const hums = [...text.matchAll(humRegex)];
    const rains = [...text.matchAll(rainRegex)];
    
    if (temps.length > 0 || hums.length > 0) {
        // Assuming order Q1, Q2, Q3, Q4
        for(let i=0; i<4; i++) {
            if (temps[i]) {
                weather[`raceQ${i+1}TempLow`] = parseInt(temps[i][1]);
                weather[`raceQ${i+1}TempHigh`] = parseInt(temps[i][2]);
            }
            if (hums[i]) {
                weather[`raceQ${i+1}HumLow`] = parseInt(hums[i][1]);
                weather[`raceQ${i+1}HumHigh`] = parseInt(hums[i][2]);
            }
            if (rains[i]) {
                weather[`raceQ${i+1}RainPLow`] = parseInt(rains[i][1]);
                weather[`raceQ${i+1}RainPHigh`] = rains[i][2] ? parseInt(rains[i][2]) : parseInt(rains[i][1]);
            }
        }
    }

    // Also check for single values (Current Weather / Next Race)
    // Regex for single values (not ranges)
    const singleTempRegex = /Temp:?\s*(\d+)(?:°|C)?(?!\s*-\s*\d)/gi;
    const singleHumRegex = /Humidity:?\s*(\d+)%?(?!\s*-\s*\d)/gi;
    
    const sTemps = [...text.matchAll(singleTempRegex)];
    const sHums = [...text.matchAll(singleHumRegex)];
    
    if (sTemps.length > 0) {
        // Extract weather text
        // Keywords ordered by length to match longest first
        const keywords = ['Partially Cloudy', 'Very Cloudy', 'Light Rain', 'Heavy Rain', 'Cloudy', 'Sunny', 'Rain', 'Storm', 'Clear'];
        const weatherPattern = new RegExp(`\\b(${keywords.join('|')})\\b(?!\\s*probability)`, 'gi');
        
        // Helper to find weather near a position
        const findWeatherNear = (pos) => {
            // Look back 200 chars and forward 50 chars
            const start = Math.max(0, pos - 200);
            const end = Math.min(text.length, pos + 50);
            const slice = text.substring(start, end);
            
            const matches = [...slice.matchAll(weatherPattern)];
            if (matches.length === 0) return null;
            
            // Find match closest to the relative position of 'pos' in the slice
            // pos in slice is (pos - start)
            const target = pos - start;
            
            // Sort by distance to target
            matches.sort((a, b) => {
                const distA = Math.abs((a.index + a[0].length/2) - target);
                const distB = Math.abs((b.index + b[0].length/2) - target);
                return distA - distB;
            });
            
            return matches[0][1];
        };
        
        // Map to Q1 (Prac) and Q2 (Race)
        if (sTemps[0]) {
            weather.q1Temp = parseInt(sTemps[0][1]);
            const w = findWeatherNear(sTemps[0].index);
            if (w) weather.q1Weather = w;
        }
        if (sHums[0]) weather.q1Hum = parseInt(sHums[0][1]);
        
        if (sTemps[1]) {
            weather.q2Temp = parseInt(sTemps[1][1]);
            const w = findWeatherNear(sTemps[1].index);
            if (w) weather.q2Weather = w;
        }
        if (sHums[1]) weather.q2Hum = parseInt(sHums[1][1]);
    }

    if (Object.keys(weather).length === 0) {
        document.getElementById('forecastResult').innerHTML = '<p style="color:#f44336">No forecast data found in the text.</p>';
        return;
    }
    
    displayForecastResult(weather, trackName);
}

function displayForecastResult(w, trackName) {
    currentForecastData = w;
    const res = document.getElementById('forecastResult');
    res.innerHTML = '';
    
    const getIcon = (txt) => {
        if (!txt) return '';
        const l = txt.toLowerCase();
        if (l.includes('rain')) return '🌧️';
        if (l.includes('storm')) return '⛈️';
        if (l.includes('snow')) return '❄️';
        if (l.includes('partially')) return '⛅';
        if (l.includes('very cloudy')) return '☁️';
        if (l.includes('cloud')) return '☁️';
        if (l.includes('sun') || l.includes('clear')) return '☀️';
        return '❓';
    };

    let html = '';

    // Current Weather Table (Next Race)
    if (w.q1Temp !== undefined || w.q2Temp !== undefined) {
        html += `
            <h4 style="border-bottom:1px solid var(--border); padding-bottom:5px;">Current Weather${trackName ? ' - ' + trackName : ''}</h4>
            <table class="setup-table" style="width:100%; max-width:600px; margin-bottom:20px;">
                <thead>
                    <tr>
                        <th>Session</th>
                        <th>Weather</th>
                        <th>Temp</th>
                        <th>Humidity</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="font-weight:bold;">Practice / Qualify 1</td>
                        <td>${getIcon(w.q1Weather)} ${w.q1Weather || '-'}</td>
                        <td>${w.q1Temp !== undefined ? w.q1Temp + '°' : '-'}</td>
                        <td>${w.q1Hum !== undefined ? w.q1Hum + '%' : '-'}</td>
                    </tr>
                    <tr>
                        <td style="font-weight:bold;">Qualify 2 / Race Start</td>
                        <td>${getIcon(w.q2Weather)} ${w.q2Weather || '-'}</td>
                        <td>${w.q2Temp !== undefined ? w.q2Temp + '°' : '-'}</td>
                        <td>${w.q2Hum !== undefined ? w.q2Hum + '%' : '-'}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }
    
    // Forecast Table
    if (w.raceQ1TempLow !== undefined) {
        html += `
            <h4 style="border-bottom:1px solid var(--border); padding-bottom:5px;">Race Forecast${trackName ? ' - ' + trackName : ''}</h4>
            <table class="setup-table" style="width:100%; max-width:800px;">
                <thead>
                    <tr>
                    <th>Metric</th>
                    <th>Start - 30m</th>
                    <th>30m - 1h</th>
                    <th>1h - 1h30m</th>
                    <th>1h30m - 2h</th>
                    </tr>
                </thead>
                <tbody>
        `;

    // Temp Row
    html += `<tr><td style="font-weight:bold;">Temp</td>`;
    for(let i=1; i<=4; i++) {
        const tL = w[`raceQ${i}TempLow`];
        const tH = w[`raceQ${i}TempHigh`];
        html += `<td>${tL !== undefined ? tL + '° - ' + tH + '°' : '-'}</td>`;
    }
    html += `</tr>`;

    // Humidity Row
    html += `<tr><td style="font-weight:bold;">Humidity</td>`;
    for(let i=1; i<=4; i++) {
        const hL = w[`raceQ${i}HumLow`];
        const hH = w[`raceQ${i}HumHigh`];
        html += `<td>${hL !== undefined ? hL + '% - ' + hH + '%' : '-'}</td>`;
    }
    html += `</tr>`;

    // Rain Row
    html += `<tr><td style="font-weight:bold;">Rain Probability</td>`;
    for(let i=1; i<=4; i++) {
        const rL = w[`raceQ${i}RainPLow`];
        const rH = w[`raceQ${i}RainPHigh`];
        html += `<td>${rL !== undefined ? rL + '% - ' + rH + '%' : '-'}</td>`;
    }
    html += `</tr>`;

        html += `</tbody></table>`;

        html += `
            <div style="margin-top:15px;">
                <button onclick="searchForSimilarWeather(currentForecastData, 'rain')" style="padding:6px 12px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Find Races with Similar Rain</button>
            </div>
        `;
    }
    
    if (!html) {
        res.innerHTML = '<p style="color:#f44336">Incomplete or invalid data extracted.</p>';
    } else {
        res.innerHTML = html;
    }
}

function fetchForecastFromApi() {
    const tokenInput = document.getElementById('apiTokenInput');
    const token = tokenInput.value.trim();
    if (!token) {
        alert("Please enter your GPRO API Token.");
        return;
    }
    
    localStorage.setItem('gpro_api_token', token);

    const url = 'https://gpro.net/gb/backend/api/v2/Practice';

    fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok: ' + response.status + ' ' + response.statusText);
        }
        return response.json();
    })
    .then(data => {
        if (data && data.weather) {
            let trackName = data.trackName || 'Unknown Track';
            if (data.trackNat) trackName += ' (' + data.trackNat + ')';
            displayForecastResult(data.weather, trackName);
        } else {
            alert("No weather data found in API response.");
        }
    })
    .catch(error => {
        console.error('Error fetching forecast:', error);
        alert("Error fetching forecast: " + error.message + "\n\nCheck console for details. Ensure you have internet access and CORS is not blocking the request.");
    });
}

function clearApiToken() {
    localStorage.removeItem('gpro_api_token');
    document.getElementById('apiTokenInput').value = '';
    alert("Token cleared from storage.");
}