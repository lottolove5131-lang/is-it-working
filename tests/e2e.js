const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const IMAGES = path.join(ROOT, 'fixtures', 'demo_images');
const SHOTS = path.join(ROOT, 'screenshots');
const PORT = Number(process.env.E2E_PORT || 3124);
const DATA_DIR = path.join(ROOT, 'data', 'e2e');
const RECORD = process.env.RECORD_DIR || null;
const SEED_FROM = process.env.SEED_FROM ? path.resolve(ROOT, process.env.SEED_FROM) : null;
const events = [];
let t0 = Date.now();
const mark = (label) => events.push({ t: (Date.now() - t0) / 1000, label });

const log = (m) => process.stdout.write(`[e2e ${new Date().toISOString().slice(11, 19)}] ${m}\n`);

function startServer() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  if (SEED_FROM) fs.cpSync(SEED_FROM, DATA_DIR, { recursive: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR, NO_SAMPLES: '1' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (d) => process.stdout.write(`  [server] ${d}`));
  child.stderr.on('data', (d) => process.stdout.write(`  [server:err] ${d}`));
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('server did not start')), 15000);
    child.stdout.on('data', (d) => { if (String(d).includes('running on')) { clearTimeout(t); ok(child); } });
  });
}

async function pause(page, ms) { if (RECORD) await page.waitForTimeout(ms); }

async function slowScroll(page, to) {
  if (!RECORD) return;
  await page.evaluate(async (target) => {
    const end = target === 'bottom' ? document.body.scrollHeight : target;
    const start = window.scrollY; const steps = 40;
    for (let i = 1; i <= steps; i += 1) { window.scrollTo(0, start + ((end - start) * i) / steps); await new Promise((r) => setTimeout(r, 30)); }
  }, to);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 420, height: 860 }, deviceScaleFactor: 2,
    ...(RECORD ? { recordVideo: { dir: RECORD, size: { width: Number(process.env.REC_W||420), height: Number(process.env.REC_H||860) } } } : {})
  });
  const page = await context.newPage();
  t0 = Date.now();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (name, full = true) => { await page.screenshot({ path: path.join(SHOTS, name), fullPage: full }); log(`screenshot ${name}`); };

  try {
    log('step 1/5 home');
    mark('home');
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForSelector('text=Is that serum actually doing anything?');
    await page.waitForTimeout(800);
    if (!RECORD) await shot('01_home.png');
    await pause(page, 2500);
    await slowScroll(page, 'bottom');
    await pause(page, 2000);

    log('step 2/5 register product');
    mark('register');
    await page.click('a[href="#/new"]');
    await page.waitForSelector('input[name=name]');
    await pause(page, 800);
    await page.fill('input[name=name]', '');
    await page.type('input[name=name]', '10% Azelaic Booster', { delay: RECORD ? 60 : 0 });
    await page.selectOption('select[name=ingredient]', 'azelaic');
    await pause(page, 1500);
    if (!RECORD) await shot('02_new_product.png');
    await page.click('text=Continue to Day 0 photos');

    log('step 3/5 Day 0 — two shots');
    mark('day0');
    await page.waitForSelector('#file', { state: 'attached' });
    await pause(page, 1500);
    await page.setInputFiles('#file', [path.join(IMAGES, 'day0.jpg'), path.join(IMAGES, 'day0_retake.jpg')]);
    await page.waitForFunction(() => document.querySelectorAll('.frame-wrap canvas').length === 2);
    await page.waitForTimeout(400);
    if (!RECORD) await shot('03_day0_framing.png');
    await slowScroll(page, 'bottom');
    await pause(page, 2000);
    await page.click('#go');
    mark('analyze0');
    await page.waitForSelector('.progress');
    if (!RECORD) await shot('04_analyzing.png', false);
    await page.waitForSelector('h2:text-is("Your photo noise")', { timeout: 240000 });
    await page.waitForTimeout(1200);
    mark('noise');
    if (!RECORD) await shot('05_product_noise_goal.png');
    await pause(page, 2500);
    await slowScroll(page, 650);
    mark('goal');
    await pause(page, 3000);
    if (RECORD) {
      const r = page.locator('[data-compare-range]');
      if (await r.count()) {
        await r.first().scrollIntoViewIfNeeded();
        for (const v of [50, 20, 85, 50]) { await r.first().fill(String(v)); await page.waitForTimeout(700); }
      }
    }
    await slowScroll(page, 'bottom');
    await pause(page, 3000);

    log('step 4/5 Day 14 check-in');
    mark('day14');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('a.btn.small:has-text("Check in")');
    await page.waitForSelector('#day');
    await page.fill('#day', '14');
    await page.setInputFiles('#file', [path.join(IMAGES, 'day14.jpg')]);
    await page.waitForFunction(() => document.querySelectorAll('.frame-wrap canvas').length === 1);
    await page.waitForTimeout(400);
    if (!RECORD) await shot('06_day14_checkin.png');
    await pause(page, 2000);
    await slowScroll(page, 'bottom');
    await pause(page, 1500);
    await page.click('#go');

    log('step 5/5 verdict');
    mark('analyze14');
    await page.waitForSelector('.verdict', { timeout: 240000 });
    await page.waitForTimeout(1000);
    const verdict = (await page.textContent('.verdict h2')).trim();
    log(`verdict: ${verdict}`);
    mark('verdict');
    if (!RECORD) await shot('07_verdict.png');
    await pause(page, 3500);
    await slowScroll(page, 700);
    await pause(page, 3000);
    await slowScroll(page, 'bottom');
    await pause(page, 2500);
    if (RECORD) {
      mark('masks');
      const chip = page.locator('[data-mask="redness"]');
      if (await chip.count()) { await chip.scrollIntoViewIfNeeded(); await page.waitForTimeout(800); await chip.click(); await page.waitForTimeout(2500); }
    }

    if (SEED_FROM) {
      log('extra: other experiments');
      await page.goto(`http://localhost:${PORT}/#/`);
      await page.waitForSelector('.product');
      await page.evaluate(() => window.scrollTo(0, 0));
      await slowScroll(page, 560);
      mark('list');
      await page.waitForTimeout(400);
      if (!RECORD) await shot('08_experiments.png', false);
      await pause(page, 3500);
      await page.click('a.product:has-text("Niacinamide")');
      await page.waitForSelector('.tl[data-day="7"]');
      await page.click('.tl[data-day="7"]');
      await page.waitForSelector('.verdict');
      mark('early');
      await page.waitForTimeout(400);
      if (!RECORD) await shot('09_too_early.png');
      await pause(page, 3500);
      await slowScroll(page, 600);
      await pause(page, 2500);
      await page.goto(`http://localhost:${PORT}/#/`);
      await page.waitForSelector('.product');
      await page.click('a.product:has-text("Retinol")');
      await page.waitForSelector('.tl[data-day="14"]');
      await page.click('.tl[data-day="14"]');
      await page.waitForSelector('.verdict.stop');
      mark('stop');
      await page.waitForTimeout(400);
      if (!RECORD) await shot('10_stop_patch_test.png');
      await pause(page, 4000);
      await slowScroll(page, 900);
      await pause(page, 3000);
    }
    mark('end');

    const ok = ['Keep going', 'Too early', 'Not yet', 'Stop', 'Probably not'].some((k) => verdict.includes(k));
    if (!ok) throw new Error(`Unexpected verdict text: ${verdict}`);
    if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
    log('E2E PASSED');
  } catch (e) {
    log(`E2E FAILED: ${e.message}`);
    await page.screenshot({ path: path.join(SHOTS, '_failure.png'), fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await context.close();
    if (RECORD) fs.writeFileSync(path.join(RECORD, 'events.json'), JSON.stringify(events, null, 2));
    await browser.close();
    server.kill();
  }
})();
