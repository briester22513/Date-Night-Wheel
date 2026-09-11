#!/usr/bin/env python3
"""
Rebuilds standalone.html by inlining css/styles.css, js/data.js, js/wheel.js,
js/app.js, and the two font files into a single self-contained copy of
index.html. Run this after editing anything under css/ or js/ so the
single-file version stays in sync with the real project.

Usage:  python3 scripts/build-standalone.py
"""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def data_uri(rel, mime):
    raw = (ROOT / rel).read_bytes()
    return f"data:{mime};base64," + base64.b64encode(raw).decode('ascii')


def main():
    html = read('index.html')
    css = read('css/styles.css')
    data_js = read('js/data.js')
    wheel_js = read('js/wheel.js')
    app_js = read('js/app.js')

    bodoni_uri = data_uri('fonts/bodoni-moda-latin-opsz-italic.woff2', 'font/woff2')
    bricolage_uri = data_uri('fonts/bricolage-grotesque-latin-opsz-normal.woff2', 'font/woff2')

    css = css.replace(
        "url('../fonts/bodoni-moda-latin-opsz-italic.woff2') format('woff2')",
        f"url('{bodoni_uri}') format('woff2')"
    )
    css = css.replace(
        "url('../fonts/bricolage-grotesque-latin-opsz-normal.woff2') format('woff2')",
        f"url('{bricolage_uri}') format('woff2')"
    )
    if css.count('data:font/woff2;base64') != 2 or '../fonts/' in css:
        raise SystemExit('Font inlining failed — check the @font-face src lines in css/styles.css')

    favicon_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<rect width="64" height="64" rx="14" fill="%23140818"/>'
        '<path d="M32 50 8 30a12 12 0 0 1 17-17l7 7 7-7a12 12 0 0 1 17 17z" fill="%23ff6fae"/></svg>'
    )
    favicon_uri = "data:image/svg+xml," + favicon_svg.replace('"', "'")

    # Drop <head> tags that point at files this single-file build doesn't carry
    # along (touch icons, manifest, preloads, the og:image path) and swap in one
    # inline favicon instead of leaving a 404.
    head_removals = {
        r'\s*<meta name="apple-mobile-web-app-capable"[^>]*/>\n': 1,
        r'\s*<meta name="mobile-web-app-capable"[^>]*/>\n': 1,
        r'\s*<meta name="apple-mobile-web-app-status-bar-style"[^>]*/>\n': 1,
        r'\s*<meta name="apple-mobile-web-app-title"[^>]*/>\n': 1,
        r'\s*<link rel="apple-touch-icon"[^>]*/>\n': 1,
        r'\s*<link rel="icon"[^>]*/>\n': 1,
        r'\s*<link rel="manifest"[^>]*/>\n': 1,
        r'\s*<meta property="og:image"[^>]*/>\n': 1,
        r'\s*<link rel="preload" href="fonts/[^"]*"[^>]*/>\n': 2,
    }
    for pattern, expected in head_removals.items():
        html, n = re.subn(pattern, '\n', html)
        if n != expected:
            raise SystemExit(f'index.html has changed shape — expected {expected} matches for {pattern!r}, found {n}. Update this script to match.')

    html = html.replace(
        '<meta name="theme-color" content="#100613" />',
        f'<meta name="theme-color" content="#100613" />\n  <link rel="icon" href="{favicon_uri}" />'
    )

    stylesheet_tag = '  <link rel="stylesheet" href="css/styles.css" />\n'
    if stylesheet_tag not in html:
        raise SystemExit('Could not find the stylesheet <link> to replace — did index.html change?')
    html = html.replace(stylesheet_tag, f'  <style>\n{css}\n  </style>\n')

    scripts_block = (
        '  <script src="js/data.js"></script>\n'
        '  <script src="js/wheel.js"></script>\n'
        '  <script src="js/app.js"></script>\n'
    )
    if scripts_block not in html:
        raise SystemExit('Could not find the three <script src> tags to replace — did index.html change?')
    inline_scripts = (
        f'  <script>\n{data_js}\n  </script>\n'
        f'  <script>\n{wheel_js}\n  </script>\n'
        f'  <script>\n{app_js}\n  </script>\n'
    )
    html = html.replace(scripts_block, inline_scripts)

    for leftover in ('href="css/', 'src="js/', 'href="fonts/', 'href="assets/', 'href="manifest'):
        if leftover in html:
            raise SystemExit(f'Leftover external reference in output: {leftover}')

    out = ROOT / 'standalone.html'
    out.write_text(html, encoding='utf-8')
    size_kb = len(html.encode('utf-8')) / 1024
    print(f'Wrote {out} ({size_kb:.0f} KB)')


if __name__ == '__main__':
    main()
