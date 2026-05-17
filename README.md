# citi-scoreboard

A Citi Field-style baseball scoreboard web app.

- `/` — public display page (read-only)
- `/control` — password-protected editor for scores, lineup, count, and batter card

## Running locally

```bash
npm install
npm start
```

App listens on `PORT` (default 8080).

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CONTROL_USER` | Username for the `/control` page | `admin` |
| `CONTROL_PASS` | Password for the `/control` page | `changeme` |
| `PORT` | Port to listen on | `8080` |

State persists to `/data/state.json` if a volume is mounted at `/data`,
otherwise to `./data/state.json`. On first run it is seeded from
`data/state.seed.json`.

The display page does not auto-refresh — reload it after saving changes
in the control panel.
