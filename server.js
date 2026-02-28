const path = require("path");
// This tells dotenv to find the EMBEDDED .env file
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
// ... rest of your code ...wd
const app = express();
const PORT = process.env.PORT || 3000;
const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";
const START_YEAR = 1999;

app.use(express.static(path.join(__dirname, "public")));

function currentYear() {
  return new Date().getFullYear();
}

function requireApiKey() {
  const apiKey = process.env.TBA_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing TBA_API_KEY in environment.");
    err.status = 500;
    throw err;
  }
  return apiKey;
}

async function fetchTBA(endpoint) {
  const apiKey = requireApiKey();
  const response = await fetch(`${TBA_BASE_URL}${endpoint}`, {
    headers: {
      "X-TBA-Auth-Key": apiKey,
      "User-Agent": "scoutingcode/1.0",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(
      `TBA request failed (${response.status}) for ${endpoint}: ${body}`,
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

async function mapWithConcurrency(items, mapper, concurrency = 8) {
  const results = new Array(items.length);
  const chunks = chunk(
    items.map((item, index) => ({ item, index })),
    concurrency,
  );

  for (const c of chunks) {
    const partial = await Promise.all(
      c.map(async ({ item, index }) => ({ index, value: await mapper(item) })),
    );
    for (const { index, value } of partial) {
      results[index] = value;
    }
  }

  return results;
}

function summarizeAwardsForEvent(awardsByEvent, eventKey) {
  const awards = awardsByEvent[eventKey] || [];
  return awards
    .map((a) => a.name)
    .filter(Boolean)
    .join(", ");
}

function parseRecord(status, phase) {
  const source = status && status[phase] ? status[phase] : null;
  if (!source) {
    return { wins: 0, losses: 0, ties: 0 };
  }

  if (source.record) {
    return {
      wins: source.record.wins || 0,
      losses: source.record.losses || 0,
      ties: source.record.ties || 0,
    };
  }

  if (source.ranking && source.ranking.record) {
    return {
      wins: source.ranking.record.wins || 0,
      losses: source.ranking.record.losses || 0,
      ties: source.ranking.record.ties || 0,
    };
  }

  return { wins: 0, losses: 0, ties: 0 };
}

function getAllianceRole(status) {
  const playoff = status && status.alliance ? status.alliance : null;
  if (!playoff) {
    return { alliance: "", role: "", pickOrder: null };
  }

  const allianceName = playoff.name || "";
  const pick = Number.isInteger(playoff.pick)
    ? playoff.pick
    : Number.isInteger(Number(playoff.pick))
      ? Number(playoff.pick)
      : null;
  let role = "";

  if (pick === 0) {
    role = "Captain";
  } else if (pick === 1) {
    role = "First Pick";
  } else if (pick === 2) {
    role = "Second Pick";
  } else if (pick === 3) {
    role = "Backup";
  } else if (pick != null) {
    role = `Pick ${pick}`;
  }

  return {
    alliance: allianceName,
    role,
    pickOrder: pick,
  };
}

function parseEventResult(status) {
  if (!status) {
    return "";
  }

  const playoffLevel =
    status.playoff &&
    typeof status.playoff.level === "string" &&
    status.playoff.level.trim()
      ? status.playoff.level.trim().toLowerCase()
      : "";
  const playoffRoundNameByLevel = {
    ef: "Eighthfinals",
    qf: "Quarterfinals",
    sf: "Semifinals",
    f: "Finals",
  };
  const playoffRoundName = playoffRoundNameByLevel[playoffLevel] || "";
  const extractRoundNumber = (text) => {
    if (typeof text !== "string") {
      return null;
    }
    const match = text.match(/\bround\s*(\d+)\b/i);
    return match ? Number(match[1]) : null;
  };

  const playoffStatus =
    status.playoff && typeof status.playoff.status === "string"
      ? status.playoff.status
      : "";
  const overallStatus =
    typeof status.overall_status_str === "string" ? status.overall_status_str : "";

  const roundFromPlayoff = extractRoundNumber(playoffStatus);
  const roundFromOverall = extractRoundNumber(overallStatus);
  const eliminationRound = roundFromPlayoff ?? roundFromOverall;

  if (/won/i.test(playoffStatus)) {
    return "Won the event";
  }
  if (/eliminated/i.test(playoffStatus) && eliminationRound != null) {
    return `Eliminated in Round ${eliminationRound}`;
  }
  if (/finalist|eliminated in finals/i.test(playoffStatus)) {
    return "Finalist";
  }
  if (
    /eliminated/i.test(playoffStatus) &&
    !/eliminated in/i.test(playoffStatus) &&
    playoffRoundName
  ) {
    return `Eliminated in ${playoffRoundName}`;
  }
  if (playoffStatus) {
    return playoffStatus;
  }

  if (/eliminated/i.test(overallStatus) && eliminationRound != null) {
    return `Eliminated in Round ${eliminationRound}`;
  }
  if (
    /eliminated/i.test(overallStatus) &&
    !/eliminated in/i.test(overallStatus) &&
    playoffRoundName
  ) {
    return `Eliminated in ${playoffRoundName}`;
  }

  return overallStatus;
}

function buildAwardsByEvent(awards) {
  const map = {};
  for (const award of awards || []) {
    if (!award.event_key) {
      continue;
    }
    if (!map[award.event_key]) {
      map[award.event_key] = [];
    }
    map[award.event_key].push(award);
  }
  return map;
}

function bannerBucketFromAwardType(awardType) {
  if (awardType === 1) {
    return "robot";
  }
  if (awardType === 0) {
    return "impact";
  }
  if (awardType === 9) {
    return "other";
  }
  return null;
}

function countBannersFromAwards(awards) {
  const counts = { robot: 0, impact: 0, other: 0 };
  for (const award of awards || []) {
    const bucket = bannerBucketFromAwardType(award.award_type);
    if (bucket) {
      counts[bucket] += 1;
    }
  }
  return counts;
}

function eventSort(a, b) {
  const ad = Number.isFinite(a.start_date)
    ? a.start_date
    : Date.parse(a.start_date || "") || 0;
  const bd = Number.isFinite(b.start_date)
    ? b.start_date
    : Date.parse(b.start_date || "") || 0;
  if (ad !== bd) {
    return bd - ad;
  }
  return (b.name || "").localeCompare(a.name || "");
}

async function loadYearHistory(teamKey, year) {
  const [events, awards] = await Promise.all([
    fetchTBA(`/team/${teamKey}/events/${year}/simple`),
    fetchTBA(`/team/${teamKey}/awards/${year}`),
  ]);

  const awardsByEvent = buildAwardsByEvent(awards);
  const sortedEvents = [...events].sort(eventSort);

  const eventRows = await mapWithConcurrency(
    sortedEvents,
    async (event) => {
      const status = await fetchTBA(
        `/team/${teamKey}/event/${event.key}/status`,
      );
      const qualRecord = parseRecord(status, "qual");
      const playoffRecord = parseRecord(status, "playoff");
      const allianceInfo = getAllianceRole(status);

      const wins = qualRecord.wins + playoffRecord.wins;
      const losses = qualRecord.losses + playoffRecord.losses;
      const ties = qualRecord.ties + playoffRecord.ties;

      const rank =
        status &&
        status.qual &&
        status.qual.ranking &&
        Number.isInteger(status.qual.ranking.rank)
          ? status.qual.ranking.rank
          : null;

      return {
        eventKey: event.key,
        eventName: event.name || event.key,
        eventCode: event.event_code || "",
        district:
          event.district && event.district.abbreviation
            ? event.district.abbreviation
            : "",
        eventType: event.event_type_string || "",
        startDate: event.start_date || "",
        endDate: event.end_date || "",
        city: event.city || "",
        stateProv: event.state_prov || "",
        country: event.country || "",
        week: Number.isInteger(event.week) ? event.week : null,
        awards: summarizeAwardsForEvent(awardsByEvent, event.key),
        rank,
        alliance: allianceInfo.alliance,
        role: allianceInfo.role,
        pickOrder: allianceInfo.pickOrder,
        result: parseEventResult(status),
        record: { wins, losses, ties },
      };
    },
    8,
  );

  const totals = eventRows.reduce(
    (acc, row) => {
      acc.wins += row.record.wins;
      acc.losses += row.record.losses;
      acc.ties += row.record.ties;
      return acc;
    },
    { wins: 0, losses: 0, ties: 0 },
  );

  return {
    year,
    totals,
    bannerCounts: countBannersFromAwards(awards),
    events: eventRows,
  };
}

app.get("/api/team/:teamNumber/history", async (req, res) => {
  try {
    const teamNumber = String(req.params.teamNumber || "").trim();
    if (!/^\d+$/.test(teamNumber)) {
      return res.status(400).json({ error: "Team number must be numeric." });
    }

    const teamKey = `frc${teamNumber}`;
    const team = await fetchTBA(`/team/${teamKey}`);

    if (!team || !team.team_number) {
      return res.status(404).json({ error: `Team ${teamNumber} not found.` });
    }

    const endYear = currentYear();
    const years = [];
    for (let year = endYear; year >= START_YEAR; year -= 1) {
      years.push(year);
    }

    const history = await mapWithConcurrency(
      years,
      async (year) => loadYearHistory(teamKey, year),
      4,
    );

    const bannerCounts = history.reduce(
      (acc, yearData) => {
        acc.robot += yearData.bannerCounts.robot;
        acc.impact += yearData.bannerCounts.impact;
        acc.other += yearData.bannerCounts.other;
        return acc;
      },
      { robot: 0, impact: 0, other: 0 },
    );

    const yearsWithEvents = history.filter((y) => y.events.length > 0);

    return res.json({
      team: {
        key: team.key,
        teamNumber: team.team_number,
        nickname: team.nickname || "",
        name: team.name || "",
        city: team.city || "",
        stateProv: team.state_prov || "",
        country: team.country || "",
        rookieYear: team.rookie_year || null,
        schoolName: team.school_name || "",
        website: team.website || "",
      },
      metadata: {
        startYear: START_YEAR,
        endYear,
        generatedAt: new Date().toISOString(),
      },
      bannerCounts,
      years: yearsWithEvents,
    });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({
      error: error.message || "Unexpected server error.",
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
