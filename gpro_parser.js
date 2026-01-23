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

/**
 * GPRO HTML Parser
 * Extracts race data from GPRO Race Analysis HTML pages.
 */
// Helpers
const txt = (el) => el ? el.innerText.trim() : '';
const num = (el) => el ? parseFloat(el.innerText.replace(/[^\d.-]/g, '')) : 0;
const cleanStr = (str) => str ? str.trim() : '';
const getChange = (el) => {
    if (!el) return "0";
    const match = el.innerText.match(/\(([-+]?\d+)\)/);
    return match ? parseInt(match[1]).toString() : "0";
};

function parseGeneralInfo(doc) {
    const info = {};

    // 1. General Info
    let trackName = 'Unknown Track';
    let trackCountry = '';
    let trackNatCode = '';
    let h1El = doc.querySelector('h1.block.center');
    if (!h1El) h1El = doc.querySelector('h1');
    const h1 = txt(h1El);
    const seasonMatch = h1.match(/Season\s+(\d+)/);
    const raceMatch = h1.match(/Race\s+(\d+)/);
    const groupMatch = h1.match(/\((.*?)\)$/); // Last parenthesis
    
    // Better track extraction from the link inside h1
    const trackLink = h1El ? h1El.querySelector('a') : null; // Keep for trackId

    // Try to extract track name from <title> tag first
    const titleEl = doc.querySelector('title');
    if (titleEl) {
        const titleText = txt(titleEl);
        const titleTrackMatch = titleText.match(/ - Season \d+ - Race \d+ - (.*?) - Grand Prix Racing Online/i);
        if (titleTrackMatch && titleTrackMatch[1]) {
            trackName = titleTrackMatch[1].trim();
            // Attempt to extract country from the title track name
            const titleCountryMatch = trackName.match(/\((.*?)\)$/);
            if (titleCountryMatch) {
                trackCountry = titleCountryMatch[1].trim();
            }
        }
    }

    // Fallback to h1 for trackName if not found in title or if it's "Unknown Track"
    if (trackName === 'Unknown Track' && h1) {
        const nameMatch = h1.match(/(?:analysis|race):\s*([^(]+?)\s*\(/i);
        if (nameMatch) {
            trackName = nameMatch[1].trim();
        }
    }

    // If country wasn't found in title, try from h1
    if (!trackCountry && h1) {
        const countryMatch = h1.match(/\((.*?)\)\s+-\s+Season/);
        trackCountry = countryMatch ? countryMatch[1] : trackCountry;
    }
    
    const flagImg = h1El ? h1El.querySelector('img') : null;
    if (flagImg && flagImg.src) {
        const parts = flagImg.src.split('/');
        trackNatCode = parts[parts.length - 1].split('.')[0];
    }

    const trackIdMatch = trackLink ? trackLink.href.match(/id=(\d+)/) : null;

    return {
        loadingDataState: 0,
        ignoreRefCheck: 0,
        segmentSelected: "",
        unlocked: "",
        selSeasonNb: seasonMatch ? seasonMatch[1] : "0",
        selRaceNb: raceMatch ? raceMatch[1] : "0",
        group: groupMatch ? groupMatch[1] : '',
        trackName: trackName,
        isSupporter: 0,
        trackNatCode: trackNatCode,
        trackCountry: trackCountry,
        trackId: trackIdMatch ? trackIdMatch[1] : "0",
    };
}

function parsePracticeLaps(doc) {
    const laps = [];
    const practiceTable = doc.querySelector('#PracticeData table table');
    if (practiceTable) {
        const rows = practiceTable.querySelectorAll('tr');
        // Skip header rows (first 2)
        for (let i = 2; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length < 12) continue;
            
            // Extract comment from onclick or radio
            const radio = cells[11].querySelector('input');
            let comment = '';
            if (radio && radio.getAttribute('onclick')) {
                const match = radio.getAttribute('onclick').match(/innerHTML='(.*?)';/);
                if (match) comment = match[1].replace(/<[^>]*>/g, ' ').trim();
            }

            laps.push({
                idx: num(cells[0]),
                lapTime: txt(cells[1]),
                misTime: txt(cells[2]),
                netTime: txt(cells[3]),
                setFWing: { value: num(cells[4]) },
                setRWing: { value: num(cells[5]) },
                setEngine: { value: num(cells[6]) },
                setBrakes: { value: num(cells[7]) },
                setGear: { value: num(cells[8]) },
                setSusp: { value: num(cells[9]) },
                setTyres: txt(cells[10]),
                driComments: [comment]
            });
        }
    }
    return laps;
}

function parseHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const generalInfo = parseGeneralInfo(doc);

    const data = {
        ...generalInfo,
        practiceLaps: [],
        q1Time: "",
        q1Pos: "",
        selectedLap: 0,
        q2Time: "",
        q2Pos: "",
        q1Risk: "",
        q2Risk: "",
        startRisk: "",
        overtakeRisk: "",
        defendRisk: "",
        clearDryRisk: "",
        clearWetRisk: "",
        problemRisk: "",
        setupsUsed: [],
        driver: {},
        driverChanges: {
            OA: "0", con: "0", tal: "0", agr: "0", exp: "0", tei: "0", sta: "0", cha: "0", mot: "0", rep: "0", wei: "0"
        },
        q1Energy: { from: 0, to: 0 },
        q2Energy: { from: 0, to: 0 },
        raceEnergy: { from: 0, to: 0 },
        weather: {},
        laps: [],
        pits: [],
        transactions: [],
        total: 0,
        currentBalance: 0,
        chassis: { lvl: 0, startWear: 0, finishWear: 0 },
        engine: { lvl: 0, startWear: 0, finishWear: 0 },
        FWing: { lvl: 0, startWear: 0, finishWear: 0 },
        RWing: { lvl: 0, startWear: 0, finishWear: 0 },
        underbody: { lvl: 0, startWear: 0, finishWear: 0 },
        sidepods: { lvl: 0, startWear: 0, finishWear: 0 },
        cooling: { lvl: 0, startWear: 0, finishWear: 0 },
        gear: { lvl: 0, startWear: 0, finishWear: 0 },
        brakes: { lvl: 0, startWear: 0, finishWear: 0 },
        susp: { lvl: 0, startWear: 0, finishWear: 0 },
        electronics: { lvl: 0, startWear: 0, finishWear: 0 }
    };

    // 2. Practice Laps (Refactored)
    data.practiceLaps = parsePracticeLaps(doc);

    // 3. Car Parts (Wear & Level)
    // Find the "Car wear & lap information" column
    const rightCol = doc.querySelector('.column.right.fiftyfive');
    if (rightCol) {
        const tables = rightCol.querySelectorAll('table.styled.bordered');
        // Find the table that contains "Car parts level"
        let partTable = Array.from(tables).find(t => t.innerText.includes('Car parts level'));
        if (!partTable && tables.length > 0) partTable = tables[0];

        if (partTable) {
            const rows = partTable.querySelectorAll('tr');
            // Row 0: Header "Car parts level"
            // Row 1: Labels (Cha, Eng...)
            // Row 2: Levels
            // Row 3: Header "Car parts wear (at the start)"
            // Row 4: Start Wear
            // Row 5: Header "Car parts wear (at the finish)"
            // Row 6: Finish Wear
            
            const mapParts = ['chassis', 'engine', 'FWing', 'RWing', 'underbody', 'sidepods', 'cooling', 'gear', 'brakes', 'susp', 'electronics'];
            
            if (rows.length >= 7) {
                const levels = rows[2].querySelectorAll('td');
                const startW = rows[4].querySelectorAll('td');
                const finishW = rows[6].querySelectorAll('td');
                
                mapParts.forEach((key, idx) => {
                    data[key] = {
                        lvl: num(levels[idx]),
                        startWear: num(startW[idx]),
                        finishWear: num(finishW[idx])
                    };
                });
            }
        }
    }

    // 4. Laps
    const lapsTable = rightCol ? rightCol.querySelector('table.styled.borderbottom') : null;
    if (lapsTable) {
        const rows = lapsTable.querySelectorAll('tr');
        for (let i = 1; i < rows.length; i++) { // Skip header
            const cells = rows[i].querySelectorAll('td');
            if (cells.length < 8) continue;
            
            const tyreFont = cells[3].querySelector('font');
            const tyreColor = tyreFont ? tyreFont.getAttribute('color') : "";
            const evtTxt = txt(cells[7]);
            const events = (evtTxt !== '-' && evtTxt !== '') ? [{event: evtTxt}] : [];

            data.laps.push({
                idx: num(cells[0]),
                lapTime: txt(cells[1]),
                lapColor: "",
                boostLap: 0,
                pos: num(cells[2]),
                tyres: txt(cells[3]),
                tyreColor: tyreColor,
                weather: txt(cells[4]),
                temp: num(cells[5]),
                hum: num(cells[6]),
                events: events,
                eventsCount: events.length
            });
        }
    }

    // 5. Race Information (Left Column)
    const leftCol = doc.querySelector('.column.left.fortyfive');
    if (leftCol) {
        // Qualify Times
        const qTable = leftCol.querySelectorAll('table.styled.bordered')[0];
        if (qTable) {
            const qCells = qTable.querySelectorAll('tr')[2].querySelectorAll('td');
            data.q1Time = txt(qCells[0]).split(' ')[0];
            data.q1Pos = parseInt(txt(qCells[0]).match(/#(\d+)/)?.[1] || 0);
            data.q2Time = txt(qCells[1]).split(' ')[0];
            data.q2Pos = parseInt(txt(qCells[1]).match(/#(\d+)/)?.[1] || 0);

            if (qCells[0]) {
                const q1Link = qCells[0].querySelector('a');
                if (q1Link && q1Link.href) {
                    const grpMatch = q1Link.href.match(/[?&]Group=([^&]+)/i);
                    if (grpMatch) data.group = decodeURIComponent(grpMatch[1]);
                }
            }
        }

        // Setups Used
        const setupTable = leftCol.querySelectorAll('table.styled.bordered')[1];
        if (setupTable) {
            const rows = setupTable.querySelectorAll('tr');
            for (let i = 2; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                data.setupsUsed.push({
                    session: txt(cells[0]),
                    setFWing: txt(cells[1]),
                    setRWing: txt(cells[2]),
                    setEng: txt(cells[3]),
                    setBra: txt(cells[4]),
                    setGear: txt(cells[5]),
                    setSusp: txt(cells[6]),
                    setTyres: txt(cells[7])
                });
            }
        }

        // Risks
        const riskHeader = Array.from(leftCol.querySelectorAll('th')).find(th => th.innerText.includes('Risks used'));
        const riskTable = riskHeader ? riskHeader.closest('table') : leftCol.querySelectorAll('table.styled.bordered')[2];
        
        if (riskTable) {
            const rows = riskTable.rows;
            if (rows.length >= 7) {
                // Q1/Q2 Risk (Row index 2)
                const nestedTable = rows[2].querySelector('table');
                if (nestedTable) {
                    const nCells = nestedTable.querySelectorAll('td');
                    if (nCells.length >= 2) {
                        data.q1Risk = txt(nCells[0]);
                        data.q2Risk = txt(nCells[1]);
                    }
                }
                
                // Start Risk (Row index 4)
                data.startRisk = txt(rows[4]);

                // Race Risks (Row index 6)
                const rCells = rows[6].querySelectorAll('td');
                if (rCells.length >= 5) {
                    data.overtakeRisk = txt(rCells[0]);
                    data.defendRisk = txt(rCells[1]);
                    data.clearDryRisk = txt(rCells[2]);
                    data.clearWetRisk = txt(rCells[3]);
                    data.problemRisk = txt(rCells[4]);
                }
            }
        }

        // Driver Attributes
        const driverHeader = Array.from(leftCol.querySelectorAll('th')).find(th => th.innerText.includes('Driver name'));
        const driverTable = driverHeader ? driverHeader.closest('table') : leftCol.querySelectorAll('table.styled.bordered')[3];
        
        if (driverTable) {
            const rows = driverTable.querySelectorAll('tr');
            const valRow = rows.length > 2 ? rows[2].querySelectorAll('td') : null;
            const changeRow = rows.length > 3 ? rows[3].querySelectorAll('td') : null;
            
            if (valRow && valRow.length > 0) {
                const link = valRow[0].querySelector('a');
                
                data.driver = {
                    name: link ? txt(link) : txt(valRow[0]),
                    id: link ? parseInt(link.href.match(/ID=(\d+)/)?.[1] || 0) : 0,
                    OA: txt(valRow[1]),
                    con: txt(valRow[2]),
                    tal: txt(valRow[3]),
                    agr: txt(valRow[4]),
                    exp: txt(valRow[5]),
                    tei: txt(valRow[6]),
                    sta: txt(valRow[7]),
                    cha: txt(valRow[8]),
                    mot: txt(valRow[9]),
                    rep: txt(valRow[10]),
                    wei: txt(valRow[11])
                };

                if (changeRow && changeRow.length >= 11) {
                    data.driverChanges = {
                        OA: getChange(changeRow[0]),
                        con: getChange(changeRow[1]),
                        tal: getChange(changeRow[2]),
                        agr: getChange(changeRow[3]),
                        exp: getChange(changeRow[4]),
                        tei: getChange(changeRow[5]),
                        sta: getChange(changeRow[6]),
                        cha: getChange(changeRow[7]),
                        mot: getChange(changeRow[8]),
                        rep: getChange(changeRow[9]),
                        wei: getChange(changeRow[10])
                    };
                }
            }
        }

        // Driver Energy
        const energyHeader = Array.from(leftCol.querySelectorAll('th')).find(th => th.innerText.includes('Driver energy'));
        const energyTable = energyHeader ? energyHeader.closest('table') : leftCol.querySelector('table.styled.center');
        
        if (energyTable) {
            const bars = energyTable.querySelectorAll('.barLabel');
            if (bars.length >= 6) {
                data.q1Energy = { from: num(bars[0]), to: num(bars[1]) };
                data.q2Energy = { from: num(bars[2]), to: num(bars[3]) };
                data.raceEnergy = { from: num(bars[4]), to: num(bars[5]) };
            } else {
                const rows = energyTable.querySelectorAll('tr');
                let q1Idx = -1;
                for(let i=0; i<rows.length; i++) {
                    if (rows[i].innerText.includes('Qualif. 1')) { q1Idx = i; break; }
                }
                if (q1Idx !== -1) {
                    const getE = (rIdx) => {
                        if (rows[rIdx]) {
                            const cells = rows[rIdx].querySelectorAll('td');
                            if (cells.length >= 3) return { from: num(cells[1]), to: num(cells[2]) };
                        }
                        return { from: 0, to: 0 };
                    };
                    data.q1Energy = getE(q1Idx);
                    data.q2Energy = getE(q1Idx + 1);
                    data.raceEnergy = getE(q1Idx + 2);
                }
            }
        }

        // Car Character & Positions (Nested tables)
        // This part is tricky as they are nested.
        // Let's look for "Overall car character" header
        const carCharHeader = Array.from(leftCol.querySelectorAll('th')).find(th => th.innerText.includes('Overall car character'));
        if (carCharHeader) {
            const carTable = carCharHeader.closest('table');
            const cells = carTable.querySelectorAll('tr')[2].querySelectorAll('td');
            data.carPower = num(cells[0]);
            data.carHandl = num(cells[1]);
            data.carAccel = num(cells[2]);
        }

        // Tyre Supplier
        const tyreHeader = Array.from(leftCol.querySelectorAll('th')).find(th => th.innerText.includes('Tyre supplier'));
        if (tyreHeader) {
            const tTable = tyreHeader.closest('table');
            const rows = tTable.rows;
            data.tyreSupplier = {
                name: (rows[1] && rows[1].querySelector('b')) ? txt(rows[1].querySelector('b')) : '',
                peakTemp: (rows[1] && rows[1].cells[2]) ? num(rows[1].cells[2]) : 0,
                dryPerf: (rows[2] && rows[2].cells[1]) ? parseInt(rows[2].cells[1].getAttribute('title')) || 0 : 0,
                wetPerf: (rows[2] && rows[2].cells[3]) ? parseInt(rows[2].cells[3].getAttribute('title')) || 0 : 0,
                durability: (rows[3] && rows[3].cells[1]) ? parseInt(rows[3].cells[1].getAttribute('title')) || 0 : 0,
                warmup: (rows[3] && rows[3].cells[3]) ? parseInt(rows[3].cells[3].getAttribute('title')) || 0 : 0
            };
        }

        // Weather
        const weatherTable = Array.from(leftCol.querySelectorAll('table.styled.bordered.center')).find(t => t.innerText.includes('Sessions weather'));
        if (weatherTable) {
            const rows = weatherTable.querySelectorAll('tr');
            // Row 2: Headers
            // Row 3: Q1 / Race Start data
            const q1Cell = rows[2].querySelectorAll('td')[0];
            const raceCell = rows[2].querySelectorAll('td')[1];
            
            const parseW = (cell) => {
                const img = cell.querySelector('img');
                const text = cell.innerText;
                const temp = text.match(/Temp: (\d+)/);
                const hum = text.match(/Humidity: (\d+)/);
                return {
                    weather: img ? img.title : '',
                    temp: temp ? parseInt(temp[1]) : 0,
                    hum: hum ? parseInt(hum[1]) : 0
                };
            };

            const wQ1 = parseW(q1Cell);
            const wRace = parseW(raceCell);
            
            data.weather.q1Weather = wQ1.weather;
            data.weather.q1Temp = wQ1.temp;
            data.weather.q1Hum = wQ1.hum;
            data.weather.q2Weather = wRace.weather; // Assuming Q2/Race start is same cell
            data.weather.q2Temp = wRace.temp;
            data.weather.q2Hum = wRace.hum;

            // Forecast
            // Row 5: Start - 30m | 30m - 1h
            // Row 6: Data
            // Row 7: 1h - 1h30m | 1h30m - 2h
            // Row 8: Data
            
            const parseForecast = (cell) => {
                const t = cell.innerText;
                const temp = t.match(/Temp: (\d+)° - (\d+)°/);
                const hum = t.match(/Humidity: (\d+)% - (\d+)%/);
                const rain = t.match(/Rain probability:\s*(\d+)%?(?:\s*-\s*(\d+)%)?/);
                return {
                    tL: temp ? parseInt(temp[1]) : 0,
                    tH: temp ? parseInt(temp[2]) : 0,
                    hL: hum ? parseInt(hum[1]) : 0,
                    hH: hum ? parseInt(hum[2]) : 0,
                    rL: rain ? parseInt(rain[1]) : 0,
                    rH: rain && rain[2] ? parseInt(rain[2]) : (rain ? parseInt(rain[1]) : 0)
                };
            };

            const f1 = parseForecast(rows[5].querySelectorAll('td')[0]);
            const f2 = parseForecast(rows[5].querySelectorAll('td')[1]);
            const f3 = parseForecast(rows[7].querySelectorAll('td')[0]);
            const f4 = parseForecast(rows[7].querySelectorAll('td')[1]);

            data.weather.raceQ1TempLow = f1.tL; data.weather.raceQ1TempHigh = f1.tH;
            data.weather.raceQ1HumLow = f1.hL; data.weather.raceQ1HumHigh = f1.hH;
            data.weather.raceQ1RainPLow = f1.rL; data.weather.raceQ1RainPHigh = f1.rH;

            data.weather.raceQ2TempLow = f2.tL; data.weather.raceQ2TempHigh = f2.tH;
            data.weather.raceQ2HumLow = f2.hL; data.weather.raceQ2HumHigh = f2.hH;
            data.weather.raceQ2RainPLow = f2.rL; data.weather.raceQ2RainPHigh = f2.rH;

            data.weather.raceQ3TempLow = f3.tL; data.weather.raceQ3TempHigh = f3.tH;
            data.weather.raceQ3HumLow = f3.hL; data.weather.raceQ3HumHigh = f3.hH;
            data.weather.raceQ3RainPLow = f3.rL; data.weather.raceQ3RainPHigh = f3.rH;

            data.weather.raceQ4TempLow = f4.tL; data.weather.raceQ4TempHigh = f4.tH;
            data.weather.raceQ4HumLow = f4.hL; data.weather.raceQ4HumHigh = f4.hH;
            data.weather.raceQ4RainPLow = f4.rL; data.weather.raceQ4RainPHigh = f4.rH;
        }

        // Fuel & Pits
        // Strategy: Find the table first by headers
        const allTables = Array.from(doc.querySelectorAll('table'));
        const pitTable = allTables.find(t => t.innerText.includes('Pitstop reason') && t.innerText.includes('Refilled to'));
        
        if (pitTable) {
            const rows = pitTable.querySelectorAll('tr');
            for (let i = 1; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                if (cells.length >= 6) {
                    const cell0Text = txt(cells[0]);
                    const stopMatch = cell0Text.match(/Stop\s*(\d+)/i);
                    const lapMatch = cell0Text.match(/Lap\s*(\d+)/i);
                    data.pits.push({
                        idx: stopMatch ? parseInt(stopMatch[1]) : i,
                        lap: lapMatch ? parseInt(lapMatch[1]) : 0,
                        reason: txt(cells[1]),
                        tyreCond: num(cells[2]),
                        fuelLeft: num(cells[3]),
                        refilledTo: txt(cells[4]).toLowerCase().includes('no refill') ? null : num(cells[4]),
                        pitTime: txt(cells[5]).replace(/[^\d.]/g, '')
                    });
                }
            }

            // Extract Start/Finish info from the container
            const container = pitTable.parentElement;
            if (container) {
                const text = container.innerText;
                
                const startFuelMatch = text.match(/Start fuel\s*:\s*([\d.]+)/);
                data.startFuel = startFuelMatch ? parseFloat(startFuelMatch[1]) : 0;
                
                const finishTyresMatch = text.match(/Tyres condition after finish\s*:\s*([\d.]+)%/);
                data.finishTyres = finishTyresMatch ? parseFloat(finishTyresMatch[1]) : 0;
                
                const finishFuelMatch = text.match(/Fuel left in the car after finish\s*:\s*([\d.]+)/);
                data.finishFuel = finishFuelMatch ? parseFloat(finishFuelMatch[1]) : 0;
            }
        }

        // Financial
        const finTable = doc.getElementById('dvFinAnalisysTable');
        if (finTable) {
            const rows = finTable.querySelectorAll('tr');
            // Skip headers. Look for specific labels.
            const getAmount = (label) => {
                for(let r of rows) {
                    if(r.cells[0] && r.cells[0].innerText.includes(label)) {
                        return parseInt(r.cells[1].innerText.replace(/[^\d-]/g, ''));
                    }
                }
                return 0;
            };
            
            data.transactions = [
                { desc: "Race Position", amount: getAmount("Driver race position") },
                { desc: "Qualifying Position", amount: getAmount("Driver qualifying position") },
                { desc: "Sponsor", amount: getAmount("Sponsor money") },
                { desc: "Driver Salary", amount: getAmount("Driver salary") },
                { desc: "Staff Salary", amount: getAmount("Staff salary") },
                { desc: "Facility Costs", amount: getAmount("Facility costs") },
                { desc: "Tyres Contract", amount: getAmount("Tyres contract") }
            ];
            data.total = getAmount("Total:");
            data.currentBalance = getAmount("Current balance:");
        }
        
        // Overtakes
        const otTable = Array.from(leftCol.querySelectorAll('table.styled.bordered')).find(t => t.innerText.includes('Overtaking attempts'));
        if (otTable) {
            const rows = otTable.querySelectorAll('tr');
            // Row 1: Initiated
            // otAttempts = Blocked + Successful
            // overtakes = Successful
            const initBlocked = num(rows[1].querySelectorAll('td')[0]);
            const initSuccess = num(rows[1].querySelectorAll('td')[1]);
            data.otAttempts = (initBlocked + initSuccess).toString();
            data.overtakes = initSuccess.toString();

            const onYouBlocked = num(rows[2].querySelectorAll('td')[0]);
            const onYouSuccess = num(rows[2].querySelectorAll('td')[1]);
            data.otAttemptsOnYou = (onYouBlocked + onYouSuccess).toString();
            data.overtakesOnYou = onYouSuccess.toString();
        }
    }

    return data;
}