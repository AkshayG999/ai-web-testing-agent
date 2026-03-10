require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const { Server: SocketServer } = require('socket.io');
const path = require('path');
const fs = require('fs');

const { TestEngine } = require('../core/testEngine');
const { loadSettings } = require('../config/defaults');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new SocketServer(server);

app.use(express.json());

// Serve React dashboard build if available, otherwise fall back to public/
const dashboardDist = path.join(__dirname, 'dashboard', 'dist');
const staticDir = fs.existsSync(dashboardDist) ? dashboardDist : path.join(__dirname, 'public');
app.use(express.static(staticDir));
app.use('/reports', express.static(path.resolve(__dirname, '..', 'reports')));

const configPath = path.join(__dirname, '..', 'config', 'settings.json');
const profilesDir = path.join(__dirname, '..', 'config', 'profiles');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readSettings() {
  return loadSettings(configPath);
}

function writeSettings(newSettings) {
  fs.writeFileSync(configPath, JSON.stringify(newSettings, null, 2), 'utf8');
}

// ── Profile helpers ────────────────────────────────────
function profilePath(id) {
  return path.join(profilesDir, `${id}.json`);
}

function listProfiles() {
  ensureDir(profilesDir);
  return fs.readdirSync(profilesDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(profilesDir, f), 'utf8'));
        return { id: f.replace('.json', ''), ...data };
      } catch { return null; }
    })
    .filter(Boolean);
}

function readProfile(id) {
  const p = profilePath(id);
  if (!fs.existsSync(p)) return null;
  return { id, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function writeProfile(id, data) {
  ensureDir(profilesDir);
  const { id: _, ...rest } = data;
  fs.writeFileSync(profilePath(id), JSON.stringify(rest, null, 2), 'utf8');
}

function deleteProfile(id) {
  const p = profilePath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function generateId(name) {
  return (name || 'profile')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) + '-' + Date.now().toString(36);
}

let currentEngine = null;
const runHistory = [];

// ── Settings API ────────────────────────────────────
app.get('/api/settings', (req, res) => {
  res.json(readSettings());
});

app.put('/api/settings', (req, res) => {
  try {
    const current = readSettings();
    const merged = {
      ...current,
      ...req.body,
      ai: { ...current.ai, ...(req.body.ai || {}) },
      crawl: { ...current.crawl, ...(req.body.crawl || {}) },
      viewport: { ...current.viewport, ...(req.body.viewport || {}) }
    };
    writeSettings(merged);
    res.json({ ok: true, settings: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/providers', (req, res) => {
  const { listProviders } = require('../agent/llmProvider');
  res.json(listProviders());
});

// ── Profiles API ────────────────────────────────────
app.get('/api/profiles', (req, res) => {
  res.json(listProfiles());
});

app.get('/api/profiles/:id', (req, res) => {
  const p = readProfile(req.params.id);
  if (!p) return res.status(404).json({ error: 'Profile not found' });
  res.json(p);
});

app.post('/api/profiles', (req, res) => {
  try {
    const id = generateId(req.body.name);
    writeProfile(id, req.body);
    res.json({ ok: true, id, profile: { id, ...req.body } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/profiles/:id', (req, res) => {
  try {
    if (!readProfile(req.params.id)) return res.status(404).json({ error: 'Profile not found' });
    writeProfile(req.params.id, req.body);
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/profiles/:id', (req, res) => {
  deleteProfile(req.params.id);
  res.json({ ok: true });
});

// ── Status / History / Reports ────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({ running: !!(currentEngine && currentEngine.running) });
});

app.get('/api/runs', (req, res) => {
  res.json(runHistory.slice().reverse());
});

app.get('/api/reports', (req, res) => {
  const reportsDir = path.resolve(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) return res.json([]);
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.endsWith('.html') || f.endsWith('.json'))
    .sort()
    .reverse();
  const reports = files.map(f => ({
    name: f,
    type: f.endsWith('.html') ? 'html' : 'json',
    url: `/reports/${f}`,
    timestamp: parseInt(f.match(/\d+/)?.[0] || '0', 10)
  }));
  res.json(reports);
});

app.post('/api/abort', (req, res) => {
  if (currentEngine && currentEngine.running) {
    currentEngine.abort();
    res.json({ ok: true });
  } else {
    res.json({ ok: false, message: 'No run in progress' });
  }
});

// ── SPA Fallback ────────────────────────────────────
app.get('/{*path}', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not found');
  }
});

// ── Socket.IO ────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('status', { running: !!(currentEngine && currentEngine.running) });

  socket.on('startRun', async (data) => {
    const { url, profileId } = data || {};
    if (!url) return socket.emit('error', { message: 'URL is required' });
    if (currentEngine && currentEngine.running) {
      return socket.emit('error', { message: 'A run is already in progress' });
    }

    const settings = readSettings();
    if (data.settings) {
      Object.assign(settings, data.settings);
      if (data.settings.ai) Object.assign(settings.ai, data.settings.ai);
      if (data.settings.crawl) Object.assign(settings.crawl, data.settings.crawl);
    }

    let profile = null;
    if (profileId) {
      profile = readProfile(profileId);
      if (!profile) {
        return socket.emit('error', { message: `Profile "${profileId}" not found` });
      }
    }

    const engine = new TestEngine(settings, profile);
    currentEngine = engine;

    const events = ['log', 'phase', 'routesDiscovered', 'pageStart', 'pageEnd',
      'scenarioStart', 'scenarioEnd', 'step', 'crawlDone'];
    for (const evt of events) {
      engine.on(evt, (payload) => io.emit(evt, payload));
    }

    io.emit('runStart', { baseUrl: url, settings, profile: profile ? profile.name : null });

    try {
      const result = await engine.run(url);
      const historyEntry = {
        id: Date.now(),
        baseUrl: url,
        profile: profile ? profile.name : null,
        durationMs: result.durationMs,
        pageCount: result.pageCount,
        totalScenarios: result.totalScenarios,
        passed: result.passed,
        failed: result.failed,
        htmlReport: result.htmlReport ? `/reports/${path.basename(result.htmlReport)}` : null,
        jsonReport: result.jsonReport ? `/reports/${path.basename(result.jsonReport)}` : null,
        timestamp: new Date().toISOString()
      };
      runHistory.push(historyEntry);
      io.emit('runEnd', { ...historyEntry, pages: result.pages });
    } catch (err) {
      io.emit('runEnd', { error: err.message });
    }
    currentEngine = null;
  });

  socket.on('abort', () => {
    if (currentEngine && currentEngine.running) currentEngine.abort();
  });
});

server.listen(PORT, () => {
  console.log(`\n  AI Web Tester Dashboard`);
  console.log(`  http://localhost:${PORT}\n`);
});
