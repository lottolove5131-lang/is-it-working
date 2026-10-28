(() => {
  const $view = document.getElementById('view');
  const state = { config: null, products: [], framers: [], cameraKit: false };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const label = (c) => (state.config.concerns[c] ? state.config.concerns[c].label : c);
  const fmt = (n, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(d);
  const ingredientOf = (p) => state.config.ingredients.find((i) => i.id === p.ingredient) || {};

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  function render(html) {
    $view.innerHTML = html;
    $view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function gauge(row, opts = {}) {
    const R = Math.max(6, Math.abs(row.delta) * 1.35, row.band * 1.35);
    const pos = (v) => ((v + R) / (2 * R)) * 100;
    const cls = row.status || '';
    return `
      <div class="gauge ${cls}" role="img" aria-label="${esc(opts.aria || '')}">
        <div class="track"></div>
        <div class="band" style="left:${pos(-row.band)}%;right:${100 - pos(row.band)}%"></div>
        <div class="zero" style="left:${pos(0)}%"></div>
        <div class="needle" style="left:${pos(row.delta)}%"></div>
      </div>
      <div class="gauge-scale"><span>worse</span><span>no change</span><span>better</span></div>`;
  }

  function verdictPill(v) {
    if (!v) return '<span class="pill">Baseline</span>';
    const text = { keep: 'Working', stop: 'Irritation', early: 'Too early', switch: 'Not working' }[v.code];
    return `<span class="pill ${v.code}">${text}</span>`;
  }

  async function loadAll() {
    state.products = await api('/api/products');
  }

  async function home() {
    await loadAll();
    const list = state.products.map((p) => {
      const ev = p.evaluation;
      const last = ev.history && ev.history[ev.history.length - 1];
      const d0 = p.checkins.find((c) => c.day === 0);
      const img = d0 ? `<img class="thumb" src="${d0.shots[0].photo}" alt="">` : '<div class="thumb empty">no photo</div>';
      const sub = !d0 ? 'Needs Day 0 photos' : last ? `Day ${last.day} · ${esc(last.verdict.title)}` : 'Baseline set · next check-in Day 7';
      return `<a class="card product" href="#/p/${p.id}">${img}
        <div><h3>${esc(p.name)}</h3><p class="small muted">${esc(ingredientOf(p).name || '')} · ${p.targets.map(label).join(', ')}</p><p class="small" style="margin-top:6px">${sub}</p></div>
        <div>${d0 ? verdictPill(last && last.verdict) : ''}</div></a>`;
    }).join('');

    render(`
      <section class="hero">
        <p class="eyebrow">Skincare efficacy tracker</p>
        <h1 style="margin-top:10px">Is that serum actually doing anything?</h1>
        <p class="lede">Photos lie a little every day — light, angle, distance. We measure how much <em>your</em> photos wobble, and only call a change real when it's bigger than that.</p>
        <div class="hero-gauge" aria-hidden="true">${gauge({ delta: 4.6, band: 2.6, status: '' })}</div>
        <div class="legend"><span><i class="sw band"></i> your photo noise</span><span><i class="sw needle"></i> real change</span></div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Your experiments</h2>${state.products.length ? '<a class="btn small" href="#/new">New</a>' : ''}</div>
        ${list || `<div class="card stack"><p><b>Start with the product you opened most recently.</b> You'll need two quick selfies today and one in a week or two.</p><a class="btn block" href="#/new">Track a product</a></div>`}
      </section>
      <section class="section">
        <h2>How it decides</h2>
        <ol class="how" style="margin-top:12px">
          <li><div><b>Two selfies on Day 0.</b> YouCam Skin Analysis scores 15 skin concerns on each. The gap between them is your personal noise.</div></li>
          <li><div><b>A goal preview.</b> YouCam Skin Simulation shows a realistic 50% improvement, then we score it to check the change would even be detectable.</div></li>
          <li><div><b>Check in on Day 7, 14, 28.</b> A change only counts if it clears the noise band. Otherwise we say “too early” — no false hope.</div></li>
          <li><div><b>Side-effect watch.</b> If breakouts or redness get measurably worse, we tell you to stop and patch-test.</div></li>
        </ol>
      </section>`);
  }

  function newProduct() {
    const ings = state.config.ingredients;
    const selected = new Set(ings[0].targets);
    const concernKeys = Object.keys(state.config.concerns).filter((c) => !['droopy_upper_eyelid', 'droopy_lower_eyelid', 'tear_trough'].includes(c));
    render(`
      <p class="eyebrow">New experiment</p>
      <h1 style="margin-top:8px;font-size:34px">What did you just start using?</h1>
      <form id="np" class="stack section" autocomplete="off">
        <label class="field"><span>Product name</span><input class="input" name="name" required maxlength="80" placeholder="e.g. 10% Azelaic Booster"></label>
        <label class="field"><span>Key active ingredient</span>
          <select class="input" name="ingredient">${ings.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select>
          <p class="hint" id="window"></p>
        </label>
        <div class="field"><span style="font-weight:700;display:block;margin-bottom:6px">What should it improve?</span>
          <div class="chips" id="chips">${concernKeys.map((c) => `<button type="button" class="chip" data-c="${c}" aria-pressed="${selected.has(c)}">${esc(label(c))}</button>`).join('')}</div>
          <p class="hint">We'll still watch breakouts, redness and texture for side effects.</p>
        </div>
        <div id="np-err"></div>
        <button class="btn block" type="submit">Continue to Day 0 photos</button>
      </form>`);
    const form = document.getElementById('np');
    const chips = document.getElementById('chips');
    const setWindow = () => {
      const ing = ings.find((i) => i.id === form.ingredient.value);
      document.getElementById('window').textContent = ing.id === 'other'
        ? 'We\'ll assume a 4–8 week window.'
        : `Typical time to visible results: ${Math.round(ing.window[0] / 7)}–${Math.round(ing.window[1] / 7)} weeks.`;
    };
    form.ingredient.addEventListener('change', () => {
      const ing = ings.find((i) => i.id === form.ingredient.value);
      selected.clear(); ing.targets.forEach((t) => selected.add(t));
      chips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', selected.has(b.dataset.c)));
      setWindow();
    });
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      const c = b.dataset.c;
      if (selected.has(c)) selected.delete(c); else selected.add(c);
      b.setAttribute('aria-pressed', selected.has(c));
    });
    setWindow();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const p = await api('/api/products', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name.value, ingredient: form.ingredient.value, targets: [...selected] })
        });
        location.hash = `#/p/${p.id}/checkin/0`;
      } catch (err) {
        document.getElementById('np-err').innerHTML = `<p class="error">${esc(err.message)}</p>`;
      }
    });
  }

  class Framer {
    constructor(img, canvas, ghost) {
      this.img = img; this.canvas = canvas; this.ghost = ghost;
      this.zoom = 1.3; this.ox = 0; this.oy = 0.07;
      this.ctx = canvas.getContext('2d');
      this.draw();
      let drag = null;
      canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy }; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const r = canvas.getBoundingClientRect();
        this.ox = drag.ox + (e.clientX - drag.x) / r.width;
        this.oy = drag.oy + (e.clientY - drag.y) / r.height;
        this.draw(); this.onchange && this.onchange();
      });
      canvas.addEventListener('pointerup', () => { drag = null; });
    }
    paint(ctx, W, H) {
      const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
      const s = Math.max(W / iw, H / ih) * this.zoom;
      const dw = iw * s, dh = ih * s;
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(this.img, (W - dw) / 2 + this.ox * W, (H - dh) / 2 + this.oy * H, dw, dh);
    }
    draw() { this.paint(this.ctx, this.canvas.width, this.canvas.height); }
    exportCanvas() {
      const c = document.createElement('canvas'); c.width = 900; c.height = 1200;
      this.paint(c.getContext('2d'), 900, 1200);
      return c;
    }
    blob() { return new Promise((ok) => this.exportCanvas().toBlob(ok, 'image/jpeg', 0.92)); }
  }

  function photoStats(canvas) {
    const w = 120, h = 160;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let n = 0, L = 0, R = 0, B = 0;
    const gray = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      gray[y * w + x] = g;
      const nx = (x / w - 0.5) / 0.36, ny = (y / h - 0.48) / 0.39;
      if (nx * nx + ny * ny <= 1) { n += 1; L += g; R += d[i]; B += d[i + 2]; }
    }
    let lv = 0, lm = 0, cnt = 0; const lap = [];
    for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
      const k = y * w + x;
      const v = 4 * gray[k] - gray[k - 1] - gray[k + 1] - gray[k - w] - gray[k + w];
      lap.push(v); lm += v; cnt += 1;
    }
    lm /= cnt; for (const v of lap) lv += (v - lm) ** 2; lv /= cnt;
    return { luma: L / n, warmth: R / Math.max(1, B), sharp: lv };
  }

  function judgeConditions(stats, ref, isBaselineRetake) {
    const out = [];
    if (stats.luma < 85) out.push({ level: 'bad', text: 'Too dark — face a window or lamp. YouCam rejects underexposed faces.' });
    else if (stats.luma > 215) out.push({ level: 'bad', text: 'Overexposed — highlights wash out redness and spots.' });
    else out.push({ level: 'ok', text: `Exposure OK (face brightness ${Math.round(stats.luma)}/255).` });
    if (ref) {
      const dl = (stats.luma - ref.luma) / ref.luma;
      const dw = (stats.warmth - ref.warmth) / ref.warmth;
      const ds = stats.sharp / Math.max(1, ref.sharp);
      if (isBaselineRetake) {
        out.push({ level: 'ok', text: `Differs from shot 1 by ${Math.round(Math.abs(dl) * 100)}% brightness and ${Math.round(Math.abs(dw) * 100)}% warmth. That's fine — this gap is exactly what we measure as your noise.` });
      } else {
        out.push(Math.abs(dl) > 0.12
          ? { level: 'warn', text: `${dl > 0 ? 'Brighter' : 'Darker'} than Day 0 by ${Math.round(Math.abs(dl) * 100)}%. Move to the same spot you used on Day 0 for a fair comparison.` }
          : { level: 'ok', text: `Brightness matches Day 0 (within ${Math.max(1, Math.round(Math.abs(dl) * 100))}%).` });
        out.push(Math.abs(dw) > 0.07
          ? { level: 'warn', text: `Light is ${dw > 0 ? 'warmer' : 'cooler'} than Day 0. Warm light can fake redness; daylight is best.` }
          : { level: 'ok', text: 'Light colour matches Day 0.' });
        out.push(ds < 0.5
          ? { level: 'warn', text: 'Blurrier than Day 0 — hold still or tap to focus.' }
          : { level: 'ok', text: 'Sharpness matches Day 0.' });
      }
    }
    return out;
  }

  function checkList(items) {
    return items.map((c) => `<div class="check ${c.level}"><span class="dot">${c.level === 'ok' ? '✓' : '!'}</span><span>${esc(c.text)}</span></div>`).join('');
  }

  async function checkin(pid, day) {
    const p = await api(`/api/products/${pid}`);
    const d0 = p.checkins.find((c) => c.day === 0);
    const isBaseline = day === 0;
    const need = isBaseline ? 2 : 1;
    state.framers = []; state.cameraKit = false;
    const refPhoto = d0 ? d0.shots[0].photo : null;
    const refStats = d0 && d0.shots[0].conditions ? d0.shots[0].conditions : null;
    const ing = ingredientOf(p);

    render(`
      <a href="#/p/${p.id}" class="small muted">← ${esc(p.name)}</a>
      <p class="eyebrow" style="margin-top:14px">${isBaseline ? 'Day 0 · baseline' : 'Check-in'}</p>
      <h1 style="margin-top:8px;font-size:32px">${isBaseline ? 'Two selfies, a minute apart' : 'Same spot, same light'}</h1>
      <p class="lede">${isBaseline
        ? 'Take one, step away, take another. Bare face, hair back, facing a window. The difference between them tells us how noisy your photos are.'
        : `Stand where you stood on Day 0. The faint overlay shows your Day 0 framing — line your face up with it.`}</p>
      ${isBaseline ? '' : `<label class="field section"><span>Days since you started</span><input class="input" id="day" type="number" min="1" max="365" value="${day}"><p class="hint">${esc(ing.name || '')} usually shows results in ${Math.round((ing.window || [28])[0] / 7)}–${Math.round((ing.window || [28, 56])[1] / 7)} weeks.</p></label>`}
      <div class="row section">
        <label class="btn ghost" style="flex:1">Upload photo${need > 1 ? 's' : ''}<input id="file" type="file" accept="image/jpeg,image/png" ${need > 1 ? 'multiple' : ''} class="sr"></label>
        <button class="btn ghost" id="cam" type="button" style="flex:1">Guided camera</button>
      </div>
      <p class="hint">Guided camera uses YouCam Camera Kit to check face size, angle and lighting before it shoots.</p>
      <div class="shots section" id="shots"></div>
      <div id="ck-err"></div>
      <div class="section" id="go-wrap" hidden>
        <button class="btn block" id="go">Analyze with YouCam Skin AI</button>
        <p class="hint" style="text-align:center">${isBaseline ? '2 photos × 16 units' : '1 photo × 16 units'} · SD Skin Analysis, 15 concerns + skin type</p>
      </div>
      <div class="card section" id="prog" hidden></div>`);

    const shotsEl = document.getElementById('shots');
    const goWrap = document.getElementById('go-wrap');

    async function addShot(src) {
      if (state.framers.length >= need) { shotsEl.innerHTML = ''; state.framers = []; }
      const img = new Image();
      img.src = src;
      await img.decode();
      {
        const idx = state.framers.length;
        const wrap = document.createElement('div');
        wrap.className = 'card';
        wrap.innerHTML = `
          <div class="shot-label"><h3>${isBaseline ? `Shot ${idx + 1} of 2` : 'Today\'s photo'}</h3><span class="small muted">drag to reposition</span></div>
          <div class="frame-wrap ${refPhoto ? 'show-ghost' : ''}"><canvas width="600" height="800" aria-label="Framing preview"></canvas>${refPhoto ? `<img class="ghost" src="${refPhoto}" alt="">` : ''}<div class="oval"></div></div>
          <div class="sliders"><label>Zoom <input type="range" min="1" max="2.4" step="0.01" value="1.3"></label>
          ${refPhoto ? '<label>Overlay <input type="checkbox" checked aria-label="Show Day 0 overlay" style="justify-self:start;width:20px;height:20px"></label>' : ''}</div>
          <p class="hint">Fill the oval: YouCam needs your face to cover at least 60% of the frame width.</p>
          <div class="checks"></div>`;
        shotsEl.appendChild(wrap);
        const f = new Framer(img, wrap.querySelector('canvas'));
        const update = () => {
          f.stats = photoStats(f.canvas);
          const ref = isBaseline ? (idx === 1 && state.framers[0] ? state.framers[0].stats : null) : refStats;
          f.checks = judgeConditions(f.stats, ref, isBaseline && idx === 1);
          wrap.querySelector('.checks').innerHTML = checkList(f.checks);
        };
        f.onchange = () => { clearTimeout(f._t); f._t = setTimeout(update, 120); };
        wrap.querySelector('input[type=range]').addEventListener('input', (e) => { f.zoom = Number(e.target.value); f.draw(); f.onchange(); });
        const cb = wrap.querySelector('input[type=checkbox]');
        if (cb) cb.addEventListener('change', () => wrap.querySelector('.frame-wrap').classList.toggle('show-ghost', cb.checked));
        state.framers.push(f);
        update();
        goWrap.hidden = state.framers.length < need;
      }
    }

    document.getElementById('file').addEventListener('change', (e) => {
      const files = [...e.target.files].slice(0, need);
      shotsEl.innerHTML = ''; state.framers = []; state.cameraKit = false;
      (async () => { for (const file of files) await addShot(URL.createObjectURL(file)); })();
    });

    document.getElementById('cam').addEventListener('click', () => openCameraKit((src) => { state.cameraKit = true; addShot(src); }));

    document.getElementById('go').addEventListener('click', async () => {
      const dayVal = isBaseline ? 0 : Number(document.getElementById('day').value);
      const bad = state.framers.some((f) => f.checks.some((c) => c.level === 'bad'));
      if (bad && !confirm('One photo failed the lighting check and will likely be rejected. Analyze anyway?')) return;
      const fd = new FormData();
      fd.append('day', String(dayVal));
      fd.append('cameraKit', state.cameraKit ? '1' : '0');
      fd.append('conditions', JSON.stringify(state.framers.map((f) => f.stats)));
      for (let i = 0; i < state.framers.length; i += 1) fd.append('photos', await state.framers[i].blob(), `shot${i}.jpg`);
      const steps = [];
      state.framers.forEach((_, i) => {
        steps.push(`Uploading photo ${i + 1} via File API`);
        steps.push(`Skin Analysis on photo ${i + 1} — 16 concerns`);
      });
      if (isBaseline) { steps.push('Skin Simulation — your goal skin'); steps.push('Scoring the goal to test detectability'); }
      steps.push(isBaseline ? 'Measuring your photo noise' : 'Comparing against your noise band');
      const prog = document.getElementById('prog');
      prog.hidden = false;
      document.getElementById('go').disabled = true;
      let cur = 0;
      const paint = () => { prog.innerHTML = `<h3>Working…</h3><div class="progress">${steps.map((s, i) => `<div class="step ${i < cur ? 'done' : i === cur ? 'active' : ''}"><i></i><span>${esc(s)}</span></div>`).join('')}</div>`; };
      paint();
      const timer = setInterval(() => { if (cur < steps.length - 2) { cur += 1; paint(); } }, 2600);
      try {
        await api(`/api/products/${p.id}/checkins`, { method: 'POST', body: fd });
        if (isBaseline) {
          cur = Math.max(cur, steps.length - 3); paint();
          try { await api(`/api/products/${p.id}/goal`, { method: 'POST' }); } catch (err) { toast(`Goal preview skipped: ${err.message}`); }
        }
        cur = steps.length; paint();
        clearInterval(timer);
        location.hash = isBaseline ? `#/p/${p.id}` : `#/p/${p.id}/day/${dayVal}`;
      } catch (err) {
        clearInterval(timer);
        prog.hidden = true;
        document.getElementById('go').disabled = false;
        document.getElementById('ck-err').innerHTML = `<p class="error">${esc(err.message)}</p>`;
      }
    });
  }

  function openCameraKit(onImage) {
    const start = () => {
      try {
        window.YMK.init({ faceDetectionMode: 'skincare', imageFormat: 'base64', language: 'enu', qualityLevel: 'moderate' });
        window.YMK.openCameraKit();
      } catch (e) { toast('Camera Kit could not start — upload a photo instead.'); }
    };
    if (window.YMK) return start();
    window.YMKAsyncInit = () => {
      window.YMK.addEventListener('faceDetectionCaptured', (r) => {
        const item = r.images && r.images[0];
        if (item) onImage(typeof item.image === 'string' ? item.image : URL.createObjectURL(item.image));
        window.YMK.close();
      });
      window.YMK.addEventListener('cameraFailed', () => { toast('No camera available — upload a photo instead.'); window.YMK.close(); });
      start();
    };
    const s = document.createElement('script');
    s.src = 'https://plugins-media.makeupar.com/v2.5-camera-kit/sdk.js';
    s.onerror = () => toast('Camera Kit could not load — upload a photo instead.');
    document.body.appendChild(s);
  }

  function orderConcerns(p, rows) {
    const keys = Object.keys(rows);
    const watch = ['acne', 'redness', 'texture'];
    const targets = p.targets.filter((c) => rows[c]);
    const w = watch.filter((c) => rows[c] && !targets.includes(c));
    const rest = keys.filter((c) => !targets.includes(c) && !w.includes(c));
    return { targets, watch: w, rest };
  }

  function concernRow(p, c, r) {
    const statusText = { improved: 'Real improvement', worse: 'Real decline', noise: 'Within noise' }[r.status];
    const tag = p.targets.includes(c) ? '<span class="tag">target</span>' : '';
    return `<div class="concern">
      <div class="concern-head"><span class="concern-name">${esc(label(c))}${tag}</span><span class="pill ${r.status}">${statusText}</span></div>
      ${gauge(r, { aria: `${label(c)} changed ${fmt(r.delta)} points; noise band ±${r.band.toFixed(1)}` })}
      <p class="concern-nums">${r.before.toFixed(1)} → ${r.after.toFixed(1)} · change ${fmt(r.delta)} · noise ±${r.band.toFixed(1)}</p>
    </div>`;
  }

  function compareSlider(a, b, la, lb) {
    return `<div class="compare" data-compare>
      <img src="${a}" alt="${esc(la)}"><img class="after" src="${b}" alt="${esc(lb)}">
      <div class="divider"></div><span class="lbl l">${esc(la)}</span><span class="lbl r">${esc(lb)}</span>
    </div><input type="range" min="0" max="100" value="50" aria-label="Compare before and after" data-compare-range style="margin-top:8px">`;
  }

  function wireCompare() {
    document.querySelectorAll('[data-compare-range]').forEach((r) => {
      const box = r.previousElementSibling;
      const set = () => {
        box.querySelector('.after').style.clipPath = `inset(0 0 0 ${r.value}%)`;
        box.querySelector('.divider').style.left = `${r.value}%`;
      };
      r.addEventListener('input', set); set();
    });
  }

  async function productPage(pid) {
    const p = await api(`/api/products/${pid}`);
    const ev = p.evaluation;
    const ing = ingredientOf(p);
    const d0 = p.checkins.find((c) => c.day === 0);
    if (!d0) { location.hash = `#/p/${pid}/checkin/0`; return; }
    const noiseRows = p.targets.concat(['acne', 'redness', 'texture'].filter((c) => !p.targets.includes(c)))
      .filter((c) => ev.noise[c])
      .map((c) => {
        const n = ev.noise[c];
        return `<tr><td>${esc(label(c))}${p.targets.includes(c) ? ' <span class="pill" style="margin-left:4px">target</span>' : ''}</td><td>${n.baseline.toFixed(1)} · ±${(2 * n.sigma * Math.sqrt(1 / n.n + 1)).toFixed(1)}</td></tr>`;
      }).join('');
    const wobbly = Object.keys(ev.noise).filter((c) => (ev.noise[c].observedSpread || 0) > 10 && (p.targets.includes(c) || ['acne', 'redness', 'texture'].includes(c)));
    const nextDay = ev.history.length ? Math.max(...ev.history.map((h) => h.day)) : 0;
    const suggest = [7, 14, 28, 42, 56, 84].find((d) => d > nextDay) || nextDay + 28;
    const goal = p.goal;
    const detect = ev.detect || {};
    const detectRows = Object.entries(detect).map(([c, d]) => {
      const verdict = d.shotsNeeded === 1 ? 'detectable with 1 photo' : d.shotsNeeded === 2 ? 'take 2 photos per check-in to see it' : 'too subtle for photos — judge by feel';
      return `<div class="check ${d.shotsNeeded ? 'ok' : 'warn'}"><span class="dot">${d.shotsNeeded ? '✓' : '!'}</span><span><b>${esc(label(c))}:</b> a visible improvement moves the score ${fmt(d.expectedDelta)} — ${verdict}.</span></div>`;
    }).join('');

    render(`
      <a href="#/" class="small muted">← All experiments</a>
      <p class="eyebrow" style="margin-top:14px">${esc(ing.name || '')}</p>
      <h1 style="margin-top:8px;font-size:34px">${esc(p.name)}</h1>
      <div class="chips" style="margin-top:12px">${p.targets.map((c) => `<span class="pill">${esc(label(c))}</span>`).join('')}</div>

      <section class="section">
        <div class="section-head"><h2>Check-ins</h2><a class="btn small" href="#/p/${p.id}/checkin/${suggest}">Check in</a></div>
        <div class="timeline">
          <button class="tl" data-day="0"><b>Day 0</b><small class="muted">baseline</small></button>
          ${ev.history.map((h) => `<button class="tl" data-day="${h.day}"><b>Day ${h.day}</b><small>${verdictPill(h.verdict)}</small></button>`).join('')}
        </div>
      </section>

      <section class="section card">
        <h2>Your photo noise</h2>
        <p class="small muted" style="margin-top:6px">Your two Day 0 photos scored differently even though your skin didn't change. A future change must clear this band to count.</p>
        <table class="noise-table" style="margin-top:12px"><tbody>${noiseRows}</tbody></table>
        ${wobbly.length ? `<p class="small" style="margin-top:12px"><b>${esc(wobbly.map(label).join(', '))}</b> jumped a lot between your two shots — usually a head turn or a light change. Use the guided camera next time for tighter readings.</p>` : ''}
        <p class="api-note">YouCam Skin Analysis raw scores (1–100, higher = healthier). Band = 2 × standard error of a 1-photo check-in vs. your 2-photo baseline. Your pair is pooled with a per-concern prior measured on our own retake pairs (pores and texture are the jumpiest).</p>
      </section>

      ${goal ? `<section class="section card">
        <h2>Your goal skin</h2>
        <p class="small muted" style="margin-top:6px">What a realistic 50% improvement in ${p.targets.filter((c) => state.config.simulationParams[c]).map(label).join(' and ').toLowerCase()} looks like on you. Drag to compare.</p>
        <div style="margin-top:12px">${compareSlider(d0.shots[0].photo, goal.image, 'Day 0', 'Goal')}</div>
        <h3 style="margin-top:16px">Can photos even see it?</h3>
        <div class="checks">${detectRows}</div>
        <p class="api-note">YouCam Skin Simulation (${Object.entries(goal.params).map(([k, v]) => `${k} ${v}`).join(', ')}), then re-scored with Skin Analysis.</p>
      </section>` : ''}

      <section class="section"><button class="btn ghost block" id="del">Delete this experiment</button></section>`);

    document.querySelectorAll('.tl').forEach((b) => b.addEventListener('click', () => {
      const d = Number(b.dataset.day);
      location.hash = d === 0 ? `#/p/${p.id}/day/0` : `#/p/${p.id}/day/${d}`;
    }));
    document.getElementById('del').addEventListener('click', async () => {
      if (!confirm('Delete this experiment and its results?')) return;
      await api(`/api/products/${p.id}`, { method: 'DELETE' });
      location.hash = '#/';
    });
    wireCompare();
  }

  async function dayPage(pid, day) {
    const p = await api(`/api/products/${pid}`);
    const ev = p.evaluation;
    const d0 = p.checkins.find((c) => c.day === 0);
    if (day === 0) {
      const s = d0.shots;
      render(`
        <a href="#/p/${p.id}" class="small muted">← ${esc(p.name)}</a>
        <h1 style="margin-top:12px;font-size:32px">Day 0 baseline</h1>
        <div class="pair section">${s.map((x, i) => `<figure><div class="masked"><img src="${x.photo}" alt="Day 0 shot ${i + 1}"></div><figcaption>Shot ${i + 1} · skin age ${x.skinAge ?? '–'} · ${esc(x.skinType.whole || '')}</figcaption></figure>`).join('')}</div>
        <p class="lede">Same face, same day — yet the scores differ by up to ${Math.max(...Object.values(ev.noise).map((n) => n.observedSpread || 0)).toFixed(1)} points on some concerns. That's the noise we filter out.</p>`);
      return;
    }
    const h = ev.history.find((x) => x.day === day);
    const ck = p.checkins.find((c) => c.day === day);
    if (!h) { location.hash = `#/p/${pid}`; return; }
    const v = h.verdict;
    const groups = orderConcerns(p, h.rows);
    const maskConcern = (v.flagged && v.flagged[0]) || groups.targets.find((c) => d0.shots[0].masks[c] && h.rows[c].status !== 'noise') || groups.targets.find((c) => d0.shots[0].masks[c]) || 'acne';
    const maskA = d0.shots[0].masks[maskConcern];
    const maskB = ck.shots[0].masks[maskConcern];
    render(`
      <a href="#/p/${p.id}" class="small muted">← ${esc(p.name)}</a>
      <p class="eyebrow" style="margin-top:14px">Day ${day} of ${esc(p.name)}</p>
      <div class="verdict ${v.code} section" style="margin-top:10px">
        <span class="stamp">${{ keep: 'Working', stop: 'Stop', early: 'Too early', switch: 'Not working' }[v.code]}</span>
        <h2>${esc(v.title)}</h2>
        <p style="margin-top:8px">${esc(v.summary)}</p>
        <p class="next">Next: ${esc(v.next)}</p>
      </div>

      <section class="section card">
        <h2>What it's supposed to fix</h2>
        <div style="margin-top:10px">${groups.targets.map((c) => concernRow(p, c, h.rows[c])).join('')}</div>
      </section>
      ${groups.watch.length ? `<section class="section card"><h2>Side-effect watch</h2>
        <div style="margin-top:10px">${groups.watch.map((c) => concernRow(p, c, h.rows[c])).join('')}</div></section>` : ''}

      <section class="section card">
        <h2>Where it changed</h2>
        <p class="small muted" style="margin-top:6px">YouCam detection mask for <b>${esc(label(maskConcern).toLowerCase())}</b>, Day 0 vs Day ${day}.</p>
        <div class="pair" style="margin-top:12px">
          <figure><div class="masked"><img src="${d0.shots[0].photo}" alt="Day 0">${maskA ? `<img class="mask" src="/media/cache/${maskA}" alt="">` : ''}</div><figcaption>Day 0</figcaption></figure>
          <figure><div class="masked"><img src="${ck.shots[0].photo}" alt="Day ${day}">${maskB ? `<img class="mask" src="/media/cache/${maskB}" alt="">` : ''}</div><figcaption>Day ${day}</figcaption></figure>
        </div>
        <div class="row" style="margin-top:10px">${groups.targets.concat(groups.watch, groups.rest).filter((c) => d0.shots[0].masks[c]).slice(0, 8).map((c) => `<button class="chip" data-mask="${c}" aria-pressed="${c === maskConcern}">${esc(label(c))}</button>`).join('')}</div>
      </section>

      <details class="section card"><summary><b>All other concerns</b> <span class="muted small">(${groups.rest.length})</span></summary>
        <div style="margin-top:10px">${groups.rest.map((c) => concernRow(p, c, h.rows[c])).join('')}</div>
      </details>
      <p class="api-note">Scores from YouCam Skin Analysis (SD, 16 actions). Each photo is one API call; nothing is called twice — results are cached by image hash.</p>`);

    document.querySelectorAll('[data-mask]').forEach((b) => b.addEventListener('click', () => {
      const c = b.dataset.mask;
      document.querySelectorAll('[data-mask]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      const figs = document.querySelectorAll('.pair .masked');
      [[figs[0], d0.shots[0].masks[c]], [figs[1], ck.shots[0].masks[c]]].forEach(([fig, m]) => {
        let im = fig.querySelector('.mask');
        if (!m) { if (im) im.remove(); return; }
        if (!im) { im = document.createElement('img'); im.className = 'mask'; im.alt = ''; fig.appendChild(im); }
        im.src = `/media/cache/${m}`;
      });
      document.querySelector('.pair').previousElementSibling.innerHTML = `YouCam detection mask for <b>${esc(label(c).toLowerCase())}</b>, Day 0 vs Day ${day}.`;
    }));
  }

  async function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    const parts = h.split('/').filter(Boolean);
    try {
      if (!parts.length) return await home();
      if (parts[0] === 'new') return newProduct();
      if (parts[0] === 'p' && parts[2] === 'checkin') return await checkin(parts[1], Number(parts[3] || 0));
      if (parts[0] === 'p' && parts[2] === 'day') return await dayPage(parts[1], Number(parts[3]));
      if (parts[0] === 'p') return await productPage(parts[1]);
      return await home();
    } catch (e) {
      render(`<p class="error">${esc(e.message)}</p><p style="margin-top:12px"><a href="#/">Back to start</a></p>`);
    }
  }

  (async () => {
    state.config = await api('/api/config');
    document.getElementById('mode').textContent = state.config.mode === 'live' ? 'YouCam API · live' : 'Offline demo';
    window.addEventListener('hashchange', route);
    route();
  })();
})();
