const { CONCERNS, WATCH_FOR_IRRITATION, INGREDIENTS } = require('./ingredients');

let PRIORS = {};
try { PRIORS = require('./noise_prior.json').sigma || {}; } catch (_) {}
const PRIOR_SIGMA = 2.5;
const PRIOR_WEIGHT = 2;
const SIGMA_FLOOR = 1.5;
const Z = 2;
const priorFor = (c) => PRIORS[c] || PRIOR_SIGMA;

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }

function scoresOf(shot) { return shot.scores || {}; }

function noiseModel(baselineShots) {
  const model = {};
  for (const c of Object.keys(CONCERNS)) {
    const vals = baselineShots.map((s) => scoresOf(s)[c]).filter((v) => typeof v === 'number');
    if (!vals.length) continue;
    let pairVar = null;
    if (vals.length >= 2) {
      const m = mean(vals);
      pairVar = vals.reduce((a, v) => a + (v - m) ** 2, 0) / (vals.length - 1);
    }
    const df = vals.length - 1;
    const prior = priorFor(c);
    const pooled = pairVar === null
      ? prior ** 2
      : (pairVar * df + prior ** 2 * PRIOR_WEIGHT) / (df + PRIOR_WEIGHT);
    model[c] = {
      baseline: mean(vals),
      n: vals.length,
      observedSpread: vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : null,
      prior,
      sigma: Math.max(SIGMA_FLOOR, Math.sqrt(pooled))
    };
  }
  return model;
}

function compare(model, checkinShots) {
  const out = {};
  for (const [c, m] of Object.entries(model)) {
    const vals = checkinShots.map((s) => scoresOf(s)[c]).filter((v) => typeof v === 'number');
    if (!vals.length) continue;
    const now = mean(vals);
    const delta = now - m.baseline;
    const se = m.sigma * Math.sqrt(1 / m.n + 1 / vals.length);
    const z = delta / se;
    out[c] = {
      before: m.baseline, after: now, delta, se, band: Z * se, z,
      status: z >= Z ? 'improved' : z <= -Z ? 'worse' : 'noise'
    };
  }
  return out;
}

function verdictFor(product, checkin, rows) {
  const ing = INGREDIENTS.find((i) => i.id === product.ingredient) || INGREDIENTS[INGREDIENTS.length - 1];
  const targets = product.targets;
  const day = checkin.day;
  const [winStart, winEnd] = ing.window;
  const L = (c) => (CONCERNS[c] ? CONCERNS[c].label.toLowerCase() : c);

  const irritation = Object.entries(rows)
    .filter(([c, r]) => r.status === 'worse' && (WATCH_FOR_IRRITATION.includes(c) || targets.includes(c)));
  const improvedTargets = targets.filter((c) => rows[c] && rows[c].status === 'improved');
  const noiseTargets = targets.filter((c) => rows[c] && rows[c].status === 'noise');

  if (irritation.length) {
    const names = irritation.map(([c]) => L(c)).join(' and ');
    return {
      code: 'stop',
      title: 'Stop & patch-test',
      summary: `Your ${names} got measurably worse since Day 0 — more than your photo noise can explain.`,
      next: `Pause ${product.name} for 3–5 days. If it settles, patch-test it on your jawline for 48 hours before going back. If it doesn't settle, see a dermatologist.`,
      flagged: irritation.map(([c]) => c)
    };
  }
  if (improvedTargets.length) {
    const names = improvedTargets.map(L).join(' and ');
    const pendingNames = noiseTargets.map(L).join(' and ');
    const pending = noiseTargets.length ? ` ${pendingNames.charAt(0).toUpperCase() + pendingNames.slice(1)} ${noiseTargets.length > 1 ? 'are' : 'is'} still within noise.` : '';
    return {
      code: 'keep',
      title: "Keep going — it's working",
      summary: `${names.charAt(0).toUpperCase() + names.slice(1)} improved by more than your photo noise.${pending}`,
      next: day < winEnd
        ? `Keep the routine unchanged and check in again on Day ${nextCheckDay(day, winEnd)} — changing two things at once would make the next result unreadable.`
        : `Results are in. Keep ${product.name} as a staple; check in every 4 weeks to make sure it keeps working.`,
      flagged: []
    };
  }
  if (day < winStart) {
    return {
      code: 'early',
      title: 'Too early to tell',
      summary: `Nothing has moved beyond your photo noise yet. That's normal on Day ${day}: ${ing.name.toLowerCase()} usually needs ${winStart}–${winEnd} days to show.`,
      next: `Don't switch products. Check in again on Day ${nextCheckDay(day, winEnd)}, same spot, same light.`,
      flagged: []
    };
  }
  if (day < winEnd) {
    return {
      code: 'early',
      title: 'Not yet — keep going',
      summary: `No change beyond noise so far. You're inside the typical ${winStart}–${winEnd} day window, so give it more time.`,
      next: `Check in again on Day ${nextCheckDay(day, winEnd)}. If still nothing by Day ${winEnd}, it's probably not your product.`,
      flagged: []
    };
  }
  return {
    code: 'switch',
    title: 'Probably not working for you',
    summary: `After ${day} days, none of the target concerns moved beyond your photo noise.`,
    next: `Consider switching to a different active for ${targets.map(L).join(' / ') || 'your goal'} — your money is better spent elsewhere.`,
    flagged: []
  };
}

function nextCheckDay(day, winEnd) {
  const steps = [7, 14, 28, 42, 56, 84];
  return steps.find((d) => d > day) || Math.max(day + 28, winEnd);
}

function detectability(model, goalRows, targets) {
  const out = {};
  for (const c of targets) {
    const m = model[c];
    const g = goalRows && goalRows[c];
    if (!m || typeof g !== 'number') continue;
    const expected = g - m.baseline;
    const seOne = m.sigma * Math.sqrt(1 / m.n + 1);
    const seTwo = m.sigma * Math.sqrt(1 / m.n + 1 / 2);
    out[c] = {
      expectedDelta: expected,
      sigma: m.sigma,
      ratio: expected / (Z * seOne),
      shotsNeeded: expected >= Z * seOne ? 1 : expected >= Z * seTwo ? 2 : null
    };
  }
  return out;
}

function evaluate(product) {
  const baseline = product.checkins.find((c) => c.day === 0);
  if (!baseline) return { stage: 'need-baseline' };
  const model = noiseModel(baseline.shots);
  const goalScores = product.goal && product.goal.scores;
  const detect = goalScores ? detectability(model, goalScores, product.targets) : null;
  const history = product.checkins
    .filter((c) => c.day > 0)
    .sort((a, b) => a.day - b.day)
    .map((c) => {
      const rows = compare(model, c.shots);
      return { id: c.id, day: c.day, rows, verdict: verdictFor(product, c, rows) };
    });
  return { stage: history.length ? 'tracking' : 'baseline', noise: model, detect, history };
}

module.exports = { evaluate, noiseModel, compare, verdictFor, PRIOR_SIGMA, PRIOR_WEIGHT, Z };
