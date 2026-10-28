const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API_BASE = 'https://yce-api-01.makeupar.com';
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'fixtures', 'cache');
const LEDGER = path.join(ROOT, 'fixtures', 'units_ledger.json');

fs.mkdirSync(CACHE_DIR, { recursive: true });

const SD_CONCERNS = [
  'wrinkle', 'pore', 'texture', 'acne', 'oiliness', 'radiance', 'eye_bag', 'age_spot',
  'dark_circle_v2', 'droopy_upper_eyelid', 'droopy_lower_eyelid', 'firmness', 'moisture',
  'redness', 'tear_trough', 'skin_type'
];

function skinAnalysisUnits(n, hd) {
  if (n <= 4) return hd ? 12 : 9;
  if (n <= 8) return hd ? 16 : 12;
  if (n <= 12) return hd ? 20 : 14;
  return hd ? 22 : 16;
}

function simulationUnits(n) {
  return n <= 4 ? 4 : 6;
}

function apiKey() {
  const k = process.env.YOUCAM_OFFLINE === '1' ? '' : process.env.YOUCAM_API_KEY;
  if (!k) {
    const e = new Error('Offline demo mode: this photo has no cached YouCam result. Set YOUCAM_API_KEY to analyze new photos.');
    e.code = 'NO_KEY';
    e.status = 409;
    throw e;
  }
  return k;
}

function sha(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function log(msg) {
  process.stdout.write(`[youcam ${new Date().toISOString().slice(11, 19)}] ${msg}\n`);
}

function appendLedger(entry) {
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (_) {}
  rows.push({ at: new Date().toISOString(), ...entry });
  fs.writeFileSync(LEDGER, JSON.stringify(rows, null, 2));
}

function unitsSpent() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, 'utf8')).reduce((s, r) => s + (r.status === 'success' ? r.units : 0), 0);
  } catch (_) { return 0; }
}

async function api(method, urlPath, body) {
  const res = await fetch(API_BASE + urlPath, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }
  if (!res.ok) {
    const e = new Error(`YouCam ${method} ${urlPath} -> ${res.status}: ${json.error || text.slice(0, 200)}`);
    e.status = res.status;
    e.body = json;
    throw e;
  }
  return json;
}

async function uploadFile(buf, contentType, fileName) {
  const meta = await api('POST', '/s2s/v2.0/file', {
    files: [{ content_type: contentType, file_name: fileName, file_size: buf.length }]
  });
  const f = meta.data.files[0];
  const req = f.requests[0];
  const put = await fetch(req.url, { method: req.method || 'PUT', headers: req.headers, body: buf });
  if (!put.ok) throw new Error(`Upload to signed URL failed: ${put.status}`);
  return f.file_id;
}

async function poll(taskPath, taskId, { intervalMs = 2500, timeoutMs = 180000 } = {}) {
  const started = Date.now();
  let tick = 0;
  while (Date.now() - started < timeoutMs) {
    const r = await api('GET', `${taskPath}/${encodeURIComponent(taskId)}`);
    const st = r.data && r.data.task_status;
    tick += 1;
    log(`tick${tick}: ${taskPath.split('/').pop()} status=${st} (${Math.round((Date.now() - started) / 1000)}s)`);
    if (st === 'success') return r;
    if (st === 'error') {
      const e = new Error(`Task error: ${r.data.error || ''} ${r.data.error_message || ''}`.trim());
      e.engineError = r.data.error;
      e.body = r;
      throw e;
    }
    await new Promise((ok) => setTimeout(ok, intervalMs));
  }
  throw new Error('Task polling timed out');
}

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, b);
  return dest;
}

function cachePaths(key) {
  return { json: path.join(CACHE_DIR, `${key}.json`), dir: path.join(CACHE_DIR, key) };
}

function readCache(key) {
  const p = cachePaths(key);
  if (fs.existsSync(p.json)) return JSON.parse(fs.readFileSync(p.json, 'utf8'));
  return null;
}

function contentTypeOf(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  return 'image/jpeg';
}

async function skinAnalysis(buf, { concerns = SD_CONCERNS, cameraKit = false } = {}) {
  const key = sha(Buffer.concat([Buffer.from('skin-analysis:v1:' + concerns.join(',')), buf]));
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  const units = skinAnalysisUnits(concerns.length, concerns[0].startsWith('hd_'));
  const ct = contentTypeOf(buf);
  log(`skin-analysis: uploading ${buf.length} bytes (${concerns.length} concerns, ~${units} units)`);
  const fileId = await uploadFile(buf, ct, ct === 'image/png' ? 'selfie.png' : 'selfie.jpg');
  const taskPath = cameraKit ? '/s2s/v2.1/task/skin-analysis' : '/s2s/v2.0/task/skin-analysis';
  const body = {
    src_file_id: fileId,
    dst_actions: concerns,
    miniserver_args: { enable_mask_overlay: false },
    format: 'json'
  };
  if (cameraKit) body.pf_camera_kit = true;
  let raw;
  try {
    const run = await api('POST', taskPath, body);
    raw = await poll(taskPath, run.data.task_id);
  } catch (e) {
    appendLedger({ feature: 'skin-analysis', units: 0, status: 'error', error: e.message });
    throw e;
  }
  appendLedger({ feature: 'skin-analysis', units, status: 'success', key });

  const p = cachePaths(key);
  fs.mkdirSync(p.dir, { recursive: true });
  const masks = {};
  await Promise.all((raw.data.results.output || []).filter((o) => o.mask_urls && o.mask_urls.length).map(async (o) => {
    const name = `${o.type}${o.region && o.region !== 'whole' ? '_' + o.region : ''}.png`;
    try {
      await download(o.mask_urls[0], path.join(p.dir, name));
      masks[o.region && o.region !== 'whole' ? `${o.type}:${o.region}` : o.type] = `${key}/${name}`;
    } catch (e) {
      log(`mask download failed for ${o.type}: ${e.message}`);
    }
  }));
  log(`downloaded ${Object.keys(masks).length} detection masks`);
  const record = { key, feature: 'skin-analysis', endpoint: taskPath, concerns, units, raw, masks, createdAt: new Date().toISOString() };
  fs.writeFileSync(p.json, JSON.stringify(record, null, 2));
  return { ...record, cached: false };
}

async function skinSimulation(buf, params) {
  const clean = {};
  for (const [k, v] of Object.entries(params)) if (Number(v) > 0) clean[k] = Math.min(1, Number(v));
  const tag = Object.keys(clean).sort().map((k) => `${k}=${clean[k]}`).join('&');
  const key = sha(Buffer.concat([Buffer.from('skin-simulation:v1:' + tag), buf]));
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  const units = simulationUnits(Object.keys(clean).length);
  const ct = contentTypeOf(buf);
  log(`skin-simulation: ${tag} (~${units} units)`);
  const fileId = await uploadFile(buf, ct, ct === 'image/png' ? 'selfie.png' : 'selfie.jpg');
  const taskPath = '/s2s/v2.0/task/skin-simulation';
  let raw;
  try {
    const run = await api('POST', taskPath, { src_file_id: fileId, ...clean });
    raw = await poll(taskPath, run.data.task_id);
  } catch (e) {
    appendLedger({ feature: 'skin-simulation', units: 0, status: 'error', error: e.message });
    throw e;
  }
  appendLedger({ feature: 'skin-simulation', units, status: 'success', key });
  const p = cachePaths(key);
  fs.mkdirSync(p.dir, { recursive: true });
  const url = raw.data.results && (raw.data.results.url || (raw.data.results[0] && raw.data.results[0].url));
  const imgName = 'simulated.jpg';
  await download(url, path.join(p.dir, imgName));
  const record = { key, feature: 'skin-simulation', endpoint: taskPath, params: clean, units, raw, image: `${key}/${imgName}`, createdAt: new Date().toISOString() };
  fs.writeFileSync(p.json, JSON.stringify(record, null, 2));
  return { ...record, cached: false };
}

async function textToImage(prompt, { size = '1104*1472', negative } = {}) {
  const key = sha(Buffer.from('text-to-image:v1:' + size + ':' + prompt + ':' + (negative || '')));
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };
  const taskPath = '/s2s/v2.0/task/text-to-image/youcam';
  log('text-to-image: generating synthetic face (~1 unit)');
  let raw;
  try {
    const body = { model: 'youcam-image-v2', prompt, size, prompt_extend: false };
    if (negative) body.negative_prompt = negative;
    const run = await api('POST', taskPath, body);
    raw = await poll(taskPath, run.data.task_id, { intervalMs: 4000 });
  } catch (e) {
    appendLedger({ feature: 'text-to-image', units: 0, status: 'error', error: e.message });
    throw e;
  }
  appendLedger({ feature: 'text-to-image', units: 1, status: 'success', key });
  const p = cachePaths(key);
  fs.mkdirSync(p.dir, { recursive: true });
  const r = raw.data.results;
  const url = (r && (r.url || (Array.isArray(r) && r[0] && r[0].url))) || null;
  if (url) await download(url, path.join(p.dir, 'generated.jpg'));
  const record = { key, feature: 'text-to-image', endpoint: taskPath, prompt, units: 1, raw, image: url ? `${key}/generated.jpg` : null, createdAt: new Date().toISOString() };
  fs.writeFileSync(p.json, JSON.stringify(record, null, 2));
  return { ...record, cached: false };
}

module.exports = { SD_CONCERNS, skinAnalysis, skinSimulation, textToImage, unitsSpent, CACHE_DIR, sha };
