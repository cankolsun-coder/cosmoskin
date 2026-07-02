import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const iconDir = join(root, 'assets/icons/cosmoskin');
const scopedFiles = [
  'index.html',
  'routine.html',
  'account/profile.html',
  'account/routines.html',
  'account/routines/index.html',
  'assets/js/smart-routine.js',
  'assets/routines.js',
  'assets/account-dashboard.js',
  'assets/smart-routine.css',
  'assets/routines.css',
  'assets/account-premium.css'
];
const extraAccountFiles = readdirSync(join(root, 'account'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('routine-'))
  .flatMap((entry) => [`account/${entry.name}.html`, `account/${entry.name}/index.html`]);
const allScoped = scopedFiles.concat(extraAccountFiles);
const errors = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

for (const file of walk(iconDir)) {
  if (!file.endsWith('.svg')) {
    errors.push(`Non-SVG file in cosmoskin icon directory: ${relative(root, file)}`);
    continue;
  }
  const source = readFileSync(file, 'utf8');
  if (!/viewBox="0 0 24 24"/.test(source)) errors.push(`Missing standard viewBox: ${relative(root, file)}`);
  if (/base64/i.test(source)) errors.push(`Base64 content found: ${relative(root, file)}`);
  if (/<image\b/i.test(source)) errors.push(`<image> tag found: ${relative(root, file)}`);
  if (/\.(png|jpe?g|webp)/i.test(source)) errors.push(`Bitmap reference found: ${relative(root, file)}`);
  if (/<svg[^>]*\s(width|height)="\d/i.test(source)) errors.push(`Hardcoded width/height found: ${relative(root, file)}`);
}

for (const file of allScoped) {
  let source = '';
  try { source = readFileSync(join(root, file), 'utf8'); } catch { continue; }
  if (/assets\/icons\/routine\/final-color\/256|routine\/final-color/i.test(source)) errors.push(`Legacy routine PNG icon reference found: ${file}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`COSMOSKIN icon validation passed: ${walk(iconDir).length} SVG files checked, ${allScoped.length} scoped files scanned.`);
