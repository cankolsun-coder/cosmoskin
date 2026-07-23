#!/usr/bin/env node
/**
 * COSMOSKIN SEO Phase 1 — deterministic sitemap generator.
 *
 * Regenerates sitemap.xml from the tracked HTML files that are actually
 * indexable (self-canonical, robots index/follow, not a private/transactional
 * route). This intentionally mirrors the route classification in
 * scripts/seo-audit.mjs so the two never drift apart silently.
 *
 * Does NOT invent lastmod values — Phase 1 ships URL-only <loc> entries,
 * since there is no reliable per-page "last changed" source of truth in this
 * static repo. Run with --write to overwrite sitemap.xml; without it, prints
 * a diff-style report of what would change.
 *
 * Usage: node scripts/generate-sitemap.mjs [--write]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const HOST = 'https://www.cosmoskin.com.tr';
const WRITE = process.argv.includes('--write');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');

function gitTrackedHtmlFiles() {
  const out = execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).filter((f) => existsSync(path.join(ROOT, f))).sort();
}

// Kept identical in spirit to scripts/seo-audit.mjs ROUTE_RULES — same source
// of truth for "what is indexable" so sitemap and validator agree by
// construction. If you change one, change the other.
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
  [/^journal\.html$/, 'editorial-hub', 'index'],
  [/^journal\/.+\.html$/, 'editorial-article', 'index'],
  [/^explore\.html$/, 'editorial-nav', 'noindex'],
  [/^routine\.html$/, 'editorial-tool', 'index'],
  [/^(contact|hakkimizda|cosmoskin-club|odeme-ve-guvenlik)\.html$/, 'about-info', 'index'],
];

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

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

function getRobotsMeta(html) {
  const m = html.match(/<meta\s+[^>]*name="robots"[^>]*>/i);
  return m ? (attr(m[0], 'content') || '').toLowerCase() : '';
}

function getCanonical(html) {
  const m = html.match(/<link\s+[^>]*rel="canonical"[^>]*>/i);
  return m ? attr(m[0], 'href') : null;
}

const files = gitTrackedHtmlFiles();
const included = [];
const excluded = [];

for (const file of files) {
  const { type, expectation } = classify(file);
  if (expectation !== 'index') {
    excluded.push({ file, reason: `route type "${type}" is not indexable` });
    continue;
  }
  const html = readFileSync(path.join(ROOT, file), 'utf8');
  const robots = getRobotsMeta(html);
  if (/noindex/.test(robots)) {
    excluded.push({ file, reason: `page has explicit noindex robots meta ("${robots}")` });
    continue;
  }
  const canonical = getCanonical(html);
  const selfUrl = urlForFile(file);
  if (!canonical) {
    excluded.push({ file, reason: 'no canonical link found' });
    continue;
  }
  if (canonical.replace(/\/$/, '') !== selfUrl.replace(/\/$/, '')) {
    // Not self-canonical (e.g. points at a different page) — sitemap should
    // carry the canonical target, not this variant, and only if that target
    // is itself indexable. Phase 1 keeps this conservative: skip and flag.
    excluded.push({ file, reason: `canonical points elsewhere (${canonical}) — not self-referencing, skipped rather than guessing` });
    continue;
  }
  included.push(canonical);
}

const uniqueSorted = [...new Set(included)].sort();

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...uniqueSorted.map((u) => `  <url><loc>${u}</loc></url>`),
  '</urlset>',
  '',
].join('\n');

if (WRITE) {
  writeFileSync(SITEMAP_PATH, xml, 'utf8');
  console.log(`Wrote ${uniqueSorted.length} URLs to sitemap.xml`);
} else {
  const existing = existsSync(SITEMAP_PATH) ? readFileSync(SITEMAP_PATH, 'utf8') : '';
  const existingLocs = new Set([...existing.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]));
  const added = uniqueSorted.filter((u) => !existingLocs.has(u));
  const removed = [...existingLocs].filter((u) => !uniqueSorted.includes(u));
  console.log(`Would generate ${uniqueSorted.length} URLs (currently ${existingLocs.size} in sitemap.xml).`);
  console.log(`\n+ ${added.length} to add:`);
  added.forEach((u) => console.log(`  + ${u}`));
  console.log(`\n- ${removed.length} to remove:`);
  removed.forEach((u) => console.log(`  - ${u}`));
  console.log(`\n${excluded.length} indexable-route files excluded (with reason):`);
  excluded.forEach((e) => console.log(`  - ${e.file}: ${e.reason}`));
  console.log('\nRun with --write to apply.');
}
