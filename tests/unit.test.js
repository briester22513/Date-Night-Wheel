// Run: node tests/unit.test.js
const assert = require('assert');
const W = require('../js/wheel.js');
const D = require('../js/data.js');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

console.log('Wheel math');
test('rotationForIndex always lands on the requested slice (20,000 random spins)', () => {
  for (let k = 0; k < 20000; k++) {
    const n = 2 + Math.floor(Math.random() * 11);
    const idx = Math.floor(Math.random() * n);
    const current = (Math.random() - 0.3) * 5000;
    const target = W.rotationForIndex(current, idx, n, { spins: 5 + (k % 3), offsetFrac: Math.random() });
    assert.ok(target > current, 'must always spin forward');
    assert.strictEqual(W.indexAtPointer(target, n), idx);
    // also true after normalising the angle, which the app does after every spin
    assert.strictEqual(W.indexAtPointer(W.mod(target, 360), n), idx);
  }
});
test('spin always travels at least the requested full turns', () => {
  const t = W.rotationForIndex(10, 3, 8, { spins: 6 });
  assert.ok(t - 10 >= 6 * 360);
});
test('landing point is never within 18% of a slice edge (no photo-finish ambiguity)', () => {
  for (let k = 0; k < 2000; k++) {
    const n = 12, s = 360 / n;
    const t = W.rotationForIndex(Math.random() * 720, 5, n, { offsetFrac: Math.random() });
    const local = W.mod(-t, 360) - 5 * s;
    assert.ok(local >= s * 0.18 - 1e-9 && local <= s * 0.82 + 1e-9);
  }
});
test('indexAtPointer: unrotated wheel shows slice 0 at 12 o\'clock', () => {
  assert.strictEqual(W.indexAtPointer(0.0001, 6), 5); // tiny clockwise turn → last slice slides under
  assert.strictEqual(W.indexAtPointer(-1, 6), 0);
});
test('weightedPick respects weights (statistical)', () => {
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 20000; i++) counts[W.weightedPick(['a', 'b'], [1, 0.15])]++;
  const ratio = counts.b / counts.a;
  assert.ok(ratio > 0.11 && ratio < 0.19, 'ratio was ' + ratio);
});
test('weightedSample returns distinct items', () => {
  const s = W.weightedSample([1, 2, 3, 4, 5, 6], () => 1, 4);
  assert.strictEqual(new Set(s).size, 4);
});
test('neighbouring slices never share a colour', () => {
  for (let n = 2; n <= 12; n++) {
    const c = W.colorIndices(n, 5);
    for (let i = 0; i < n; i++) assert.notStrictEqual(c[i], c[(i + 1) % n], `n=${n} i=${i}`);
  }
});

console.log('Data integrity');
const ids = new Set();
test('every option has required fields and valid values', () => {
  const kinds = new Set(Object.keys(D.KIND_EMOJI));
  for (const o of D.OPTIONS) {
    assert.ok(!ids.has(o.id), 'duplicate id ' + o.id); ids.add(o.id);
    assert.ok(/^[a-z0-9]+$/.test(o.id), 'id must be a url-safe slug: ' + o.id);
    ['name', 'short', 'area', 'desc', 'address'].forEach((f) => assert.ok(o[f], `${o.id} missing ${f}`));
    assert.ok(o.short.length <= 12, `${o.id} short label too long for the wheel`);
    assert.ok(['eat', 'play', 'create'].includes(o.category), o.id);
    assert.ok(kinds.has(o.kind), o.id + ' kind');
    assert.ok(D.ZONES[o.zone], o.id + ' zone');
    assert.ok([1, 2, 3].includes(o.price), o.id + ' price');
    assert.ok(o.moods.length && o.moods.every((m) => D.MOODS.includes(m)), o.id + ' moods');
    [o.website, o.booking].filter(Boolean).forEach((u) => assert.ok(/^(https:\/\/|tel:\+1\d{10}$)/.test(u), `${o.id} bad link ${u}`));
  }
});
test('no bowling or golf options', () => {
  assert.ok(!D.OPTIONS.some((o) => /bowling|golf/i.test(o.name + o.desc)));
});
test('every category has enough options to fill a wheel', () => {
  for (const c of ['eat', 'play', 'create']) assert.ok(D.OPTIONS.filter((o) => o.category === c).length >= 7, c);
});
test('every Full Date template can be filled with indoor options only (except golden hour)', () => {
  for (const t of D.NIGHT_TEMPLATES) {
    const pool = t.id === 'gdd' ? D.OPTIONS : D.OPTIONS.filter((o) => o.indoor);
    t.slots.forEach((kinds) => assert.ok(pool.some((o) => kinds.includes(o.kind)), `${t.id} slot ${kinds}`));
  }
});
test('each mood has at least 5 options', () => {
  for (const m of D.MOODS) assert.ok(D.OPTIONS.filter((o) => o.moods.includes(m)).length >= 5, m);
});

console.log(`\n${passed} tests passed. ${D.OPTIONS.length} date options, ${D.NIGHT_TEMPLATES.length} Full Date templates.`);
