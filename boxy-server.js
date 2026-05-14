/**
 * BOXY ERP v17 — LAN Server with Built-in Sync
 * =============================================
 * Serves the ERP to all computers on your LAN AND provides a
 * real sync API so all computers share the same data automatically.
 * Data is stored in boxy-data.json on this PC's hard drive.
 * 
 * Requirements: Node.js 18 or newer
 * Usage:        node boxy-server.js
 * Access:       http://<server-ip>:3000
 * 
 * Place this file in the same folder as BOXY-ERP-v17.html
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

// ── Configuration ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'boxy-data.json');
const ERP_FILE  = path.join(__dirname, 'BOXY-ERP-v17.html');
const LOG_FILE  = path.join(__dirname, 'boxy-access.log');
// ───────────────────────────────────────────────────────────────────────

// ── Helpers ────────────────────────────────────────────────────────────
function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips  = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

function log(msg) {
  const line = `[${new Date().toLocaleString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(e) {}
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type':  'application/json',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function loadSyncData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch(e) { log('WARN: could not read ' + DATA_FILE + ': ' + e.message); }
  return null;
}

function saveSyncData(data) {
  try {
    // Write to temp file then rename — atomic on most OS
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
    return true;
  } catch(e) {
    log('ERROR: could not write ' + DATA_FILE + ': ' + e.message);
    return false;
  }
}
// ───────────────────────────────────────────────────────────────────────

// ── Status page (HTML) ─────────────────────────────────────────────────
function statusPage() {
  const ips  = getLocalIPs();
  const up   = Math.floor(process.uptime());
  const h    = Math.floor(up / 3600);
  const m    = Math.floor((up % 3600) / 60);
  const s    = up % 60;
  const upStr = `${h}h ${m}m ${s}s`;
  const syncData = loadSyncData();
  const lastSaved = syncData?.savedAt
    ? `<span style="color:#22c55e">${new Date(syncData.savedAt).toLocaleString()}</span> by ${syncData.savedBy || '?'} from ${syncData.savedFrom || '?'}`
    : '<span style="color:#f59e0b">No data saved yet</span>';
  const dataSize = fs.existsSync(DATA_FILE)
    ? (fs.statSync(DATA_FILE).size / 1024).toFixed(1) + ' KB'
    : 'N/A';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>BOXY ERP Server</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#0a0f1a;color:#e2e8f0;padding:32px;min-height:100vh}
h1{color:#3b82f6;font-size:22px;margin-bottom:4px}
.sub{font-size:13px;color:#64748b;margin-bottom:24px}
.card{background:#111827;border:1px solid #1e2d42;border-radius:10px;padding:20px;margin-bottom:16px}
.card h2{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:12px}
table{width:100%;border-collapse:collapse}
td{padding:8px 12px;border-bottom:1px solid #1e2d42;font-size:13px}
td:first-child{color:#94a3b8;width:160px}
a{color:#3b82f6}
.ok{color:#22c55e;font-weight:700}
.url{font-weight:700;font-size:15px}
</style></head>
<body>
<h1>&#11035; BOXY ERP Server</h1>
<div class="sub">Version 17 &nbsp;&middot;&nbsp; Node.js ${process.version} &nbsp;&middot;&nbsp; Uptime: ${upStr}</div>

<div class="card">
<h2>Access URLs</h2>
<table>
${ips.map(ip => `<tr><td>LAN (office computers)</td><td><a class="url ok" href="http://${ip}:${PORT}">http://${ip}:${PORT}</a></td></tr>`).join('')}
<tr><td>This computer only</td><td><a class="url" href="http://localhost:${PORT}">http://localhost:${PORT}</a></td></tr>
</table>
</div>

<div class="card">
<h2>Sync Status</h2>
<table>
<tr><td>Data file</td><td><code>${DATA_FILE}</code></td></tr>
<tr><td>File size</td><td>${dataSize}</td></tr>
<tr><td>Last saved</td><td>${lastSaved}</td></tr>
<tr><td>Sync API</td><td><span class="ok">&#x2705; Active</span> &nbsp; <a href="/api/sync/status">/api/sync/status</a></td></tr>
</table>
</div>

<div class="card">
<h2>API Endpoints</h2>
<table>
<tr><td>GET /api/sync</td><td>Returns full ERP data (latest saved)</td></tr>
<tr><td>POST /api/sync</td><td>Saves ERP data from any computer</td></tr>
<tr><td>GET /api/sync/status</td><td>Returns metadata (savedAt, savedBy, size)</td></tr>
</table>
</div>

<div class="card">
<h2>Usage</h2>
<table>
<tr><td>Share this URL</td><td>${ips.map(ip=>`http://${ip}:${PORT}`).join(' &nbsp;|&nbsp; ')}</td></tr>
<tr><td>How to sync</td><td>Settings &#8594; &#x1F310; LAN Server Sync &#8594; Connect &#8594; Save/Load</td></tr>
<tr><td>Auto-backup</td><td>Server auto-saves boxy-data.json &mdash; back up this file daily</td></tr>
</table>
</div>

<script>setTimeout(()=>location.reload(), 30000);</script>
</body></html>`;
}
// ───────────────────────────────────────────────────────────────────────

// ── Main handler ───────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const ip  = req.socket.remoteAddress || '-';
  const url = req.url.split('?')[0];

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // ── GET /api/sync/status ────────────────────────────────────────────
  if (req.method === 'GET' && url === '/api/sync/status') {
    const data = loadSyncData();
    if (!data) return json(res, 200, { exists: false, savedAt: null, savedBy: null, savedFrom: null, sizeKB: 0 });
    const sizeKB = fs.existsSync(DATA_FILE) ? +(fs.statSync(DATA_FILE).size / 1024).toFixed(1) : 0;
    return json(res, 200, { exists: true, savedAt: data.savedAt, savedBy: data.savedBy, savedFrom: data.savedFrom, version: data.version, sizeKB });
  }

  // ── GET /api/sync ────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/api/sync') {
    const data = loadSyncData();
    if (!data) return json(res, 404, { error: 'No sync data yet. Save from the ERP first.' });
    log(`SYNC LOAD by ${ip}`);
    return json(res, 200, data);
  }

  // ── POST /api/sync ───────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/sync') {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      if (!data.version || !data.version.startsWith('BOXY-ERP')) {
        return json(res, 400, { error: 'Invalid BOXY ERP data format' });
      }
      const ok = saveSyncData(data);
      if (!ok) return json(res, 500, { error: 'Failed to write data file' });
      log(`SYNC SAVE by ${ip} (${data.savedBy || '?'} from ${data.savedFrom || '?'})`);
      return json(res, 200, { ok: true, savedAt: data.savedAt });
    } catch(e) {
      return json(res, 400, { error: 'Invalid JSON: ' + e.message });
    }
  }

  // ── GET /status ──────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(statusPage());
  }

  // ── Serve ERP HTML ───────────────────────────────────────────────────
  fs.readFile(ERP_FILE, (err, data) => {
    if (err) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      return res.end(`BOXY ERP file not found: ${ERP_FILE}\n\nMake sure BOXY-ERP-v17.html is in the same folder as boxy-server.js.`);
    }
    // Inject server-mode flag so the ERP auto-detects it's being served
    const html = data.toString('utf8').replace(
      'window.__BOXY_OFFLINE=true;',
      'window.__BOXY_OFFLINE=true;\nwindow.__BOXY_SERVER_MODE=true;'
    );
    res.writeHead(200, {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(html);
    if (!url.includes('.ico')) log(`${ip} — ${req.method} ${url}`);
  });
});
// ───────────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('');
  console.log('  \u2B1B  BOXY ERP Server v17');
  console.log('  ' + '\u2550'.repeat(48));
  console.log(`  \u2705  Running on port ${PORT}`);
  console.log('');
  console.log('  Open in browser (share with office staff):');
  ips.forEach(ip => console.log(`    \u2192 http://${ip}:${PORT}`));
  console.log(`    \u2192 http://localhost:${PORT}   (this computer only)`);
  console.log('');
  console.log('  Server Sync:');
  console.log(`    \u2192 API:     http://localhost:${PORT}/api/sync`);
  console.log(`    \u2192 Status:  http://localhost:${PORT}/status`);
  console.log(`    \u2192 Data:    ${DATA_FILE}`);
  console.log('');
  console.log('  \u26A0  Keep this window open. Press Ctrl+C to stop.');
  console.log('  ' + '\u2550'.repeat(48));
  log(`Server started on port ${PORT}. IPs: ${ips.join(', ')}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n\u274C  Port ${PORT} is already in use.`);
    console.error(`   Stop the other process or change PORT in this file.\n`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  log('Server stopped (Ctrl+C)');
  console.log('\n\n  Server stopped. Goodbye!\n');
  server.close(() => process.exit(0));
});
