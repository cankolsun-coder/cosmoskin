#!/usr/bin/env node
/**
 * COSMOSKIN SEO Phase 1 — reusable automated SEO validator.
 *
 * Recursively inspects production HTML files and produces a PASS/WARN/FAIL
 * report. Exits non-zero only on genuine SEO correctness failures (WARNs do
 * not affect the exit code).
 *
 * Usage: node scripts/seo-audit.mjs [--json]
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const HOST = 'https://www.cosmoskin.com.tr';
const JSON_OUTPUT = process.argv.includes('--json');

// ---------------------------------------------------------------------------
// File discovery — tracked files only, so build tooling, worktrees, node
// modules, wrangler state, etc. are never treated as "production" HTML.
// ---------------------------------------------------------------------------

function gitTrackedHtmlFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT, encoding: 'utf8' });
    // git ls-files reflects the index, not the working tree — filter out
    // files deleted-but-not-yet-staged so the audit reflects what's on disk.
    return out.split('\n').filter(Boolean).filter((f) => existsSync(path.join(ROOT, f))).sort();
  } catch (_err) {
    return null;
  }
}

function walkHtmlFiles(dir, exclude, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtmlFiles(full, exclude, acc);
    else if (entry.isFile() && entry.name.endsWith('.html')) acc.push(path.relative(ROOT, full));
  }
  return acc;
}

const EXCLUDE_DIRS = new Set([
  '.git', '.claude', '.wrangler', '.github', '.lighthouseci', '.ua', '.cursor', '.vscode',
  'node_modules',
]);

let FILES = gitTrackedHtmlFiles();
if (!FILES) {
  FILES = walkHtmlFiles(ROOT, EXCLUDE_DIRS).sort();
}

// ---------------------------------------------------------------------------
// Route classification
// ---------------------------------------------------------------------------

// expectation: 'index' | 'noindex' | null (unclassified — flagged for review)
const ROUTE_RULES = [
  [/^index\.html$/, 'homepage', 'index'],
  [/^allproducts\.html$/, 'catalog', 'index'],
  [/^products\/.+\.html$/, 'product', 'index'],
  [/^brands\.html$/, 'brand-hub', 'index'],
  [/^brands\/.+\.html$/, 'brand', 'index'],
  [/^categories\.html$/, 'collection-hub', 'index'],
  [/^collections\/.+\.html$/, 'collection', 'index'],
  [/^legal\/.+\.html$/, 'legal', 'index'],
  [/^account\/.*\.html$/, 'account', 'noindex'],
  [/^admin\/.*\.html$/, 'admin', 'noindex'],
  [/^auth\/.*\.html$/, 'auth', 'noindex'],
  [/^payment\/.*\.html$/, 'payment', 'noindex'],
  [/^cart\.html$/, 'cart', 'noindex'],
  [/^checkout\.html$/, 'checkout', 'noindex'],
  [/^favorites\.html$/, 'favorites', 'noindex'],
  [/^order-tracking\.html$/, 'order-tracking', 'noindex'],
  [/^search\.html$/, 'search-filter', 'noindex'],
  [/^supabase-email-template\.html$/, 'email-template', 'noindex'],
  [/^email-previews\/.+\.html$/, 'email-preview', 'noindex'],
  [/^qa\/.+\.html$/, 'qa-report', 'noindex'],
  [/^snippets\/.+\.html$/, 'dev-snippet', 'noindex'],
  [/^journal\.html$/, 'editorial-hub', 'index'], // now a real index linking to /journal/*.html articles
  [/^journal\/.+\.html$/, 'editorial-article', 'index'],
  [/^explore\.html$/, 'editorial-nav', 'noindex'], // thin fallback-style navigation hub, no unique content of its own
  [/^routine\.html$/, 'editorial-tool', 'index'],
  [/^(contact|hakkimizda|cosmoskin-club|odeme-ve-guvenlik)\.html$/, 'about-info', 'index'],
];

const TRANSACTIONAL_ROUTE_TYPES = new Set([
  'account', 'admin', 'auth', 'payment', 'cart', 'checkout', 'favorites',
  'order-tracking', 'search-filter', 'email-template', 'email-preview',
  'qa-report', 'dev-snippet',
]);

function classify(file) {
  for (const [re, type, expectation] of ROUTE_RULES) {
    if (re.test(file)) return { type, expectation };
  }
  return { type: 'unclassified', expectation: null };
}

function urlForFile(file) {
  if (file === 'index.html') return `${HOST}/`;
  return `${HOST}/${file}`;
}

// ---------------------------------------------------------------------------
// HTML parsing helpers (regex-based; no DOM dependency by design — this repo
// ships no node_modules).
// ---------------------------------------------------------------------------

function attr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
  const m = tag.match(re);
  return m ? m[1] : null;
}

function findAll(re, html) {
  const out = [];
  let m;
  const g = new RegExp(re, 'gis');
  while ((m = g.exec(html))) out.push(m);
  return out;
}

function parsePage(file) {
  const html = readFileSync(path.join(ROOT, file), 'utf8');

  const htmlTagMatch = html.match(/<html\b[^>]*>/i);
  const lang = htmlTagMatch ? attr(htmlTagMatch[0], 'lang') : null;

  const titles = findAll('<title>([\\s\\S]*?)</title>', html).map((m) => m[1].trim());

  const descTags = findAll('<meta\\s+[^>]*name="description"[^>]*>', html)
    .concat(findAll('<meta\\s+[^>]*content="[^"]*"[^>]*name="description"[^>]*>', html));
  const description = descTags.length ? (attr(descTags[0][0], 'content') || '').trim() : null;

  const canonicalTags = findAll('<link\\s+[^>]*rel="canonical"[^>]*>', html);
  const canonicals = canonicalTags.map((m) => attr(m[0], 'href')).filter(Boolean);

  const robotsTags = findAll('<meta\\s+[^>]*name="robots"[^>]*>', html);
  const robotsValues = robotsTags.map((m) => (attr(m[0], 'content') || '').trim());

  const h1s = findAll('<h1[^>]*>', html);

  const ogTags = findAll('<meta\\s+[^>]*property="og:[a-z:]+"[^>]*>', html);
  const og = {};
  for (const [full] of ogTags) {
    const prop = attr(full, 'property');
    const content = attr(full, 'content');
    if (prop) og[prop] = content;
  }

  const jsonLdBlocks = findAll('<script\\s+type="application/ld\\+json"[^>]*>([\\s\\S]*?)</script>', html)
    .map((m) => m[1]);

  const isFragment = !htmlTagMatch; // reusable component snippets (no <html>) are not standalone documents

  return { html, lang, titles, description, canonicals, robotsValues, h1Count: h1s.length, og, jsonLdBlocks, isFragment };
}

// ---------------------------------------------------------------------------
// _headers parsing — X-Robots-Tag rules count as a valid noindex mechanism
// (defense-in-depth per Cloudflare Pages headers), independent of meta robots.
// ---------------------------------------------------------------------------

function parseHeadersNoindexRules() {
  const p = path.join(ROOT, '_headers');
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf8').split('\n');
  const rules = [];
  let currentPattern = null;
  let currentHasNoindex = false;
  const flush = () => {
    if (currentPattern && currentHasNoindex) rules.push(currentPattern);
  };
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      flush();
      currentPattern = line.trim();
      currentHasNoindex = false;
    } else if (/X-Robots-Tag/i.test(line) && /noindex/i.test(line)) {
      currentHasNoindex = true;
    }
  }
  flush();
  return rules; // path patterns like "/admin/*", "/cart.html"
}

function pathMatchesHeaderPattern(urlPath, pattern) {
  if (pattern.endsWith('/*')) return urlPath.startsWith(pattern.slice(0, -1));
  return urlPath === pattern;
}

const HEADERS_NOINDEX_RULES = parseHeadersNoindexRules();

function hasHeaderNoindex(file) {
  const urlPath = '/' + file;
  return HEADERS_NOINDEX_RULES.some((pattern) => pathMatchesHeaderPattern(urlPath, pattern));
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

const results = []; // { file, level: PASS|WARN|FAIL, code, message }
function report(file, level, code, message) {
  results.push({ file, level, code, message });
}

const titleIndex = new Map(); // title -> [files]
const descIndex = new Map(); // description -> [files]
const pages = [];

for (const file of FILES) {
  const { type, expectation } = classify(file);
  let parsed;
  try {
    parsed = parsePage(file);
  } catch (err) {
    report(file, 'FAIL', 'unreadable', `Could not read/parse file: ${err.message}`);
    continue;
  }
  const page = { file, type, expectation, ...parsed, url: urlForFile(file) };
  pages.push(page);

  const indexable = expectation === 'index';

  if (page.isFragment) {
    // Reusable component snippets (no <html> wrapper) are never navigated to
    // directly as a document; page-structure rules don't apply. They still
    // need noindex coverage if reachable by URL — via _headers, since there's
    // no <head> to hold a meta tag.
    if (expectation === 'noindex' && !hasHeaderNoindex(file)) {
      report(file, 'FAIL', 'expected-noindex', `Fragment file (no <html> wrapper) has no _headers X-Robots-Tag noindex rule covering its path — add one, since it has no <head> for a meta robots tag.`);
    }
    report(file, 'WARN', 'fragment-file', 'File has no <html> wrapper — treated as a reusable component fragment, not a standalone page. Title/lang/canonical checks skipped.');
    continue;
  }

  // 1. Title
  const nonEmptyTitles = page.titles.filter((t) => t.length > 0);
  if (page.titles.length === 0) {
    report(file, 'FAIL', 'title-missing', 'No <title> element found.');
  } else if (page.titles.length > 1) {
    report(file, 'FAIL', 'title-duplicate-tag', `Found ${page.titles.length} <title> elements; exactly one is required.`);
  } else if (nonEmptyTitles.length === 0) {
    report(file, 'FAIL', 'title-empty', 'The <title> element is empty.');
  } else {
    const t = nonEmptyTitles[0];
    if (t.length > 70) report(file, 'WARN', 'title-long', `Title is ${t.length} chars — consider tightening (soft guidance, not a hard limit).`);
    if (!titleIndex.has(t)) titleIndex.set(t, []);
    titleIndex.get(t).push(file);
  }

  // 2. Meta description
  if (page.description == null) {
    report(file, indexable ? 'FAIL' : 'WARN', 'description-missing', 'No meta description found.');
  } else if (page.description.length === 0) {
    report(file, indexable ? 'FAIL' : 'WARN', 'description-empty', 'Meta description is present but empty.');
  } else {
    if (page.description.length > 320) report(file, 'WARN', 'description-long', `Description is ${page.description.length} chars — unusually long (soft guidance).`);
    if (!descIndex.has(page.description)) descIndex.set(page.description, []);
    descIndex.get(page.description).push(file);
  }

  // 3. Canonical
  if (indexable) {
    if (page.canonicals.length === 0) {
      report(file, 'FAIL', 'canonical-missing', 'Indexable page has no rel="canonical" link.');
    } else if (page.canonicals.length > 1) {
      report(file, 'FAIL', 'canonical-duplicate', `Found ${page.canonicals.length} canonical links; exactly one is required.`);
    } else {
      const c = page.canonicals[0];
      if (!/^https:\/\//i.test(c)) report(file, 'FAIL', 'canonical-not-https', `Canonical is not absolute HTTPS: ${c}`);
      else if (!c.startsWith(HOST)) report(file, 'FAIL', 'canonical-wrong-host', `Canonical does not use ${HOST}: ${c}`);
      if (c.includes('#')) report(file, 'FAIL', 'canonical-has-fragment', `Canonical contains a fragment: ${c}`);
      const selfUrl = page.url;
      if (c !== selfUrl && c.replace(/\/$/, '') !== selfUrl.replace(/\/$/, '')) {
        report(file, 'WARN', 'canonical-not-self', `Canonical (${c}) does not self-reference this page's URL (${selfUrl}). Verify intentional (e.g. faceted/duplicate variant).`);
      }
    }
  } else if (page.canonicals.length > 1) {
    report(file, 'FAIL', 'canonical-duplicate', `Found ${page.canonicals.length} canonical links on a noindex page; at most one is expected.`);
  }

  // 4. robots meta
  if (page.robotsValues.length > 1) {
    report(file, 'FAIL', 'robots-duplicate', `Found ${page.robotsValues.length} <meta name="robots"> tags; exactly one is expected.`);
  }
  const robotsVal = (page.robotsValues[0] || '').toLowerCase();
  const isNoindexTag = /noindex/.test(robotsVal);
  const isIndexTag = /(^|,)\s*index(?!,\s*follow\b.*noindex)/.test(robotsVal) || (!robotsVal && true);
  if (expectation === 'noindex') {
    if (!isNoindexTag && !hasHeaderNoindex(file)) {
      report(file, 'FAIL', 'expected-noindex', `Route type "${type}" should be noindex but robots meta is "${robotsVal || '(missing — defaults to indexable)'}" and no _headers X-Robots-Tag rule covers this path.`);
    }
  } else if (expectation === 'index') {
    if (isNoindexTag) {
      report(file, 'WARN', 'unexpected-noindex', `Route type "${type}" is expected to be indexable but robots meta is "${robotsVal}". Verify intentional.`);
    }
  } else {
    report(file, 'WARN', 'unclassified-route', `File did not match any known route pattern — classify manually and extend ROUTE_RULES.`);
  }

  // 5. H1 (indexable, non-transactional content pages only)
  if (indexable && page.h1Count === 0) {
    report(file, 'WARN', 'h1-missing', 'No <h1> found in static markup (may be client-rendered — verify in-browser).');
  } else if (indexable && page.h1Count > 1) {
    report(file, 'WARN', 'h1-multiple', `Found ${page.h1Count} <h1> elements — expected exactly one.`);
  }

  // 6. html lang
  if (!page.lang) {
    report(file, 'FAIL', 'lang-missing', '<html> has no lang attribute.');
  } else if (!/^tr\b/i.test(page.lang)) {
    report(file, 'FAIL', 'lang-not-turkish', `<html lang="${page.lang}"> is not Turkish.`);
  }

  // 7. Open Graph (indexable pages only)
  if (indexable) {
    for (const key of ['og:title', 'og:description', 'og:url']) {
      if (!page.og[key]) report(file, 'WARN', 'og-missing', `Missing ${key}.`);
    }
    if (!page.og['og:image'] && type !== 'legal') {
      report(file, 'WARN', 'og-image-missing', 'Missing og:image.');
    }
    if (page.og['og:url']) {
      const c = page.canonicals[0];
      if (c && page.og['og:url'] !== c) {
        report(file, 'FAIL', 'og-url-canonical-mismatch', `og:url (${page.og['og:url']}) does not match canonical (${c}).`);
      }
      if (!page.og['og:url'].startsWith(HOST)) {
        report(file, 'FAIL', 'og-url-wrong-host', `og:url does not use ${HOST}: ${page.og['og:url']}`);
      }
    }
  }

  // 8. JSON-LD validity + Product/rating rules
  let sawProductLd = false;
  for (const block of page.jsonLdBlocks) {
    let data;
    try {
      data = JSON.parse(block);
    } catch (err) {
      report(file, 'FAIL', 'jsonld-invalid', `JSON-LD block is not valid JSON: ${err.message}`);
      continue;
    }
    const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data];
    for (const node of graph) {
      if (!node || typeof node !== 'object') continue;
      const nodeType = node['@type'];
      if (nodeType === 'Product') {
        sawProductLd = true;
        if (type !== 'product') {
          report(file, 'FAIL', 'product-ld-wrong-route', `Product JSON-LD found on a non-product route ("${type}").`);
        }
        if (node.aggregateRating || node.review) {
          report(file, 'FAIL', 'fabricated-rating-risk', 'Product JSON-LD ships aggregateRating/review baked into static HTML. Real ratings must be injected client-side from verified review data, never hardcoded in the file.');
        }
      }
      if (nodeType === 'AggregateRating' || nodeType === 'Review') {
        report(file, 'WARN', 'rating-node-present', `Standalone ${nodeType} JSON-LD node found — verify it reflects genuine, visible on-page review data.`);
      }
    }
  }
  if (type === 'product' && !sawProductLd) {
    report(file, 'WARN', 'product-ld-missing', 'Product page has no Product JSON-LD.');
  }

  if (page.titles.length && page.robotsValues.length === 0 && !TRANSACTIONAL_ROUTE_TYPES.has(type)) {
    // informational only — most pages carry an explicit robots tag; silent default is fine but worth surfacing once.
  }
}

// Cross-file duplicate detection
for (const [title, files] of titleIndex) {
  if (files.length > 1) {
    report(files.join(', '), 'WARN', 'title-duplicate-across-pages', `Title "${title}" is reused across ${files.length} pages: ${files.join(', ')}`);
  }
}
for (const [desc, files] of descIndex) {
  if (files.length > 1) {
    report(files.join(', '), 'WARN', 'description-duplicate-across-pages', `Description reused across ${files.length} pages: ${files.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// sitemap.xml checks
// ---------------------------------------------------------------------------

const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
if (existsSync(SITEMAP_PATH)) {
  const xml = readFileSync(SITEMAP_PATH, 'utf8');
  const locs = findAll('<loc>([^<]*)</loc>', xml).map((m) => m[1].trim());
  const fileByUrl = new Map(pages.map((p) => [p.url, p]));

  for (const loc of locs) {
    if (!loc.startsWith(HOST)) {
      report('sitemap.xml', 'FAIL', 'sitemap-wrong-host', `Sitemap URL does not use ${HOST}: ${loc}`);
      continue;
    }
    if (!/^https:\/\//.test(loc)) {
      report('sitemap.xml', 'FAIL', 'sitemap-not-https', `Sitemap URL is not HTTPS: ${loc}`);
    }
    const page = fileByUrl.get(loc);
    if (!page) {
      report('sitemap.xml', 'FAIL', 'sitemap-no-file', `Sitemap URL has no matching tracked HTML file: ${loc}`);
      continue;
    }
    if (TRANSACTIONAL_ROUTE_TYPES.has(page.type)) {
      report('sitemap.xml', 'FAIL', 'sitemap-transactional-url', `Sitemap includes a private/transactional page (${page.type}): ${loc}`);
    }
    const robotsVal = (page.robotsValues[0] || '').toLowerCase();
    if (/noindex/.test(robotsVal)) {
      report('sitemap.xml', 'FAIL', 'sitemap-noindex-url', `Sitemap includes a noindex page: ${loc}`);
    }
  }

  // Indexable pages missing from sitemap (WARN — inclusion is a judgment call for thin/duplicate variants)
  const locSet = new Set(locs);
  for (const page of pages) {
    if (page.expectation === 'index' && !locSet.has(page.url)) {
      report('sitemap.xml', 'WARN', 'sitemap-missing-indexable', `Indexable page not present in sitemap.xml: ${page.url}`);
    }
  }
} else {
  report('sitemap.xml', 'FAIL', 'sitemap-not-found', 'sitemap.xml not found at repo root.');
}

// ---------------------------------------------------------------------------
// robots.txt checks
// ---------------------------------------------------------------------------

const ROBOTS_PATH = path.join(ROOT, 'robots.txt');
if (existsSync(ROBOTS_PATH)) {
  const txt = readFileSync(ROBOTS_PATH, 'utf8');
  const sitemapLine = txt.split('\n').find((l) => /^sitemap:/i.test(l.trim()));
  if (!sitemapLine) {
    report('robots.txt', 'FAIL', 'robots-no-sitemap', 'robots.txt does not declare a Sitemap: line.');
  } else if (!sitemapLine.toLowerCase().includes(`${HOST}/sitemap.xml`.toLowerCase())) {
    report('robots.txt', 'FAIL', 'robots-wrong-sitemap', `robots.txt Sitemap line does not point at ${HOST}/sitemap.xml: ${sitemapLine.trim()}`);
  }
  if (/disallow:\s*\/assets\/?\s*$/im.test(txt)) {
    report('robots.txt', 'FAIL', 'robots-blocks-assets', 'robots.txt disallows /assets/ — this would block rendering of public pages.');
  }
  if (/noindex/i.test(txt)) {
    report('robots.txt', 'WARN', 'robots-noindex-directive', 'robots.txt contains a "noindex" token — this directive is not supported by Google in robots.txt; use meta robots or X-Robots-Tag instead.');
  }
} else {
  report('robots.txt', 'FAIL', 'robots-not-found', 'robots.txt not found at repo root.');
}

// ---------------------------------------------------------------------------
// www vs non-www sweep across all pages (canonical + og:url already checked
// per-page above; this is a final cross-cutting confirmation pass).
// ---------------------------------------------------------------------------

for (const page of pages) {
  for (const c of page.canonicals) {
    if (/^https?:\/\/cosmoskin\.com\.tr/i.test(c) || /^http:\/\//i.test(c)) {
      report(page.file, 'FAIL', 'host-inconsistency', `Non-canonical host/protocol found in a link: ${c}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const counts = { PASS: 0, WARN: 0, FAIL: 0 };
for (const r of results) counts[r.level]++;

if (JSON_OUTPUT) {
  console.log(JSON.stringify({ summary: counts, filesScanned: FILES.length, results }, null, 2));
} else {
  const byFile = new Map();
  for (const r of results) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  console.log(`COSMOSKIN SEO Audit — ${FILES.length} HTML files scanned\n`);
  const sortedFiles = [...byFile.keys()].sort();
  for (const file of sortedFiles) {
    for (const r of byFile.get(file)) {
      console.log(`[${r.level}] ${file} — ${r.code}: ${r.message}`);
    }
  }
  console.log(`\nSummary: ${counts.FAIL} FAIL, ${counts.WARN} WARN, ${FILES.length - byFile.size} files clean`);
  if (counts.FAIL > 0) {
    console.log(`\nRESULT: FAIL (${counts.FAIL} genuine SEO correctness failure${counts.FAIL === 1 ? '' : 's'})`);
  } else {
    console.log('\nRESULT: PASS (warnings, if any, do not block)');
  }
}

process.exitCode = counts.FAIL > 0 ? 1 : 0;
