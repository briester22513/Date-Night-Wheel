#!/usr/bin/env node
/*
 * Pings every website/booking URL in js/data.js and reports anything that
 * didn't return a healthy status. Run this every few months — restaurants
 * close, and a wheel that lands on a dead link is a bad night.
 *
 * Usage:  node scripts/check-links.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(here, '..', 'js', 'data.js');

// data.js runs in browser/CJS; grab OPTIONS without a full bundler.
globalThis.window = globalThis;
const src = readFileSync(dataPath, 'utf8');
new Function(src)(); // defines window.RVA_DATA
const { OPTIONS } = globalThis.RVA_DATA;

const targets = [];
for (const o of OPTIONS) {
  if (o.website) targets.push({ id: o.id, name: o.name, field: 'website', url: o.website });
  if (o.booking && o.booking !== o.website && !o.booking.startsWith('tel:')) {
    targets.push({ id: o.id, name: o.name, field: 'booking', url: o.booking });
  }
}

console.log(`Checking ${targets.length} links across ${OPTIONS.length} date options...\n`);

const results = await Promise.all(
  targets.map(async (t) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      let res;
      try {
        res = await fetch(t.url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
        // Some sites reject HEAD; retry with GET before giving up.
        if (res.status === 405 || res.status === 403) {
          res = await fetch(t.url, { method: 'GET', redirect: 'follow', signal: controller.signal });
        }
      } finally {
        clearTimeout(timer);
      }
      return { ...t, ok: res.ok, status: res.status };
    } catch (err) {
      return { ...t, ok: false, status: 'ERROR', error: err.message };
    }
  })
);

const bad = results.filter((r) => !r.ok);
for (const r of results) {
  const mark = r.ok ? '✓' : '✗';
  console.log(`${mark} [${r.status}] ${r.name} (${r.field}) — ${r.url}`);
}

console.log(`\n${results.length - bad.length}/${results.length} links healthy.`);
if (bad.length) {
  console.log('\nCheck these by hand — the business may have moved, closed, or just blocks bots:');
  bad.forEach((r) => console.log(`  - ${r.name}: ${r.url} (${r.status}${r.error ? ', ' + r.error : ''})`));
  process.exit(1);
}
