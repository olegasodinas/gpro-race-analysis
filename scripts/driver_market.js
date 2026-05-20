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

let cachedDriverMarketData = null;

async function openDriverMarket() {
    currentView = 'driver_market';
    const container = document.getElementById('cardsContainer');
    container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'card';
    card.style.gridColumn = '1 / -1';

    card.innerHTML = `
        <div class="card-header">
            <h3>Driver Market</h3>
            <div class="subtitle">Browse available drivers by skill ranges</div>
            <div style="margin-top:15px; display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <label style="font-size:0.8em; color:var(--text-secondary);">OA Range:</label>
                    <input type="text" id="marketFilterOARange" placeholder="100-110" style="width:70px; padding:5px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
                </div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <label style="font-size:0.8em; color:var(--text-secondary);">Concentration:</label>
                    <input type="text" id="marketFilterCon" placeholder="0-4" style="width:50px; padding:5px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
                </div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <label style="font-size:0.8em; color:var(--text-secondary);">Talent:</label>
                    <input type="text" id="marketFilterTal" placeholder="0-4" style="width:50px; padding:5px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
                </div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <label style="font-size:0.8em; color:var(--text-secondary);">Stamina:</label>
                    <input type="text" id="marketFilterSta" placeholder="0-4" style="width:50px; padding:5px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
                </div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <label style="font-size:0.8em; color:var(--text-secondary);">Age:</label>
                    <input type="text" id="marketFilterAge" placeholder="0-5" style="width:50px; padding:5px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
                </div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <label style="font-size:0.8em; color:var(--text-secondary);">Salary:</label>
                    <input type="text" id="marketFilterSal" placeholder="0-12" style="width:50px; padding:5px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
                </div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <label style="font-size:0.8em; color:var(--text-secondary);">Offers:</label>
                    <input type="text" id="marketFilterOff" placeholder="0-4" style="width:50px; padding:5px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
                </div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <label style="font-size:0.8em; color:var(--text-secondary);">Max:</label>
                    <input type="text" id="marketFilterMaxDrivers" value="20" style="width:40px; padding:5px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;">
                </div>
                <button id="fetchDriversBtn" onclick="fetchAndRenderDriverMarket()" style="padding:5px 15px; cursor:pointer; background:#4caf50; color:white; border:none; border-radius:4px; height:32px;">Fetch Drivers</button>
                <button onclick="returnToDashboard()" style="padding:5px 10px; cursor:pointer; background:var(--accent); color:white; border:none; border-radius:4px;">Back to Dashboard</button>
            </div>
        </div>
        <div id="driverMarketContainer" style="padding: 15px; overflow-x: auto;">
            <!-- Content will be loaded here -->
        </div>
    `;
    container.appendChild(card);

    if (!cachedDriverMarketData) {
        const storedData = localStorage.getItem('gpro_driver_market_data');
        if (storedData) {
            try {
                cachedDriverMarketData = JSON.parse(storedData);
            } catch (e) {
                console.error("Error parsing cached driver market data:", e);
                localStorage.removeItem('gpro_driver_market_data');
            }
        }
    }

    if (cachedDriverMarketData) {
        document.getElementById('fetchDriversBtn').textContent = 'Refresh Drivers';
        renderDriverMarketTable(cachedDriverMarketData);
    } else {
        document.getElementById('driverMarketContainer').innerHTML = '<p>Click "Fetch Drivers" to load data from the GPRO market.</p>';
    }
}

async function fetchAndRenderDriverMarket() {
    const token = localStorage.getItem('gpro_api_token');
    if (!token) {
        document.getElementById('driverMarketContainer').innerHTML = '<p style="color: #f44336;">API Token not found. Please set it in the Race Fetcher tool.</p>';
        return;
    }

    const marketContainer = document.getElementById('driverMarketContainer');
    const fetchBtn = document.getElementById('fetchDriversBtn');
    if (fetchBtn) {
        fetchBtn.disabled = true;
        fetchBtn.textContent = 'Fetching...';
    }

    try {
        let allDrivers = [];
        const maxDrivers = parseInt(document.getElementById('marketFilterMaxDrivers').value) || 20;

        marketContainer.innerHTML = `<p>Fetching drivers... (0 / ${maxDrivers})</p>`;

        const params = new URLSearchParams({
            Sort: 'Con',
            Sort2: 'Tal',
            Sort3: 'Stamina' // Corrected from 'Sta'
        });

        // OA supports Min/Max range filtering
        const oaRange = document.getElementById('marketFilterOARange').value.trim();
        if (oaRange) {
            const parts = oaRange.split('-');
            if (parts.length === 2) {
                if (parts[0].trim()) params.append('MinOA', parts[0].trim());
                if (parts[1].trim()) params.append('MaxOA', parts[1].trim());
            } else {
                params.append('MinOA', oaRange);
            }
        }

        // Other attributes use specific index codes defined in the API (e.g., age=1 for 21-24)
        const directFilters = [
            { id: 'marketFilterCon', api: 'con' },
            { id: 'marketFilterTal', api: 'tal' },
            { id: 'marketFilterSta', api: 'sta' },
            { id: 'marketFilterAge', api: 'age' },
            { id: 'marketFilterSal', api: 'minsal' },
            { id: 'marketFilterOff', api: 'off' }
        ];

        directFilters.forEach(f => {
            const val = document.getElementById(f.id).value.trim();
            if (val !== '') params.append(f.api, val);
        });

        let currentPage = 1;
        let totalPages = 1;

        while (allDrivers.length < maxDrivers && currentPage <= totalPages) {
            params.set('Page', currentPage.toString());
            const res = await fetch(`https://gpro.net/gb/backend/api/v2/AvailDrivers?${params.toString()}`, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) {
                throw new Error(`API Error: ${res.status} ${res.statusText}`);
            }

            const json = await res.json();
            if (json.drivers && json.drivers.length > 0) {
                allDrivers.push(...json.drivers);
            }
            
            totalPages = json.pageCount || 1;
            if (!json.drivers || json.drivers.length === 0 || currentPage >= totalPages) break;

            currentPage++;
            marketContainer.innerHTML = `<p>Fetching drivers... (${allDrivers.length} / ${maxDrivers})</p>`;
        }

        allDrivers = allDrivers.slice(0, maxDrivers);

        cachedDriverMarketData = allDrivers;
        localStorage.setItem('gpro_driver_market_data', JSON.stringify(allDrivers));
        renderDriverMarketTable(allDrivers);

    } catch (e) {
        let errorMsg = `Error fetching drivers: ${e.message}`;
        if (e.message.includes('401')) {
            errorMsg = `Error fetching drivers: API Error 401 (Unauthorized).<br>Your API Token is likely invalid or expired. Please get a new one from the GPRO App (Misc -> API access) and set it in the Race Fetcher tool.`;
            // Clear cache on auth error
            localStorage.removeItem('gpro_driver_market_data');
            cachedDriverMarketData = null;
        }
        marketContainer.innerHTML = `<p style="color: #f44336;">${errorMsg}</p>`;
        logDebug(`Error fetching driver market: ${e.message}`);
    } finally {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.textContent = 'Refresh Drivers';
        }
    }
}

function renderDriverMarketTable(drivers) {
    const container = document.getElementById('driverMarketContainer');
    if (!drivers || drivers.length === 0) {
        container.innerHTML = '<p>No drivers found in the market.</p>';
        return;
    }

    let tableHTML = `
        <table class="setup-table" style="width:100%;">
            <thead>
                <tr>
                    <th onclick="sortTable(this.closest('table'), 0)">Name</th>
                    <th onclick="sortTable(this.closest('table'), 1)">Nat</th>
                    <th onclick="sortTable(this.closest('table'), 2)">Age</th>
                    <th onclick="sortTable(this.closest('table'), 3)" title="Overall">OA</th>
                    <th onclick="sortTable(this.closest('table'), 4)" title="Concentration">Con</th>
                    <th onclick="sortTable(this.closest('table'), 5)" title="Talent">Tal</th>
                    <th onclick="sortTable(this.closest('table'), 6)" title="Stamina">Sta</th>
                    <th onclick="sortTable(this.closest('table'), 7)">Salary</th>
                    <th onclick="sortTable(this.closest('table'), 8)">Fee</th>
                    <th onclick="sortTable(this.closest('table'), 9)">Offers</th>
                    <th onclick="sortTable(this.closest('table'), 10)">Retiring</th>
                </tr>
            </thead>
            <tbody>
    `;

    drivers.forEach(d => {
        const retiring = parseInt(d.retiring) === 1 ? 'Yes' : 'No';
        const salary = parseInt(d.salary).toLocaleString();
        const fee = parseInt(d.signFee).toLocaleString();
        tableHTML += `
            <tr>
                <td style="text-align:left;">
                    <a href="https://www.gpro.net/gb/DriverProfile.asp?ID=${d.driId}" target="_blank" style="color:inherit; text-decoration:underline;">${d.name}</a>
                </td>
                <td>${d.natCode.toUpperCase()}</td>
                <td>${d.age}</td>
                <td style="font-weight:bold; color:var(--accent);">${d.OA}</td>
                <td>${d.con}</td>
                <td>${d.tal}</td>
                <td>${d.sta}</td>
                <td style="text-align:right;">$${salary}</td>
                <td style="text-align:right;">$${fee}</td>
                <td>${d.offers}</td>
                <td style="${retiring === 'Yes' ? 'color:#f44336;' : ''}">${retiring}</td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    container.innerHTML = tableHTML;
}