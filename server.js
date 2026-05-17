const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Persist state on a volume if mounted at /data, else local ./data
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SEED_FILE = path.join(__dirname, 'data', 'state.seed.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    saveState(seed);
    return seed;
  }
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Basic auth, control routes only ---
const CONTROL_USER = process.env.CONTROL_USER || 'admin';
const CONTROL_PASS = process.env.CONTROL_PASS || 'changeme';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (user === CONTROL_USER && pass === CONTROL_PASS) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Scoreboard Control"');
  res.status(401).send('Authentication required.');
}

// --- API ---
app.get('/api/state', (req, res) => {
  res.json(loadState());
});

app.post('/api/state', requireAuth, (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Invalid state' });
  }
  saveState(incoming);
  res.json({ ok: true });
});

app.post('/api/reset', requireAuth, (req, res) => {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  saveState(seed);
  res.json({ ok: true });
});

// --- Live: pull today's Mets game from MLB statsapi ---
const METS_TEAM_ID = 121;

function todayEastern() {
  // MLB schedules by US date; format as YYYY-MM-DD in America/New_York
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Map an MLB linescore game onto our scoreboard's score/line fields only.
function applyLiveGame(state, game) {
  const ls = game.linescore || {};
  const innings = ls.innings || [];
  const mkInnings = side => {
    const arr = Array(9).fill('');
    innings.forEach(inn => {
      const i = (inn.num || 0) - 1;
      if (i < 0) return;
      const runs = inn[side] && inn[side].runs;
      if (i < arr.length) arr[i] = (runs === undefined || runs === null) ? '' : String(runs);
      else arr.push(runs === undefined || runs === null ? '' : String(runs));
    });
    return arr;
  };
  const team = (side, gTeam) => {
    const t = (ls.teams && ls.teams[side]) || {};
    return {
      code: (gTeam && gTeam.abbreviation) || state[side === 'home' ? 'home' : 'away'].code,
      name: (gTeam && gTeam.teamName) || state[side === 'home' ? 'home' : 'away'].name,
      innings: mkInnings(side),
      R: t.runs ?? 0,
      H: t.hits ?? 0,
      E: t.errors ?? 0
    };
  };
  const gTeams = game.teams || {};
  return {
    ...state,
    away: team('away', gTeams.away && gTeams.away.team),
    home: team('home', gTeams.home && gTeams.home.team),
    count: {
      ...state.count,
      balls: ls.balls ?? state.count.balls,
      strikes: ls.strikes ?? state.count.strikes,
      outs: ls.outs ?? state.count.outs
    }
  };
}

app.post('/api/live', requireAuth, async (req, res) => {
  const date = todayEastern();
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${METS_TEAM_ID}` +
              `&date=${date}&hydrate=linescore,team`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`MLB API responded ${r.status}`);
    const data = await r.json();
    const games = (data.dates && data.dates[0] && data.dates[0].games) || [];
    if (games.length === 0) {
      return res.status(404).json({ error: `No Mets game found for ${date}.` });
    }
    // If a doubleheader, prefer a live game, else the latest
    const live = games.find(g => g.status &&
      g.status.abstractGameState === 'Live');
    const game = live || games[games.length - 1];

    const updated = applyLiveGame(loadState(), game);
    saveState(updated);

    const status = (game.status && game.status.detailedState) || 'Unknown';
    res.json({ ok: true, state: updated, gameStatus: status, date });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach MLB: ' + err.message });
  }
});

// --- Pages ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/control', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

app.listen(PORT, () => {
  console.log(`Scoreboard running on port ${PORT}`);
});
