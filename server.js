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
