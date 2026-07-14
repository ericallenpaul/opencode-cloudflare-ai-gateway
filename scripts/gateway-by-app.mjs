#!/usr/bin/env node
/**
 * gateway-by-app.mjs
 *
 * Queries the Cloudflare AI Gateway GraphQL analytics API and writes a
 * self-contained interactive HTML chart of gateway traffic broken down by
 * app (from cf-aig-metadata), ranked by total tokens.
 *
 * Usage:
 *   node scripts/gateway-by-app.mjs [--days 14] [--gateway <name>] \
 *        [--out ./gateway-by-app.html] [--top 10]
 *
 * Required env:
 *   CLOUDFLARE_API_TOKEN   — Cloudflare API token with AI Gateway read access
 *
 * Optional env:
 *   CLOUDFLARE_ACCOUNT_ID  — Account ID (falls back to built-in constant)
 *
 * Note: The aiGatewayRequestsAdaptiveGroups dataset returns data for ALL
 * gateways on the account; the --gateway flag is used for labeling only.
 */

import { writeFileSync } from 'node:fs';

// ── constants ────────────────────────────────────────────────────────────────
const DEFAULT_ACCOUNT_ID = '003bd42b347c101d299f719f4d804603';
const DEFAULT_GATEWAY    = 'lvcorp-ais_services-nonprod';
const GQL_ENDPOINT       = 'https://api.cloudflare.com/client/v4/graphql';

// Categorical palette (8 slots) from validated reference palette.
// Light-mode and dark-mode steps; slot ordering is the CVD-safety mechanism.
const PALETTE_LIGHT = ['#2a78d6','#1baf7a','#eda100','#008300','#4a3aa7','#e34948','#e87ba4','#eb6834'];
const PALETTE_DARK  = ['#3987e5','#199e70','#c98500','#008300','#9085e9','#e66767','#d55181','#d95926'];
const GRAY          = '#898781'; // "Other" bucket — neutral, not a categorical slot

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opts = { days: 14, gateway: DEFAULT_GATEWAY, out: './gateway-by-app.html', top: 10 };

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--days':    opts.days    = parseInt(args[++i], 10); break;
    case '--gateway': opts.gateway = args[++i]; break;
    case '--out':     opts.out     = args[++i]; break;
    case '--top':     opts.top     = parseInt(args[++i], 10); break;
    default:
      process.stderr.write(`Unknown argument: ${args[i]}\n`);
      process.stderr.write('Usage: node gateway-by-app.mjs [--days N] [--gateway <name>] [--out <path>] [--top N]\n');
      process.exit(2);
  }
}

// ── auth / account ────────────────────────────────────────────────────────────
const token     = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID;

if (!token) {
  process.stderr.write(
    'Error: CLOUDFLARE_API_TOKEN environment variable is not set.\n' +
    '  export CLOUDFLARE_API_TOKEN=<your-token>  # Git Bash / Unix\n' +
    '  $env:CLOUDFLARE_API_TOKEN="<your-token>"  # PowerShell\n'
  );
  process.exit(1);
}

// ── date range ────────────────────────────────────────────────────────────────
const now   = new Date();
const start = new Date(now.getTime() - opts.days * 86_400_000);
const toISO = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');
const dateGeq = toISO(start);
const dateLeq = toISO(now);

// ── GraphQL query ─────────────────────────────────────────────────────────────
// Compact form embedded as a variable — see the query string below for the full
// structure. The dataset groups by metadataRaw (raw JSON string containing app,
// user, etc.) and sums token counts split by cache status.
const QUERY = `query GatewayByApp($accountTag:String!,$dateGeq:Time!,$dateLeq:Time!){viewer{accounts(filter:{accountTag:$accountTag}){aiGatewayRequestsAdaptiveGroups(limit:5000 filter:{datetime_geq:$dateGeq,datetime_leq:$dateLeq}){dimensions{metadataRaw}sum{cost cachedTokensIn cachedTokensOut uncachedTokensIn uncachedTokensOut erroredRequests}count}}}}`;

// ── fetch ─────────────────────────────────────────────────────────────────────
process.stderr.write(`Querying ${opts.days}d window: ${dateGeq} → ${dateLeq}\n`);

const res = await fetch(GQL_ENDPOINT, {
  method:  'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
  },
  body: JSON.stringify({
    query: QUERY,
    variables: { accountTag: accountId, dateGeq, dateLeq },
  }),
});

if (!res.ok) {
  const body = await res.text();
  process.stderr.write(`HTTP ${res.status} ${res.statusText}:\n${body}\n`);
  process.exit(1);
}

const payload = await res.json();
if (payload.errors?.length) {
  process.stderr.write(`GraphQL errors:\n${JSON.stringify(payload.errors, null, 2)}\n`);
  process.exit(1);
}

const groups = payload.data?.viewer?.accounts?.[0]?.aiGatewayRequestsAdaptiveGroups ?? [];
process.stderr.write(`Received ${groups.length} group(s) from API.\n`);

// ── aggregate per app ─────────────────────────────────────────────────────────
// metadataRaw is a raw JSON string (may be truncated); parse app best-effort.
const appMap = new Map();

for (const g of groups) {
  let app = 'unknown';
  const raw = g.dimensions?.metadataRaw;
  if (raw) {
    try {
      const meta = JSON.parse(raw);
      if (meta?.app) app = String(meta.app).trim() || 'unknown';
    } catch {
      // Truncated JSON — regex fallback
      const m = raw.match(/"app"\s*:\s*"([^"]+)"/);
      if (m?.[1]) app = m[1].trim();
    }
  }

  const cur = appMap.get(app) ?? { app, tokensIn: 0, tokensOut: 0, cachedTokensIn: 0, uncachedTokensIn: 0, requests: 0, cost: 0, errors: 0 };
  const s = g.sum ?? {};
  cur.cachedTokensIn   += s.cachedTokensIn   ?? 0;
  cur.uncachedTokensIn += s.uncachedTokensIn ?? 0;
  cur.tokensIn  += (s.cachedTokensIn   ?? 0) + (s.uncachedTokensIn   ?? 0);
  cur.tokensOut += (s.cachedTokensOut  ?? 0) + (s.uncachedTokensOut  ?? 0);
  cur.requests  += g.count ?? 0;
  cur.cost      += s.cost  ?? 0;
  cur.errors    += s.erroredRequests   ?? 0;
  appMap.set(app, cur);
}

// ── sort, top-N, Other bucket ─────────────────────────────────────────────────
let rows = [...appMap.values()].map(r => {
  const totalIn = r.cachedTokensIn + r.uncachedTokensIn;
  const inputCacheHitRate = totalIn > 0 ? (r.cachedTokensIn / totalIn * 100) : null;
  return { ...r, total: r.tokensIn + r.tokensOut, inputCacheHitRate };
});
rows.sort((a, b) => b.total - a.total);

if (rows.length > opts.top) {
  const rest  = rows.slice(opts.top);
  const other = rest.reduce(
    (acc, r) => {
      acc.tokensIn         += r.tokensIn;
      acc.tokensOut        += r.tokensOut;
      acc.cachedTokensIn   += r.cachedTokensIn;
      acc.uncachedTokensIn += r.uncachedTokensIn;
      acc.total            += r.total;
      acc.requests         += r.requests;
      acc.cost             += r.cost;
      acc.errors           += r.errors;
      return acc;
    },
    { app: 'Other', tokensIn: 0, tokensOut: 0, cachedTokensIn: 0, uncachedTokensIn: 0, total: 0, requests: 0, cost: 0, errors: 0 }
  );
  const otherTotalIn = other.cachedTokensIn + other.uncachedTokensIn;
  other.inputCacheHitRate = otherTotalIn > 0 ? (other.cachedTokensIn / otherTotalIn * 100) : null;
  rows = [...rows.slice(0, opts.top), other];
}

// ── number formatting (Node-side, for header) ─────────────────────────────────
function fmtNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

// Assign palette slot; "Other" always gets gray.
const colorData = rows.map((r, i) => ({
  ...r,
  colorLight: r.app === 'Other' ? GRAY : (PALETTE_LIGHT[i] ?? GRAY),
  colorDark:  r.app === 'Other' ? GRAY : (PALETTE_DARK[i]  ?? GRAY),
}));

const grandTotal = rows.reduce((s, r) => s + r.total, 0);
const fromDate   = start.toISOString().slice(0, 10);
const toDate     = now.toISOString().slice(0, 10);

// ── HTML ──────────────────────────────────────────────────────────────────────
// All CSS, JS, and data are inlined; no external network requests when viewing.
// SECURITY: token is NEVER included in the output HTML. Only aggregated counts
// and the gateway label string (which is a config value, not a secret) are embedded.

const embedData = JSON.stringify(colorData.map(r => ({
  app:                r.app,
  tokensIn:           r.tokensIn,
  tokensOut:          r.tokensOut,
  cachedTokensIn:     r.cachedTokensIn,
  uncachedTokensIn:   r.uncachedTokensIn,
  inputCacheHitRate:  r.inputCacheHitRate,
  total:              r.total,
  requests:           r.requests,
  cost:               r.cost,
  colorLight:         r.colorLight,
  colorDark:          r.colorDark,
})));

// Inner JS uses ${} template literals — those are NOT Node interpolations;
// they are literal strings for the browser. Marked with // <browser-js> comments.
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Gateway by App — ${opts.gateway}</title>
<style>
/* ── design tokens ────────────────────────────────────────────────────────── */
:root {
  --s1:     #fcfcfb; /* chart surface      */
  --s0:     #f9f9f7; /* page plane         */
  --ink1:   #0b0b0b;
  --ink2:   #52514e;
  --muted:  #898781;
  --grid:   #e1e0d9;
  --axis:   #c3c2b7;
  --border: rgba(11,11,11,0.10);
}
[data-theme=dark] {
  --s1:     #1a1a19;
  --s0:     #0d0d0d;
  --ink1:   #ffffff;
  --ink2:   #c3c2b7;
  --muted:  #898781;
  --grid:   #2c2c2a;
  --axis:   #383835;
  --border: rgba(255,255,255,0.10);
}

/* ── reset ────────────────────────────────────────────────────────────────── */
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size: 14px;
  background: var(--s0);
  color: var(--ink1);
  min-height: 100vh;
  padding: 24px 16px;
}

/* ── card ─────────────────────────────────────────────────────────────────── */
.card {
  max-width: 920px;
  margin: 0 auto;
  background: var(--s1);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
}

/* ── header ───────────────────────────────────────────────────────────────── */
.hdr-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.hdr-meta  {
  font-size: 12px; color: var(--ink2);
  display: flex; flex-wrap: wrap; gap: 8px 20px; margin-bottom: 4px;
}
.hdr-meta strong { color: var(--ink1); }
.hdr-note  { font-size: 11px; color: var(--muted); font-style: italic; }

/* ── controls ─────────────────────────────────────────────────────────────── */
.ctrl { display: flex; gap: 8px; margin: 16px 0; flex-wrap: wrap; }
.btn {
  font: inherit; font-size: 12px;
  padding: 5px 12px;
  border: 1px solid var(--axis);
  border-radius: 4px;
  background: var(--s1);
  color: var(--ink2);
  cursor: pointer;
}
.btn:hover  { background: var(--s0); }
.btn.active { border-color: var(--ink2); color: var(--ink1); font-weight: 600; }

/* ── legend ───────────────────────────────────────────────────────────────── */
.legend { display: flex; gap: 16px; font-size: 12px; color: var(--ink2); margin-bottom: 12px; align-items: center; }
.l-item { display: flex; align-items: center; gap: 6px; }
.l-sw   { width: 24px; height: 10px; border-radius: 2px; display: inline-block; }

/* ── chart ────────────────────────────────────────────────────────────────── */
.chart-wrap { overflow-x: auto; }
svg.chart   { display: block; width: 100%; }

/* ── table ────────────────────────────────────────────────────────────────── */
.tbl-wrap { display: none; overflow-x: auto; }
.tbl-wrap.on { display: block; }
table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
thead th {
  text-align: left; padding: 8px 10px;
  border-bottom: 1px solid var(--axis);
  color: var(--ink2); font-weight: 600; white-space: nowrap;
}
tbody td { padding: 7px 10px; border-bottom: 1px solid var(--grid); color: var(--ink1); white-space: nowrap; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: var(--s0); }
.r { text-align: right; }

/* ── tooltip ──────────────────────────────────────────────────────────────── */
#tip {
  position: fixed; pointer-events: none; display: none; z-index: 200;
  background: var(--s0); border: 1px solid var(--axis); border-radius: 6px;
  padding: 10px 14px; font-size: 12px; line-height: 1.8; color: var(--ink1);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15); min-width: 210px;
}
#tip b  { display: block; margin-bottom: 2px; font-size: 13px; }
#tip .tr { display: flex; justify-content: space-between; gap: 20px; }
#tip .tv { font-variant-numeric: tabular-nums; }
</style>
</head>
<body>

<div class="card" id="root">

  <div>
    <div class="hdr-title">AI Gateway Traffic by App</div>
    <div class="hdr-meta">
      <span>Period: <strong>${fromDate}</strong> → <strong>${toDate}</strong></span>
      <span>Gateway label: <strong>${opts.gateway}</strong></span>
      <span>Total tokens: <strong>${fmtNum(grandTotal)}</strong></span>
    </div>
    <div class="hdr-note">Data spans all AI Gateway gateways on the account — the API does not expose a gateway filter field.</div>
  </div>

  <div class="ctrl">
    <button class="btn active" id="bc" onclick="showChart()">Chart</button>
    <button class="btn"        id="bt" onclick="showTable()">Table</button>
    <button class="btn"        id="bd" onclick="toggleDark()">Dark mode</button>
  </div>

  <div class="legend" id="legend">
    <div class="l-item"><span class="l-sw" id="sw-in"></span>Tokens In</div>
    <div class="l-item"><span class="l-sw" id="sw-out"></span>Tokens Out</div>
  </div>

  <div class="chart-wrap" id="cw"><svg class="chart" id="chart"></svg></div>
  <div class="tbl-wrap"   id="tw">
    <table>
      <thead><tr>
        <th>App</th>
        <th class="r">Tokens In</th>
        <th class="r">Tokens Out</th>
        <th class="r">Total Tokens</th>
        <th class="r">Cache Hit %</th>
        <th class="r">Requests</th>
        <th class="r">Cost (USD)</th>
      </tr></thead>
      <tbody id="tb"></tbody>
    </table>
  </div>

</div><!-- .card -->

<div id="tip"></div>

<script>
// ── embedded data (no network calls at view time) ─────────────────────────────
const DATA = ${embedData};

// ── state ─────────────────────────────────────────────────────────────────────
let dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme();

function applyTheme() {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : '');
}

// ── number helpers ─────────────────────────────────────────────────────────────
function fmt(n) {
  if (n >= 1e9) return (n/1e9).toFixed(1)+'B';
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
  return String(Math.round(n));
}
function fmtCost(c) { return '$'+c.toFixed(4); }

function hexRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return 'rgba('+r+','+g+','+b+','+a+')';
}

// ── path helpers ───────────────────────────────────────────────────────────────
// Rect with rounded corners only on the right side (data end of bar).
function rectRoundedRight(x, y, w, h, r) {
  if (w <= 0) return '';
  r = Math.min(r, w, h / 2);
  return 'M'+x+','+y
    +' h'+(w-r)
    +' a'+r+','+r+' 0 0 1 '+r+','+r
    +' v'+(h-2*r)
    +' a'+r+','+r+' 0 0 1 '+(-r)+','+r
    +' H'+x+' Z';
}
// Plain rect path.
function rectPath(x, y, w, h) {
  if (w <= 0) return '';
  return 'M'+x+','+y+' h'+w+' v'+h+' H'+x+' Z';
}

// ── chart ──────────────────────────────────────────────────────────────────────
function drawChart() {
  const svg   = document.getElementById('chart');
  const col   = (r) => dark ? r.colorDark : r.colorLight;
  const ink2  = dark ? '#c3c2b7' : '#52514e';
  const muted = '#898781';
  const grid  = dark ? '#2c2c2a' : '#e1e0d9';
  const axis  = dark ? '#383835' : '#c3c2b7';
  const surf  = dark ? '#1a1a19' : '#fcfcfb'; // gap color

  const BAR_H = 30, GAP = 10, L = 188, R = 74, T = 8, B = 28;
  const RADIUS = 4, SEG_GAP = 2;
  const W = 860, n = DATA.length;
  const plotW = W - L - R;
  const H = T + n * (BAR_H + GAP) - GAP + B;
  const maxTot = Math.max(...DATA.map(d => d.total), 1);
  const sc = plotW / maxTot;

  // tick values for gridlines
  const tickFracs = [0.25, 0.5, 0.75, 1.0];
  const ticks = tickFracs.map(f => f * maxTot);

  let s = '';

  // gridlines + tick labels
  for (const tv of ticks) {
    const tx = L + tv * sc;
    const ty = T + n*(BAR_H+GAP) - GAP;
    s += '<line x1="'+tx+'" y1="'+T+'" x2="'+tx+'" y2="'+ty
      +'" stroke="'+grid+'" stroke-width="1"/>';
    s += '<text x="'+tx+'" y="'+(ty+18)+'" text-anchor="middle"'
      +' fill="'+muted+'" font-size="10">'+fmt(tv)+'</text>';
  }

  // y-axis baseline
  s += '<line x1="'+L+'" y1="'+T+'" x2="'+L+'" y2="'+(T+n*(BAR_H+GAP)-GAP)+'"'
    +' stroke="'+axis+'" stroke-width="1"/>';

  // bars
  for (let i = 0; i < DATA.length; i++) {
    const d  = DATA[i];
    const y  = T + i*(BAR_H+GAP);
    const cy = y + BAR_H/2;
    const c  = col(d);
    const cOut = hexRgba(c, 0.52);

    const wIn  = Math.max(0, d.tokensIn  * sc);
    const wOut = Math.max(0, d.tokensOut * sc);

    // app label (truncate at 24 chars)
    const lbl = d.app.length > 24 ? d.app.slice(0,22)+'…' : d.app;
    s += '<text x="'+(L-8)+'" y="'+(cy+4.5)+'" text-anchor="end"'
      +' fill="'+ink2+'" font-size="12">'+escHtml(lbl)+'</text>';

    // tokensIn segment
    if (wIn > 0) {
      const path = (wOut > 0) ? rectPath(L, y, wIn, BAR_H)
                               : rectRoundedRight(L, y, wIn, BAR_H, RADIUS);
      if (path) s += '<path d="'+path+'" fill="'+c+'" class="seg" data-i="'+i+'"/>';
    }

    // gap rect (surface color — creates visual separation)
    if (wIn > 0 && wOut > 0) {
      s += '<rect x="'+(L+wIn)+'" y="'+y+'" width="'+SEG_GAP+'" height="'+BAR_H
        +'" fill="'+surf+'"/>';
    }

    // tokensOut segment
    if (wOut > 0) {
      const xOut = L + wIn + (wIn > 0 ? SEG_GAP : 0);
      const wOutAdj = wOut - (wIn > 0 ? SEG_GAP : 0);
      if (wOutAdj > 0) {
        const path = rectRoundedRight(xOut, y, wOutAdj, BAR_H, RADIUS);
        if (path) s += '<path d="'+path+'" fill="'+cOut+'" class="seg" data-i="'+i+'"/>';
      }
    }

    // value label
    const wTot = wIn + wOut;
    if (wTot > 0) {
      s += '<text x="'+(L+wTot+6)+'" y="'+(cy+1)+'"'
        +' fill="'+ink2+'" font-size="11">'+fmt(d.total)+'</text>';
      // cache hit rate label — muted, secondary, below the total
      if (d.inputCacheHitRate !== null) {
        s += '<text x="'+(L+wTot+6)+'" y="'+(cy+13)+'"'
          +' fill="'+muted+'" font-size="10">'+d.inputCacheHitRate.toFixed(1)+'%</text>';
      }
    }
  }

  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.setAttribute('height', H);
  svg.innerHTML = s;

  // tooltip bindings
  svg.querySelectorAll('.seg').forEach(el => {
    el.addEventListener('mouseenter', (e) => showTip(e, DATA[+el.dataset.i]));
    el.addEventListener('mousemove',  moveTip);
    el.addEventListener('mouseleave', hideTip);
  });

  // update legend swatches with first app's color
  if (DATA.length) {
    const ref = dark ? DATA[0].colorDark : DATA[0].colorLight;
    document.getElementById('sw-in').style.background  = ref;
    document.getElementById('sw-out').style.background = hexRgba(ref, 0.52);
  }
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── tooltip ────────────────────────────────────────────────────────────────────
const tip = document.getElementById('tip');
function showTip(e, d) {
  const cacheHitLine = d.inputCacheHitRate !== null
    ? '<div class="tr"><span>Cache hit (input)</span><span class="tv">'
      + d.inputCacheHitRate.toFixed(1)+'% ('+fmt(d.cachedTokensIn)+' cached / '+fmt(d.uncachedTokensIn)+' uncached)'
      +'</span></div>'
    : '';
  tip.innerHTML =
    '<b>'+escHtml(d.app)+'</b>'
    +'<div class="tr"><span>Tokens In</span><span class="tv">'+fmt(d.tokensIn)+'</span></div>'
    +'<div class="tr"><span>Tokens Out</span><span class="tv">'+fmt(d.tokensOut)+'</span></div>'
    +'<div class="tr"><span>Total</span><span class="tv">'+fmt(d.total)+'</span></div>'
    + cacheHitLine
    +'<div class="tr"><span>Requests</span><span class="tv">'+fmt(d.requests)+'</span></div>'
    +'<div class="tr"><span>Cost</span><span class="tv">'+fmtCost(d.cost)+'</span></div>';
  tip.style.display = 'block';
  moveTip(e);
}
function moveTip(e) {
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  const px = e.clientX + 14, py = e.clientY - 10;
  tip.style.left = (px + tw > window.innerWidth  - 8 ? e.clientX - tw - 8 : px) + 'px';
  tip.style.top  = (py + th > window.innerHeight - 8 ? e.clientY - th - 8 : py) + 'px';
}
function hideTip() { tip.style.display = 'none'; }

// ── table ──────────────────────────────────────────────────────────────────────
function fmtCacheRate(r) {
  return r !== null ? r.toFixed(1)+'%' : '—';
}
function buildTable() {
  document.getElementById('tb').innerHTML = DATA.map(d =>
    '<tr><td>'+escHtml(d.app)+'</td>'
    +'<td class="r">'+fmt(d.tokensIn)+'</td>'
    +'<td class="r">'+fmt(d.tokensOut)+'</td>'
    +'<td class="r">'+fmt(d.total)+'</td>'
    +'<td class="r">'+fmtCacheRate(d.inputCacheHitRate)+'</td>'
    +'<td class="r">'+fmt(d.requests)+'</td>'
    +'<td class="r">'+fmtCost(d.cost)+'</td></tr>'
  ).join('');
}

// ── view toggles ───────────────────────────────────────────────────────────────
function showChart() {
  document.getElementById('cw').style.display    = '';
  document.getElementById('legend').style.display = '';
  document.getElementById('tw').classList.remove('on');
  document.getElementById('bc').classList.add('active');
  document.getElementById('bt').classList.remove('active');
}
function showTable() {
  document.getElementById('cw').style.display    = 'none';
  document.getElementById('legend').style.display = 'none';
  document.getElementById('tw').classList.add('on');
  document.getElementById('bc').classList.remove('active');
  document.getElementById('bt').classList.add('active');
}
function toggleDark() {
  dark = !dark;
  applyTheme();
  drawChart();
}

// ── init ───────────────────────────────────────────────────────────────────────
buildTable();
drawChart();
</script>
</body>
</html>`;

writeFileSync(opts.out, html, 'utf8');
process.stderr.write(`Wrote: ${opts.out}\n`);
