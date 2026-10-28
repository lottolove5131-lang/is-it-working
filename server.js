require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const yc = require('./lib/youcam');
const { evaluate } = require('./lib/verdict');
const { CONCERNS, INGREDIENTS, SIMULATION_PARAM } = require('./lib/ingredients');

const ROOT = __dirname;
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PHOTOS = path.join(DATA, 'photos');
const DB = path.join(DATA, 'db.json');
const SAMPLES = path.join(ROOT, 'fixtures', 'sample_data');
if (!fs.existsSync(DB) && fs.existsSync(path.join(SAMPLES, 'db.json')) && process.env.NO_SAMPLES !== '1') {
  fs.mkdirSync(DATA, { recursive: true });
  fs.cpSync(SAMPLES, DATA, { recursive: true });
}
fs.mkdirSync(PHOTOS, { recursive: true });

const OFFLINE = !process.env.YOUCAM_API_KEY || process.env.YOUCAM_OFFLINE === '1';

function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (_) { return { products: [] }; }
}
function saveDb(db) { fs.writeFileSync(DB, JSON.stringify(db, null, 2)); }
function id() { return crypto.randomBytes(6).toString('hex'); }

async function normalizeImage(buf) {
  const meta = await sharp(buf).metadata();
  const short = Math.min(meta.width, meta.height);
  const long = Math.max(meta.width, meta.height);
  if (short >= 480 && long <= 2560 && meta.format === 'jpeg') return buf;
  let img = sharp(buf).rotate();
  if (short < 480) img = img.resize(meta.width < meta.height ? { width: 480 } : { height: 480 });
  else if (long > 2560) img = img.resize(meta.width > meta.height ? { width: 2560 } : { height: 2560 });
  return img.jpeg({ quality: 92 }).toBuffer();
}

function summarize(analysis) {
  const scores = {};
  const ui = {};
  let skinAge = null; let overall = null; const skinType = {};
  for (const o of analysis.raw.data.results.output || []) {
    if (typeof o.raw_score === 'number' && !o.region) { scores[o.type] = o.raw_score; ui[o.type] = o.ui_score; }
    else if (typeof o.raw_score === 'number' && o.region === 'whole') { scores[o.type] = o.raw_score; ui[o.type] = o.ui_score; }
    if (o.type === 'skin_age') skinAge = o.score;
    if (o.type === 'all') overall = o.score;
    if (o.type === 'skin_type') skinType[o.region || 'whole'] = o.skin_type;
  }
  return { scores, ui, skinAge, overall, skinType, masks: analysis.masks, analysisKey: analysis.key, cached: analysis.cached, endpoint: analysis.endpoint };
}

async function runAnalysis(buf, cameraKit) {
  return yc.skinAnalysis(buf, { cameraKit });
}

function view(product) {
  return { ...product, evaluation: evaluate(product) };
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/media/cache', express.static(yc.CACHE_DIR));
app.use('/media/photos', express.static(PHOTOS));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 2 } });

app.get('/api/config', (req, res) => {
  res.json({
    mode: OFFLINE ? 'offline-demo' : 'live',
    unitsSpent: yc.unitsSpent(),
    concerns: CONCERNS,
    ingredients: INGREDIENTS,
    simulationParams: SIMULATION_PARAM
  });
});

app.get('/api/products', (req, res) => {
  res.json(loadDb().products.map(view));
});

app.get('/api/products/:id', (req, res) => {
  const p = loadDb().products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(view(p));
});

app.post('/api/products', (req, res) => {
  const { name, ingredient, targets, brand } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Product name is required' });
  const ing = INGREDIENTS.find((i) => i.id === ingredient) || INGREDIENTS[INGREDIENTS.length - 1];
  const t = (Array.isArray(targets) ? targets : ing.targets).filter((c) => CONCERNS[c]);
  if (!t.length) return res.status(400).json({ error: 'Pick at least one concern this product should improve' });
  const db = loadDb();
  const product = {
    id: id(), name: String(name).trim().slice(0, 80), brand: brand ? String(brand).slice(0, 60) : '',
    ingredient: ing.id, targets: t, createdAt: new Date().toISOString(), checkins: [], goal: null
  };
  db.products.unshift(product);
  saveDb(db);
  res.json(view(product));
});

app.delete('/api/products/:id', (req, res) => {
  const db = loadDb();
  db.products = db.products.filter((p) => p.id !== req.params.id);
  saveDb(db);
  res.json({ ok: true });
});

app.post('/api/products/:id/checkins', upload.array('photos', 2), async (req, res) => {
  const db = loadDb();
  const product = db.products.find((x) => x.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  const day = Number(req.body.day);
  if (!Number.isInteger(day) || day < 0 || day > 365) return res.status(400).json({ error: 'Day must be 0–365' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Add at least one photo' });
  if (day === 0 && req.files.length < 2) return res.status(400).json({ error: 'Day 0 needs two shots so we can measure your photo noise' });
  let conditions = [];
  try { conditions = JSON.parse(req.body.conditions || '[]'); } catch (_) {}
  const cameraKit = req.body.cameraKit === '1';
  try {
    const shots = [];
    for (let i = 0; i < req.files.length; i += 1) {
      const buf = await normalizeImage(req.files[i].buffer);
      const fname = `${product.id}_d${day}_${i}_${yc.sha(buf).slice(0, 10)}.jpg`;
      fs.writeFileSync(path.join(PHOTOS, fname), buf);
      const analysis = await runAnalysis(buf, cameraKit);
      shots.push({ id: id(), photo: `/media/photos/${fname}`, conditions: conditions[i] || null, ...summarize(analysis) });
    }
    product.checkins = product.checkins.filter((c) => c.day !== day);
    product.checkins.push({ id: id(), day, at: new Date().toISOString(), shots });
    product.checkins.sort((a, b) => a.day - b.day);
    saveDb(db);
    res.json(view(product));
  } catch (e) {
    console.error('[checkin]', e.message);
    res.status(e.status && e.status < 500 ? e.status : 502).json({ error: friendlyError(e) });
  }
});

app.post('/api/products/:id/goal', async (req, res) => {
  const db = loadDb();
  const product = db.products.find((x) => x.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  const base = product.checkins.find((c) => c.day === 0);
  if (!base) return res.status(400).json({ error: 'Take your Day 0 photos first' });
  const params = {};
  for (const c of product.targets) if (SIMULATION_PARAM[c]) params[SIMULATION_PARAM[c]] = 0.5;
  if (!Object.keys(params).length) return res.status(400).json({ error: 'None of the target concerns can be simulated' });
  try {
    const buf = fs.readFileSync(path.join(PHOTOS, path.basename(base.shots[0].photo)));
    const sim = await yc.skinSimulation(buf, params);
    const simBuf = fs.readFileSync(path.join(yc.CACHE_DIR, sim.image));
    const analysis = await runAnalysis(simBuf, false);
    product.goal = { params, image: `/media/cache/${sim.image}`, simulationKey: sim.key, ...summarize(analysis) };
    saveDb(db);
    res.json(view(product));
  } catch (e) {
    console.error('[goal]', e.message);
    res.status(e.status && e.status < 500 ? e.status : 502).json({ error: friendlyError(e) });
  }
});

function friendlyError(e) {
  const map = {
    error_src_face_too_small: 'Your face is too small in the frame — zoom in so it fills the oval.',
    error_src_face_out_of_bound: 'Part of your face is outside the frame — center it in the oval.',
    error_lighting_dark: 'Too dark for a fair reading — face a window or a lamp and retake.',
    error_no_face: 'No face found — face the camera straight on.',
    error_large_face_angle: 'Your head is turned too far — look straight into the lens.'
  };
  if (e.engineError && map[e.engineError]) return map[e.engineError];
  if (e.body && e.body.error_code === 'CreditInsufficiency') return 'The YouCam API account is out of units.';
  return e.message;
}

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(PORT, () => console.log(`Is It Working? running on http://localhost:${PORT} (${OFFLINE ? 'offline demo' : 'live YouCam API'})`));
}
module.exports = app;
