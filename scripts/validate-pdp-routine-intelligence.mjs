#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const js = readFileSync(join(root, 'assets/pdp-professional.js'), 'utf8');
const css = readFileSync(join(root, 'assets/pdp-professional.css'), 'utf8');
const requiredJs = [
  'normalizeProductMeta',
  'fitPercent',
  'renderRoutineAside',
  '.pdp5-media-thumbs',
  'touchstart',
  'aria-live',
  'Akıllı Rutinimi Oluştur',
  'tıbbi tavsiye değildir'
];
const requiredCss = [
  '.pdp8-routine-intel-card',
  '.pdp8-routine-mini',
  '.pdp8-fit-score__badge--percent',
  '@media(max-width:760px)'
];
const missingJs = requiredJs.filter((token) => !js.includes(token));
const missingCss = requiredCss.filter((token) => !css.includes(token));
if (missingJs.length || missingCss.length) {
  console.error('PDP routine intelligence validation failed');
  if (missingJs.length) console.error('Missing JS markers:', missingJs.join(', '));
  if (missingCss.length) console.error('Missing CSS markers:', missingCss.join(', '));
  process.exit(1);
}
const productFiles = readdirSync(join(root, 'products')).filter((name) => name.endsWith('.html'));
const stale = productFiles.filter((name) => {
  const html = readFileSync(join(root, 'products', name), 'utf8');
  return html.includes('/assets/pdp-professional.js?v=20260702-pdp-v9') || html.includes('/assets/pdp-professional.css?v=20260702-pdp-v9');
});
if (stale.length) {
  console.error('Stale PDP professional cache bust references:', stale.slice(0, 10).join(', '));
  process.exit(1);
}
console.log(`COSMOSKIN PDP routine intelligence validation passed: ${productFiles.length} product pages checked.`);
