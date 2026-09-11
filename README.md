# Bri & Mikaela's Date Night Wheel · Richmond, VA

A mobile-first date-night wheel for Richmond, VA. Plain HTML/CSS/JS, no build step,
no dependencies (fonts are self-hosted in `/fonts`). Every control is fully wired —
nothing here is a mockup.

## What's inside

```
index.html            Page shell + all markup
css/styles.css         Design tokens, wheel, sheets, confetti, reduced-motion
js/data.js              ← EDIT THIS to add/remove/update date options
js/wheel.js             Pointer math, weighted random picks, SVG rendering, spin animation
js/app.js               Filters, spin flow, Full Date builder, share, favorites/history
fonts/                  Self-hosted Bodoni Moda (display) + Bricolage Grotesque (UI)
assets/                 App icons + link-preview image
manifest.webmanifest    "Add to Home Screen" metadata
tests/unit.test.js      Pure-math tests (pointer accuracy, data integrity) — run with Node
tests/e2e_test.py       Full browser test in iPhone emulation — run with Playwright
scripts/check-links.mjs Pings every website/booking URL in data.js and reports dead links
```

## How the wheel actually works

Picture a clock face turning clockwise under a fixed pointer at 12 o'clock.

1. **Pick the winner first.** Each spin weights every slice by how recently you
   logged it with "We Did This" — done in the last 30 days = far less likely,
   30–90 days = somewhat less likely, otherwise normal odds.
2. **Work backward to an angle.** Given the winner, the code computes exactly
   which rotation parks that slice under the pointer, landing a bit off-center
   in the slice (never right at an edge), then adds 5–7 extra full turns so it
   actually looks like a spin.
3. **Animate there** with an ease-out curve (fast start, long suspenseful slow-down).
4. **Read the winner back from where it stopped.** The result card never trusts
   "the number I picked in step 1" — it re-derives the winner from the final
   angle, the same way a person would look at the wheel and read it off. That's
   what makes the card and the visual pointer impossible to disagree.

All of that math lives in `js/wheel.js` and has no DOM dependency, which is why
it can be unit-tested with plain Node (see below).

## Editing the date list

Open `js/data.js`. Every option is one object with a comment block above it
explaining each field. To add a place: copy an existing entry, give it a new
`id`, fill in the fields, and it's on the wheel — no other file needs to change.
To retire a place: delete its entry (or leave it and it'll still work if someone
opens an old shared link... actually no, remove it so old links show "no longer
listed" gracefully, which the app already handles).

`NIGHT_TEMPLATES` at the bottom of that file defines the "Full Date" combos
(Dinner → Activity → Dessert, etc.) — each slot lists which `kind`s of place can
fill it.

## Running it locally

No build step. From this folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or just double-click `index.html` — it works from `file://` too, since nothing
requires a server (no fetch calls, no service worker).

## Testing

```bash
# Pure math + data checks (fast, no browser)
node tests/unit.test.js

# Full browser test in emulated iPhone 13 — spins repeatedly, verifies the
# wheel's pointer physically agrees with the result card, checks every filter,
# Full Date, Surprise Us, sharing, persistence after reload, and layout
pip install playwright && playwright install chromium
python3 tests/e2e_test.py
```

Before every release, also run the link checker (see below) — restaurants close.

```bash
node scripts/check-links.mjs
```

## Deploying

This is a static site: any of these work with zero configuration.

**Netlify** — drag the whole project folder onto https://app.netlify.com/drop,
or `netlify deploy --prod` from this folder.

**Vercel** — `vercel --prod` from this folder (no framework preset needed).

**Cloudflare Pages** — connect the repo, or `wrangler pages deploy .`.

**GitHub Pages** — push this folder to a repo, then Settings → Pages → deploy
from the branch root.

After deploying, update the `og:image` and `og:url` meta tags in `index.html`
with your real domain so link previews (iMessage, Slack, etc.) render correctly —
right now `og:image` points to a relative path, which most platforms won't follow.

## A few implementation notes worth knowing about

- **Storage** falls back gracefully. If `localStorage` is blocked (Safari
  Private Browsing, some in-app browsers), favorites and history still work for
  the session, and a note in the footer says they won't survive a reload.
- **The wheel's rotating layer is `pointer-events: none`.** A rotated square div
  hit-tests as its *full rotated rectangle*, including transparent corners that
  swing out past its own box at odd angles — without this, the wheel could
  shadow the Spin button sitting just below it. Only the Hub button (center of
  the wheel) and the Spin button below it are meant to be tappable.
- **`overflow-x: hidden` is set on both `<html>` and `<body>`.** On mobile,
  `<html>` is the real scrolling root, not `<body>`. The wheel's rotated bounding
  box is briefly wider than the screen mid-spin; without the rule on `<html>`
  too, the whole page's layout viewport would creep wider on every spin.
- **Copyright:** all restaurant/venue descriptions are written fresh, not quoted
  from reviews.
