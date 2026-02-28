# ScoutingCode - Blue Alliance Team History Explorer

Fullstack app for pulling an FRC team's complete historical event data from The Blue Alliance API (1999 through current year), showing it in a scouting table, and copying as TSV for Google Sheets.

## Setup

1. Get a Blue Alliance API key from your account page.
2. Create `.env` from `.env.example` and set `TBA_API_KEY`.
3. Install deps (already done in this workspace):
   - `npm install`
4. Start server:
   - `npm run dev`
5. Open:
   - `http://localhost:3000`

## Features

- Fullstack Express app with static frontend.
- API endpoint `GET /api/team/:teamNumber/history`.
- Aggregates data for every season from `1999` to current year.
- Event table view with columns matching scouting/export needs.
- Clipboard export buttons:
  - `Copy Event Rows TSV` (one row per event)
  - `Copy Year Summary TSV` (one wide row per year, similar to your sample format)

## Notes

- If a team has no events in a year, that year is omitted from results.
- Some older events may have incomplete status fields in TBA; blanks are expected in those cases.
