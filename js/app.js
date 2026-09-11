/*
 * App controller
 * --------------
 * Flow in one sentence: filters → build a pool → sample ≤12 slices → pick a winner
 * (weighted by your history) → animate the wheel to that slice → read the winner back
 * from the final angle → show the card.
 */
(function () {
  'use strict';

  const { OPTIONS, NIGHT_TEMPLATES, ZONES, KIND_EMOJI, KIND_LABEL } = window.RVA_DATA;
  const W = window.RVAWheel;

  const MAX_SLICES = 12;
  const NIGHT_SLICES = 8;
  const DAY = 864e5;
  const KEYS = { fav: 'rvadn.v1.favorites', hist: 'rvadn.v1.history', prefs: 'rvadn.v1.prefs' };
  const byId = new Map(OPTIONS.map((o) => [o.id, o]));
  const tplById = new Map(NIGHT_TEMPLATES.map((t) => [t.id, t]));
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ───────────── Storage (localStorage with a safe in-memory fallback) ─────────────
  // Safari Private Browsing and some in-app browsers throw on localStorage.
  // Like a notebook that falls back to a sticky note: it still works, it just won't survive a reload.
  const store = (() => {
    const mem = {};
    let ok = true;
    try {
      const k = '__rvadn_test';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
    } catch (e) { ok = false; }
    return {
      ok,
      get(key, fallback) {
        try {
          const raw = ok ? localStorage.getItem(key) : mem[key];
          return raw ? JSON.parse(raw) : fallback;
        } catch (e) { return fallback; }
      },
      set(key, value) {
        const raw = JSON.stringify(value);
        try { if (ok) localStorage.setItem(key, raw); else mem[key] = raw; } catch (e) { mem[key] = raw; }
      }
    };
  })();

  // ───────────── State ─────────────
  const prefs = store.get(KEYS.prefs, {});
  const state = {
    mode: ['all', 'eat', 'play', 'create', 'full'].includes(prefs.mode) ? prefs.mode : 'all',
    budgets: new Set(Array.isArray(prefs.budgets) ? prefs.budgets : []),
    moods: new Set(Array.isArray(prefs.moods) ? prefs.moods : []),
    indoor: typeof prefs.indoor === 'boolean' ? prefs.indoor : true,
    segments: [],
    poolSize: 0,
    rotation: 0,
    spinning: false,
    hidden: false,
    current: null // payload shown in the result sheet
  };
  let favorites = store.get(KEYS.fav, []);
  let history = store.get(KEYS.hist, []);

  const savePrefs = () =>
    store.set(KEYS.prefs, { mode: state.mode, budgets: [...state.budgets], moods: [...state.moods], indoor: state.indoor });

  // ───────────── DOM ─────────────
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const el = {
    rotor: $('#rotor'), wrap: $('#wheelWrap'), pointer: $('#pointer'),
    spin: $('#spinBtn'), hub: $('#hubSpin'), surprise: $('#surpriseBtn'), shuffle: $('#shuffleBtn'), night: $('#nightBtn'),
    modes: $$('.mode'), budgets: $$('.chip.budget'), moods: $$('.chip.mood'), indoor: $('#indoorToggle'),
    match: $('#matchCount'), reset: $('#resetFilters'), empty: $('#emptyState'), emptyText: $('#emptyText'), emptyReset: $('#emptyReset'),
    hint: $('#hint'), scrim: $('#scrim'), result: $('#resultSheet'), resultBody: $('#resultBody'),
    saved: $('#savedSheet'), savedBtn: $('#savedBtn'), savedCount: $('#savedCount'), savedList: $('#savedList'), savedFoot: $('#savedFoot'),
    tabFav: $('#tabFav'), tabHist: $('#tabHist'), toast: $('#toast'), announce: $('#announce'), confetti: $('#confetti'), storageNote: $('#storageNote')
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const price = (p) => '$'.repeat(p);

  // ───────────── History weighting ─────────────
  // Done in the last 30 days → 0.15× as likely. 30–90 days → 0.45×. Older → normal.
  function recencyWeight(id, now = Date.now()) {
    let w = 1;
    for (const h of history) {
      if (!h.ids.includes(id)) continue;
      const days = (now - h.doneAt) / DAY;
      if (days < 30) w = Math.min(w, 0.15);
      else if (days < 90) w = Math.min(w, 0.45);
    }
    return w;
  }
  const payloadWeight = (p) => p.ids.reduce((w, id) => w * recencyWeight(id), 1);

  // ───────────── Filtering ─────────────
  const passesBase = (o) => (!state.indoor || o.indoor) && (!state.budgets.size || state.budgets.has(o.price));
  const passesMood = (o) => !state.moods.size || o.moods.some((m) => state.moods.has(m));

  function singlesPool(mode) {
    return OPTIONS.filter((o) => (mode === 'all' || o.category === mode) && passesBase(o) && passesMood(o));
  }

  // ───────────── Full Date builder ─────────────
  // Like planning a route with a friend: pick the first stop, then strongly prefer
  // places in the same part of town, accept neighbors, and almost never cross the city.
  function buildNight(tpl, base) {
    const stops = [];
    let zone = null;
    for (const kinds of tpl.slots) {
      const cands = base.filter((o) => kinds.includes(o.kind) && !stops.includes(o));
      if (!cands.length) return null;
      const weights = cands.map((o) => {
        const nearness = zone === null ? 1 : o.zone === zone ? 6 : ZONES[zone].near.includes(o.zone) ? 1 : 0.08;
        return recencyWeight(o.id) * nearness;
      });
      const pick = W.weightedPick(cands, weights);
      stops.push(pick);
      if (zone === null) zone = pick.zone;
    }
    if (state.moods.size && !stops.some(passesMood)) return null;
    return { type: 'night', tpl: tpl.id, ids: stops.map((s) => s.id) };
  }

  function buildNights(count) {
    const base = OPTIONS.filter(passesBase);
    const feasible = NIGHT_TEMPLATES.filter((t) => t.slots.every((kinds) => base.some((o) => kinds.includes(o.kind))));
    const nights = [];
    const seen = new Set();
    if (!feasible.length) return nights;
    const order = W.shuffle(feasible);
    for (let attempt = 0; attempt < 120 && nights.length < count; attempt++) {
      const tpl = order[attempt % order.length];
      const night = buildNight(tpl, base);
      if (!night) continue;
      const key = payloadKey(night);
      if (seen.has(key)) continue;
      seen.add(key);
      nights.push(night);
    }
    return nights;
  }

  // ───────────── Payload helpers ─────────────
  const payloadKey = (p) => (p.type === 'night' ? `n:${p.tpl}:${p.ids.join('.')}` : `d:${p.ids[0]}`);
  const stopsOf = (p) => p.ids.map((id) => byId.get(id)).filter(Boolean);
  const isValidPayload = (p) => p && p.ids && p.ids.length && stopsOf(p).length === p.ids.length && (p.type !== 'night' || tplById.has(p.tpl));

  function nightZoneLabel(stops) {
    const counts = {};
    stops.forEach((s) => (counts[s.zone] = (counts[s.zone] || 0) + 1));
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return ZONES[top].label;
  }

  function toSegment(p) {
    if (p.type === 'night') {
      const stops = stopsOf(p);
      const tpl = tplById.get(p.tpl);
      return { key: payloadKey(p), label: tpl.short, sub: nightZoneLabel(stops), emoji: KIND_EMOJI[stops[0].kind], payload: p };
    }
    const o = byId.get(p.ids[0]);
    return { key: payloadKey(p), label: o.short, emoji: KIND_EMOJI[o.kind], payload: p };
  }

  const mapsUrl = (o) => {
    const first = o.name.toLowerCase().split(' ')[0];
    const q = o.address.toLowerCase().includes(first) ? o.address : `${o.name}, ${o.address}`;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  };
  const routeUrl = (stops) => {
    const addr = stops.map((o) => `${o.name}, ${o.address}`);
    const params = new URLSearchParams({ api: '1', destination: addr[addr.length - 1], travelmode: 'driving' });
    if (addr.length > 1) params.set('waypoints', addr.slice(0, -1).join('|'));
    return 'https://www.google.com/maps/dir/?' + params.toString();
  };
  function bookingLabel(o) {
    if (o.bookingLabel) return o.bookingLabel;
    if (['escape', 'game', 'museum'].includes(o.kind)) return 'Book tickets';
    if (o.kind === 'show') return 'Get tickets';
    if (['candle', 'clay', 'paint'].includes(o.kind)) return 'Book a class';
    return 'Reserve a table';
  }

  // ───────────── Wheel build & render ─────────────
  function rebuildWheel() {
    let payloads;
    if (state.mode === 'full') {
      payloads = buildNights(NIGHT_SLICES);
      state.poolSize = payloads.length;
    } else {
      const pool = singlesPool(state.mode);
      state.poolSize = pool.length;
      const picks = W.weightedSample(pool, (o) => recencyWeight(o.id), MAX_SLICES);
      payloads = W.shuffle(picks).map((o) => ({ type: 'date', ids: [o.id] }));
    }
    state.segments = payloads.map(toSegment);
    renderWheel();
    renderStatus();
  }

  function renderWheel() {
    const segs = state.segments;
    el.wrap.classList.remove('landed');
    el.wrap.removeAttribute('data-landed-key');
    if (segs.length < 2) {
      el.rotor.innerHTML = W.renderWheelSVG(
        [{ key: 'x1', label: '', emoji: '♥' }, { key: 'x2', label: '', emoji: '♥' }, { key: 'x3', label: '', emoji: '♥' }, { key: 'x4', label: '', emoji: '♥' }, { key: 'x5', label: '', emoji: '♥' }],
        {}
      );
    } else {
      el.rotor.innerHTML = W.renderWheelSVG(segs, { hidden: state.hidden });
    }
    el.rotor.style.transform = `rotate(${state.rotation}deg)`;
  }

  function renderStatus() {
    const n = state.segments.length;
    const filtersOn = state.budgets.size > 0 || state.moods.size > 0;
    el.reset.hidden = !filtersOn;

    if (n < 2) {
      el.empty.hidden = false;
      if (state.mode === 'full') el.emptyText.textContent = 'No full nights fit every filter you picked. Try another budget or mood.';
      else if (n === 1) el.emptyText.textContent = `Only ${stopsOf(state.segments[0].payload)[0].name} fits. Loosen a filter to spin.`;
      else el.emptyText.textContent = 'No dates match every filter you picked.';
      el.emptyReset.hidden = !filtersOn;
      el.match.textContent = state.mode === 'full' ? 'No nights match' : n === 1 ? '1 date matches' : 'No dates match';
    } else {
      el.empty.hidden = true;
      if (state.mode === 'full') el.match.textContent = `${n} whole nights on the wheel`;
      else if (state.poolSize > n) el.match.textContent = `Showing ${n} of ${state.poolSize} matching dates`;
      else el.match.textContent = `${n} dates match`;
    }

    el.spin.textContent = state.mode === 'full' ? 'Spin our night' : 'Spin the date';
    el.shuffle.hidden = !(state.mode === 'full' || state.poolSize > n);
    el.hint.textContent =
      state.mode === 'full'
        ? 'Each slice is a whole night out, with stops kept close together.'
        : 'Too indecisive for one spin? “Build our whole night” plans food, an activity, and a little ending.';
    setControlsDisabled(state.spinning);
  }

  function syncControls() {
    el.modes.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
    el.budgets.forEach((b) => b.setAttribute('aria-pressed', String(state.budgets.has(Number(b.dataset.price)))));
    el.moods.forEach((b) => b.setAttribute('aria-pressed', String(state.moods.has(b.dataset.mood))));
    el.indoor.setAttribute('aria-checked', String(state.indoor));
  }

  function setControlsDisabled(disabled) {
    const canSpin = state.segments.length >= 2;
    [...el.modes, ...el.budgets, ...el.moods, el.indoor, el.shuffle, el.surprise, el.night, el.reset, el.emptyReset].forEach((b) => (b.disabled = disabled));
    el.spin.disabled = disabled || !canSpin;
    el.hub.disabled = disabled || !canSpin;
    el.wrap.classList.toggle('spinning', disabled);
  }

  // ───────────── Spin ─────────────
  let lastTickAt = 0;
  function tickPointer() {
    const now = performance.now();
    if (now - lastTickAt < 55) return; // at top speed, skip ticks so the pointer isn't a blur
    lastTickAt = now;
    el.pointer.classList.remove('tick', 'celebrate');
    void el.pointer.getBoundingClientRect(); // restart the CSS animation
    el.pointer.classList.add('tick');
  }

  function spin() {
    if (state.spinning || state.segments.length < 2) return;
    closeSheet(true);
    const segs = state.segments;
    const n = segs.length;
    const indices = segs.map((_, i) => i);
    const winner = W.weightedPick(indices, segs.map((s) => payloadWeight(s.payload)));
    const calm = reduceMotion();
    const target = W.rotationForIndex(state.rotation, winner, n, {
      spins: calm ? 2 : 5 + Math.floor(Math.random() * 3),
      offsetFrac: 0.22 + Math.random() * 0.56
    });

    state.spinning = true;
    el.wrap.classList.remove('landed');
    $$('.seg.winner', el.rotor).forEach((p) => p.classList.remove('winner'));
    setControlsDisabled(true);

    let lastIdx = W.indexAtPointer(state.rotation, n);
    W.animateSpin({
      from: state.rotation,
      to: target,
      duration: calm ? 1600 : 4600 + Math.random() * 1200,
      onFrame(rot) {
        el.rotor.style.transform = `rotate(${rot}deg)`;
        const idx = W.indexAtPointer(rot, n);
        if (idx !== lastIdx) { lastIdx = idx; tickPointer(); }
      },
      onDone(rot) {
        // Normalise so the number never grows huge; visually identical.
        state.rotation = W.mod(rot, 360);
        el.rotor.style.transform = `rotate(${state.rotation}deg)`;
        // Source of truth: read the winner from where the wheel actually stopped.
        land(W.indexAtPointer(state.rotation, n));
      }
    });
  }

  function land(index) {
    state.spinning = false;
    const seg = state.segments[index];
    if (state.hidden) { state.hidden = false; renderWheel(); }
    const path = $(`.seg[data-index="${index}"]`, el.rotor);
    if (path) path.classList.add('winner');
    el.wrap.classList.add('landed');
    el.wrap.dataset.landedKey = seg.key;
    el.pointer.classList.remove('tick');
    void el.pointer.getBoundingClientRect();
    el.pointer.classList.add('celebrate');
    setControlsDisabled(false);

    const name = seg.payload.type === 'night' ? tplById.get(seg.payload.tpl).title : byId.get(seg.payload.ids[0]).name;
    el.announce.textContent = `The wheel landed on ${name}.`;
    if (navigator.vibrate) { try { navigator.vibrate([18, 40, 18]); } catch (e) { /* not supported on iOS */ } }

    const r = el.wrap.getBoundingClientRect();
    confettiBurst(r.left + r.width / 2, r.top + r.height * 0.18);
    setTimeout(() => openResult(seg.payload, 'spin'), reduceMotion() ? 150 : 750);
  }

  // ───────────── Result card ─────────────
  function actionRow(p) {
    const fav = isFavorite(p);
    const done = doneRecently(p);
    return (
      `<div class="act-row">` +
      `<button class="act" type="button" data-act="share"><span class="ico" aria-hidden="true">💌</span>Send to her</button>` +
      `<button class="act" type="button" data-act="fav" aria-pressed="${fav}"><span class="ico" aria-hidden="true">${fav ? '♥' : '♡'}</span>${fav ? 'Saved' : 'Favorite'}</button>` +
      `<button class="act done" type="button" data-act="done" aria-pressed="${done}"><span class="ico" aria-hidden="true">${done ? '✓' : '☐'}</span>${done ? 'Logged' : 'We did this'}</button>` +
      `</div>`
    );
  }

  function renderSingle(o, source) {
    const kicker = source === 'shared' ? 'Sent to you ✨' : source === 'saved' ? 'From your saved dates' : `${KIND_EMOJI[o.kind]} ${KIND_LABEL[o.kind]}`;
    const primaryHref = o.booking || o.website;
    const primaryText = o.booking ? bookingLabel(o) : 'Visit website';
    const ctas = primaryHref
      ? `<a class="cta primary" href="${esc(primaryHref)}" target="_blank" rel="noopener">${esc(primaryText)}</a>` +
        `<a class="cta secondary" href="${esc(mapsUrl(o))}" target="_blank" rel="noopener">Open in Maps</a>`
      : `<a class="cta primary only" href="${esc(mapsUrl(o))}" target="_blank" rel="noopener">Open in Google Maps</a>`;
    const extra = o.website && o.booking && o.website !== o.booking
      ? `<p class="r-tip"><a href="${esc(o.website)}" target="_blank" rel="noopener">Official website</a></p>` : '';
    return (
      `<p class="kicker">${esc(kicker)}</p>` +
      `<h2 class="r-name" id="resultTitle">${esc(o.name)}</h2>` +
      `<ul class="meta"><li>${esc(o.area)}</li><li class="price" aria-label="Price level ${o.price} of 3">${price(o.price)}</li>` +
      `<li>${o.indoor ? 'Indoors' : 'Outdoors'}</li><li>${esc(KIND_LABEL[o.kind])}</li></ul>` +
      `<p class="r-desc">${esc(o.desc)}</p>` +
      (o.tip ? `<p class="r-tip">${esc(o.tip)}</p>` : '') +
      `<div class="cta-row">${ctas}</div>` + extra
    );
  }

  function renderNight(p, source) {
    const tpl = tplById.get(p.tpl);
    const stops = stopsOf(p);
    const prices = stops.map((s) => s.price);
    const lo = Math.min(...prices), hi = Math.max(...prices);
    const kicker = source === 'shared' ? 'Sent to you ✨' : source === 'saved' ? 'From your saved nights' : '💫 Your whole night';
    const items = stops.map((o) => {
      const links = [`<a href="${esc(mapsUrl(o))}" target="_blank" rel="noopener">Maps</a>`];
      if (o.booking) links.push(`<a href="${esc(o.booking)}" target="_blank" rel="noopener">${esc(bookingLabel(o))}</a>`);
      else if (o.website) links.push(`<a href="${esc(o.website)}" target="_blank" rel="noopener">Website</a>`);
      return (
        `<li class="stop"><span class="s-kind">${KIND_EMOJI[o.kind]} ${esc(KIND_LABEL[o.kind])}</span>` +
        `<h3>${esc(o.name)}</h3><p>${esc(o.area)}, ${price(o.price)}. ${esc(o.desc)}</p>` +
        `<div class="s-links">${links.join('')}</div></li>`
      );
    });
    return (
      `<p class="kicker">${esc(kicker)}</p>` +
      `<h2 class="r-name" id="resultTitle">${esc(tpl.title)}</h2>` +
      `<ul class="meta"><li>${esc(nightZoneLabel(stops))}</li><li class="price">${lo === hi ? price(lo) : `${price(lo)} to ${price(hi)}`}</li><li>${stops.length} stops</li></ul>` +
      `<ol class="stops">${items.join('')}</ol>` +
      `<div class="cta-row"><a class="cta primary only" href="${esc(routeUrl(stops))}" target="_blank" rel="noopener">Route all stops in Maps</a></div>`
    );
  }

  function openResult(p, source) {
    if (!isValidPayload(p)) { toast('That date is no longer on our list.'); return; }
    state.current = p;
    const body = p.type === 'night' ? renderNight(p, source) : renderSingle(byId.get(p.ids[0]), source);
    el.resultBody.innerHTML = body + actionRow(p) + `<button class="again" type="button" data-act="again">Spin again</button>`;
    el.result.dataset.resultKey = payloadKey(p);
    openSheet(el.result);
  }

  function refreshActionRow() {
    const row = $('.act-row', el.resultBody);
    if (row && state.current) row.outerHTML = actionRow(state.current);
  }

  // ───────────── Share ─────────────
  function shareUrl(p) {
    const u = new URL(window.location.href);
    u.hash = '';
    u.search = '';
    if (p.type === 'night') u.searchParams.set('night', `${p.tpl}~${p.ids.join('.')}`);
    else u.searchParams.set('date', p.ids[0]);
    return u.toString();
  }
  function shareText(p) {
    if (p.type === 'night') {
      const stops = stopsOf(p).map((o, i) => `${i + 1}) ${o.name}`).join('  ');
      return `Our night, if you're in 💫 ${stops}.`;
    }
    const o = byId.get(p.ids[0]);
    return `Date night idea 💕 ${o.name} in ${o.area}. ${o.desc}`;
  }

  async function sharePayload(p) {
    const url = shareUrl(p);
    const text = shareText(p);
    // navigator.share must run straight from the tap (iOS requires a "user gesture"), so no awaits before it.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Date night?', text, url });
        toast('Shared 💌');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // she closed the share sheet, not an error
      }
    }
    copyText(`${text} ${url}`);
  }

  function copyText(s) {
    const done = () => toast('Link copied. Paste it to her 💌');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(s).then(done, () => legacyCopy(s) ? done() : window.prompt('Copy this link:', s));
    } else if (legacyCopy(s)) done();
    else window.prompt('Copy this link:', s);
  }
  function legacyCopy(s) {
    try {
      const ta = document.createElement('textarea');
      ta.value = s; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, s.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  // ───────────── Favorites & history ─────────────
  const isFavorite = (p) => favorites.some((f) => f.key === payloadKey(p));
  const doneRecently = (p) => history.some((h) => h.key === payloadKey(p) && Date.now() - h.doneAt < 12 * 3600e3);

  function toggleFavorite(p) {
    const key = payloadKey(p);
    if (isFavorite(p)) {
      favorites = favorites.filter((f) => f.key !== key);
      toast('Removed from favorites');
    } else {
      favorites.unshift({ key, type: p.type, tpl: p.tpl || null, ids: p.ids.slice(), savedAt: Date.now() });
      toast('Saved to favorites ♥');
    }
    store.set(KEYS.fav, favorites);
    renderSavedCount();
  }

  function toggleDone(p) {
    const key = payloadKey(p);
    if (doneRecently(p)) {
      // Undo: remove the most recent log for this date
      const i = history.findIndex((h) => h.key === key);
      if (i > -1) history.splice(i, 1);
      toast('Removed from your history');
    } else {
      history.unshift({ key, type: p.type, tpl: p.tpl || null, ids: p.ids.slice(), doneAt: Date.now() });
      history = history.slice(0, 200);
      toast('Logged ✓ It will come up less for a while');
    }
    store.set(KEYS.hist, history);
    renderSavedCount();
  }

  function renderSavedCount() {
    const n = favorites.length;
    el.savedCount.hidden = n === 0;
    el.savedCount.textContent = String(n);
  }

  let savedTab = 'fav';
  function entryTitle(e) {
    if (e.type === 'night') {
      const tpl = tplById.get(e.tpl);
      const names = e.ids.map((id) => (byId.get(id) || {}).name).filter(Boolean);
      return { title: tpl ? tpl.title : 'Full date', sub: names.join(', ') };
    }
    const o = byId.get(e.ids[0]);
    return o ? { title: o.name, sub: `${o.area}, ${price(o.price)}` } : { title: 'No longer listed', sub: '' };
  }
  const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  function renderSaved() {
    const isFav = savedTab === 'fav';
    el.tabFav.setAttribute('aria-selected', String(isFav));
    el.tabHist.setAttribute('aria-selected', String(!isFav));
    const list = isFav ? favorites : history;
    if (!list.length) {
      el.savedList.innerHTML = `<li><p class="list-empty">${isFav ? 'Tap ♡ Favorite on any result to keep it here.' : 'Tap “We did this” after a date. Those spots come up less often for 90 days.'}</p></li>`;
    } else {
      el.savedList.innerHTML = list.map((e, i) => {
        const t = entryTitle(e);
        const when = isFav ? `Saved ${fmtDate(e.savedAt)}` : `Went ${fmtDate(e.doneAt)}`;
        return (
          `<li class="item"><button class="i-main" type="button" data-open="${i}">` +
          `<span class="i-title">${esc(t.title)}</span><span class="i-sub">${esc(t.sub)}. ${when}</span></button>` +
          `<button class="i-x" type="button" data-remove="${i}" aria-label="Remove ${esc(t.title)}">✕</button></li>`
        );
      }).join('');
    }
    el.savedFoot.innerHTML = isFav
      ? `<span>${favorites.length} saved on this device</span>`
      : `<span>Recent dates show up less often.</span>` + (history.length ? `<button class="link-btn" type="button" data-clear>Clear history</button>` : '');
  }

  // ───────────── Sheets ─────────────
  let activeSheet = null;
  let lastFocus = null;
  function openSheet(sheet) {
    if (activeSheet && activeSheet !== sheet) closeSheet(true);
    lastFocus = document.activeElement;
    activeSheet = sheet;
    el.scrim.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => {
      el.scrim.classList.add('open');
      sheet.classList.add('open');
    });
    const first = $('[data-close]', sheet);
    if (first) first.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
  }
  function closeSheet(silent) {
    if (!activeSheet) return;
    const sheet = activeSheet;
    activeSheet = null;
    sheet.classList.remove('open');
    el.scrim.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => {
      if (activeSheet !== sheet) sheet.hidden = true;
      if (!activeSheet) el.scrim.hidden = true;
    }, reduceMotion() ? 0 : 320);
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // ───────────── Toast ─────────────
  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2400);
  }

  // ───────────── Confetti (hearts + sparkles) ─────────────
  function confettiBurst(x, y) {
    if (reduceMotion()) return;
    const c = el.confetti;
    const ctx = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = window.innerWidth * dpr;
    c.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#ff6fae', '#b48cff', '#e8c27a', '#6cc7f0', '#7fddb0', '#fff3dc'];
    const parts = Array.from({ length: 110 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const v = 6 + Math.random() * 9;
      return {
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        r: 4 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        color: colors[(Math.random() * colors.length) | 0], shape: Math.random() < 0.45 ? 'heart' : Math.random() < 0.5 ? 'dot' : 'bar'
      };
    });
    const start = performance.now();
    function heart(s) {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.1, 0, -s * 0.45);
      ctx.bezierCurveTo(s * 0.45, -s * 1.1, s * 1.1, -s * 0.35, 0, s * 0.35);
      ctx.fill();
    }
    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 1900);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'heart') heart(p.r);
        else if (p.shape === 'dot') { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.5, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.r * 0.2, -p.r * 0.7, p.r * 0.4, p.r * 1.4);
        ctx.restore();
      }
      if (t < 1900) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, c.width, c.height);
    }
    requestAnimationFrame(frame);
  }

  // ───────────── Events ─────────────
  function onFilterChange() {
    state.hidden = false;
    savePrefs();
    syncControls();
    rebuildWheel();
  }

  el.modes.forEach((b) => b.addEventListener('click', () => {
    if (state.spinning) return;
    state.mode = b.dataset.mode;
    onFilterChange();
  }));
  el.budgets.forEach((b) => b.addEventListener('click', () => {
    const p = Number(b.dataset.price);
    state.budgets.has(p) ? state.budgets.delete(p) : state.budgets.add(p);
    onFilterChange();
  }));
  el.moods.forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.mood;
    state.moods.has(m) ? state.moods.delete(m) : state.moods.add(m);
    onFilterChange();
  }));
  el.indoor.addEventListener('click', () => { state.indoor = !state.indoor; onFilterChange(); });

  function clearFilters() {
    state.budgets.clear();
    state.moods.clear();
    onFilterChange();
  }
  el.reset.addEventListener('click', clearFilters);
  el.emptyReset.addEventListener('click', clearFilters);

  el.spin.addEventListener('click', spin);
  el.hub.addEventListener('click', spin);
  el.shuffle.addEventListener('click', () => { if (!state.spinning) { state.hidden = false; rebuildWheel(); } });

  el.surprise.addEventListener('click', () => {
    if (state.spinning) return;
    const hadFilters = state.budgets.size || state.moods.size || state.mode !== 'all';
    state.mode = 'all';
    state.budgets.clear();
    state.moods.clear();
    savePrefs();
    syncControls();
    state.hidden = true; // blind wheel: labels reveal when it lands
    rebuildWheel();
    if (hadFilters) toast('Any budget, any mood. Eyes closed 🎲');
    spin();
  });

  el.night.addEventListener('click', () => {
    if (state.spinning) return;
    state.mode = 'full';
    onFilterChange();
    spin();
  });

  el.resultBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !state.current) return;
    const act = btn.dataset.act;
    if (act === 'share') sharePayload(state.current);
    else if (act === 'fav') { toggleFavorite(state.current); refreshActionRow(); }
    else if (act === 'done') { toggleDone(state.current); refreshActionRow(); }
    else if (act === 'again') { closeSheet(true); setTimeout(spin, reduceMotion() ? 0 : 260); }
  });

  el.savedBtn.addEventListener('click', () => { renderSaved(); openSheet(el.saved); });
  el.tabFav.addEventListener('click', () => { savedTab = 'fav'; renderSaved(); });
  el.tabHist.addEventListener('click', () => { savedTab = 'hist'; renderSaved(); });
  el.saved.addEventListener('click', (e) => {
    const list = savedTab === 'fav' ? favorites : history;
    const open = e.target.closest('[data-open]');
    const rm = e.target.closest('[data-remove]');
    if (open) {
      const entry = list[Number(open.dataset.open)];
      if (entry) openResult({ type: entry.type, tpl: entry.tpl, ids: entry.ids }, 'saved');
    } else if (rm) {
      list.splice(Number(rm.dataset.remove), 1);
      store.set(savedTab === 'fav' ? KEYS.fav : KEYS.hist, list);
      renderSavedCount();
      renderSaved();
    } else if (e.target.closest('[data-clear]')) {
      if (window.confirm('Clear your whole date history? Past spots will come up at normal odds again.')) {
        history = [];
        store.set(KEYS.hist, history);
        renderSaved();
      }
    }
  });

  document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  el.scrim.addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // ───────────── Boot ─────────────
  function readSharedLink() {
    const q = new URLSearchParams(window.location.search);
    const date = q.get('date');
    const night = q.get('night');
    if (date && byId.has(date)) return { type: 'date', ids: [date] };
    if (night) {
      const [tpl, ids] = night.split('~');
      const p = { type: 'night', tpl, ids: (ids || '').split('.').filter(Boolean) };
      if (isValidPayload(p)) return p;
    }
    return null;
  }

  el.storageNote.hidden = store.ok;
  syncControls();
  rebuildWheel();
  renderSavedCount();
  const shared = readSharedLink();
  if (shared) setTimeout(() => openResult(shared, 'shared'), 250);

  // Tiny read-only hook for automated tests and curious devs (open DevTools → RVAApp.debug()).
  window.RVAApp = {
    debug: () => ({
      mode: state.mode, rotation: state.rotation, segments: state.segments.map((s) => s.key),
      landedIndex: state.segments.length ? W.indexAtPointer(state.rotation, state.segments.length) : null,
      storage: store.ok ? 'localStorage' : 'memory'
    })
  };
})();
