const state = {
  tableRows: [],
  tsvRows: []
};

const searchForm = document.getElementById('searchForm');
const teamNumberInput = document.getElementById('teamNumber');
const teamFileInput = document.getElementById('teamFile');
const teamFileLabel = document.getElementById('teamFileLabel');
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('status');
const resultsSection = document.getElementById('resultsSection');
const teamTitle = document.getElementById('teamTitle');
const teamMeta = document.getElementById('teamMeta');
const historyThead = document.getElementById('historyThead');
const historyTbody = document.getElementById('historyTbody');
const copyTeamRowBtn = document.getElementById('copyTeamRowBtn');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b42318' : '';
}

function escapeCell(value) {
  if (value == null) {
    return '';
  }
  return String(value).replace(/[\t\n\r]+/g, ' ').trim();
}

function formatLocation(team) {
  return [team.city, team.stateProv, team.country].filter(Boolean).join(', ');
}

function formatDateMMDDYYYY(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return '';
  }
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}

function formatCompetitionDate(event) {
  const start = formatDateMMDDYYYY(event.startDate || '');
  const end = formatDateMMDDYYYY(event.endDate || '');
  if (start && end && start !== end) {
    return `${start} to ${end}`;
  }
  return start || end || '';
}

function flattenEvents(payload) {
  const events = [];
  for (const yearData of payload.years) {
    for (const event of yearData.events) {
      events.push({ year: yearData.year, ...event });
    }
  }
  return events;
}

function parseTeamNumbers(raw) {
  const tokens = String(raw || '')
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const seen = new Set();
  const valid = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      continue;
    }
    if (!seen.has(token)) {
      seen.add(token);
      valid.push(token);
    }
  }
  return valid;
}

function parseCSVForTeams(text) {
  const lines = String(text || '').split(/\r\n|\n/);
  if (lines.length === 0) {
    return [];
  }

  const firstLine = lines[0] || '';
  let delimiter = ',';
  if (firstLine.includes('\t')) {
    delimiter = '\t';
  } else if (firstLine.includes('|')) {
    delimiter = '|';
  }

  const headers = firstLine
    .split(delimiter)
    .map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const teamIndex = headers.indexOf('team_number');

  const found = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    const cols = line.split(delimiter).map((col) => col.trim().replace(/"/g, ''));
    if (teamIndex !== -1 && cols[teamIndex] && /^\d+$/.test(cols[teamIndex])) {
      found.push(cols[teamIndex]);
      continue;
    }
    for (const col of cols) {
      if (/^\d{2,5}$/.test(col)) {
        found.push(col);
        break;
      }
    }
  }

  return [...new Set(found)];
}

function buildTeamRenderData(result) {
  if (result.error) {
    return {
      isError: true,
      teamNumber: result.teamNumber,
      errorMessage: result.error
    };
  }

  const payload = result.payload;
  const allEvents = flattenEvents(payload);
  const banners = payload.bannerCounts || { robot: 0, impact: 0, other: 0 };

  return {
    isError: false,
    payload,
    teamNumber: payload.team.teamNumber,
    teamName: payload.team.nickname || payload.team.name || '',
    rookieYear: payload.team.rookieYear || '',
    teamLocation: formatLocation(payload.team),
    banners,
    events: allEvents
  };
}

function buildTsvRow(teamData, compSlots) {
  if (teamData.isError) {
    return [teamData.teamNumber, `ERROR: ${teamData.errorMessage}`];
  }

  const row = [
    teamData.teamNumber,
    teamData.teamName,
    teamData.rookieYear,
    teamData.banners.robot,
    teamData.banners.impact,
    teamData.banners.other
  ];

  for (let i = 0; i < compSlots; i += 1) {
    const event = teamData.events[i];
    if (!event) {
      row.push('', '', '', '', '', '');
      continue;
    }

    const name = `${event.year} ${event.eventName}`.trim();
    const date = formatCompetitionDate(event);
    row.push(date ? `${name} (${date})` : name);
    row.push(event.awards || '');
    row.push(event.rank ?? '');
    row.push(event.alliance || '');
    row.push(event.role || '');
    row.push(event.result || '');
  }

  return row;
}

function renderTable(teamDataRows) {
  historyThead.innerHTML = '';
  historyTbody.innerHTML = '';

  if (teamDataRows.length === 0) {
    return;
  }

  const maxComps = teamDataRows.reduce(
    (acc, row) => (row.isError ? acc : Math.max(acc, row.events.length)),
    0
  );

  const groupHeaderCells = [
    '<th colspan="3">Base Data</th>',
    '<th colspan="3">Banners</th>'
  ];
  const subHeaderCells = ['<th>Number</th>', '<th>Name</th>', '<th>Rookie Year</th>', '<th>Robot</th>', '<th>Impact</th>', '<th>Other</th>'];

  for (let i = 0; i < maxComps; i += 1) {
    groupHeaderCells.push(`<th colspan="6">Comp ${i + 1}</th>`);
    subHeaderCells.push('<th>Name</th>', '<th>Awards</th>', '<th>Rank</th>', '<th>Alliance</th>', '<th>Position</th>', '<th>Elim</th>');
  }

  historyThead.innerHTML = `<tr>${groupHeaderCells.join('')}</tr><tr>${subHeaderCells.join('')}</tr>`;

  state.tsvRows = [];

  for (const teamData of teamDataRows) {
    const tr = document.createElement('tr');

    if (teamData.isError) {
      tr.innerHTML = `<td>${escapeCell(teamData.teamNumber)}</td><td colspan="${5 + maxComps * 6}">${escapeCell(teamData.errorMessage)}</td>`;
      historyTbody.appendChild(tr);
      state.tsvRows.push(buildTsvRow(teamData, maxComps));
      continue;
    }

    const baseCells = [
      teamData.teamNumber,
      teamData.teamName,
      teamData.rookieYear,
      teamData.banners.robot,
      teamData.banners.impact,
      teamData.banners.other
    ]
      .map((cell) => `<td>${escapeCell(cell)}</td>`)
      .join('');

    const compCells = [];
    for (let i = 0; i < maxComps; i += 1) {
      const event = teamData.events[i];
      if (!event) {
        compCells.push('<td></td><td></td><td></td><td></td><td></td><td></td>');
        continue;
      }
      const nameLabel = `${event.year} ${event.eventName}`.trim();
      const dateLabel = formatCompetitionDate(event);
      const nameCell = dateLabel
        ? `${escapeCell(nameLabel)}<div class="comp-date">${escapeCell(dateLabel)}</div>`
        : escapeCell(nameLabel);

      compCells.push(
        `<td>${nameCell}</td>`,
        `<td>${escapeCell(event.awards || '')}</td>`,
        `<td>${escapeCell(event.rank ?? '')}</td>`,
        `<td>${escapeCell(event.alliance || '')}</td>`,
        `<td>${escapeCell(event.role || '')}</td>`,
        `<td>${escapeCell(event.result || '')}</td>`
      );
    }

    tr.innerHTML = `${baseCells}${compCells.join('')}`;
    historyTbody.appendChild(tr);
    state.tsvRows.push(buildTsvRow(teamData, maxComps));
  }
}

async function copyRowsToClipboard(rows, label) {
  if (!rows || rows.length === 0) {
    setStatus(`No ${label} data to copy.`, true);
    return;
  }

  const tsv = rows.map((row) => row.map(escapeCell).join('\t')).join('\n');
  await navigator.clipboard.writeText(tsv);
  setStatus(`${label} copied to clipboard (${rows.length} rows).`);
}

async function fetchTeamHistory(teamNumber) {
  const response = await fetch(`/api/team/${teamNumber}/history`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to fetch team history.');
  }
  return payload;
}

async function fetchTeamsWithConcurrency(teamNumbers, concurrency, onOneDone) {
  const results = new Array(teamNumbers.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < teamNumbers.length) {
      const current = nextIndex;
      nextIndex += 1;
      const teamNumber = teamNumbers[current];

      try {
        const payload = await fetchTeamHistory(teamNumber);
        results[current] = { teamNumber, payload };
        onOneDone(teamNumber, null);
      } catch (error) {
        results[current] = { teamNumber, error: error.message };
        onOneDone(teamNumber, error.message);
      }
    }
  }

  const workerCount = Math.min(concurrency, teamNumbers.length);
  const workers = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

teamFileInput.addEventListener('change', async () => {
  const [file] = teamFileInput.files || [];
  if (!file) {
    return;
  }

  teamFileLabel.textContent = `Reading ${file.name}...`;
  try {
    const text = await file.text();
    const teams = parseCSVForTeams(text);
    if (teams.length === 0) {
      teamFileLabel.textContent = `No teams found in ${file.name}`;
      return;
    }
    teamNumberInput.value = teams.join(', ');
    teamFileLabel.textContent = `Loaded ${teams.length} team numbers from ${file.name}`;
  } catch (error) {
    teamFileLabel.textContent = `Could not read ${file.name}`;
    setStatus(`CSV read failed: ${error.message}`, true);
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const teamNumbers = parseTeamNumbers(teamNumberInput.value);
  if (teamNumbers.length === 0) {
    setStatus('Enter at least one numeric team number (or upload CSV).', true);
    return;
  }

  searchBtn.disabled = true;
  setStatus(`Loading ${teamNumbers.length} teams from The Blue Alliance...`);
  resultsSection.classList.remove('hidden');
  historyThead.innerHTML = '';
  historyTbody.innerHTML = '';

  let completed = 0;
  const total = teamNumbers.length;

  try {
    const fetchResults = await fetchTeamsWithConcurrency(
      teamNumbers,
      4,
      (teamNumber, errorMessage) => {
        completed += 1;
        if (errorMessage) {
          setStatus(`Loaded ${completed}/${total}: Team ${teamNumber} failed (${errorMessage}).`);
          return;
        }
        setStatus(`Loaded ${completed}/${total}: Team ${teamNumber} complete.`);
      }
    );

    const teamDataRows = fetchResults.map((result) => buildTeamRenderData(result));
    state.tableRows = teamDataRows;
    renderTable(teamDataRows);

    const successCount = teamDataRows.filter((row) => !row.isError).length;
    const failCount = teamDataRows.length - successCount;

    teamTitle.textContent = `Loaded ${teamDataRows.length} Teams`;
    teamMeta.textContent = [
      `${successCount} successful`,
      failCount > 0 ? `${failCount} failed` : '',
      `${state.tsvRows.length} rows ready`
    ]
      .filter(Boolean)
      .join(' | ');

    setStatus(`Done. Loaded ${successCount}/${teamDataRows.length} teams.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    searchBtn.disabled = false;
  }
});

copyTeamRowBtn.addEventListener('click', async () => {
  try {
    await copyRowsToClipboard(state.tsvRows, 'Team rows TSV');
  } catch (error) {
    setStatus(`Clipboard copy failed: ${error.message}`, true);
  }
});
