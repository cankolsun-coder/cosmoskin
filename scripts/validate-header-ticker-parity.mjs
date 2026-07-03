import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const errors = [];
const warn = [];
function expect(condition, message){ if(!condition) errors.push(message); }

const accountProfile = read('account/profile.html');
const orderDetail = read('account/order-detail.html');
const accountCss = read('assets/account-premium.css');
const styleCss = read('assets/style.css');

expect(accountProfile.includes('class="header account-header" style="top:40px;"'), 'account/profile.html account header top must be 40px');
expect(orderDetail.includes('class="header account-header" style="top:40px;"'), 'account/order-detail.html account header top must be 40px');
expect(!accountProfile.includes('top:38px'), 'account/profile.html still contains top:38px');
expect(!orderDetail.includes('top:38px'), 'account/order-detail.html still contains top:38px');
expect(/\/assets\/account-premium\.css\?v=2026070[23]-/.test(accountProfile), 'account-premium.css cache version was not bumped on account/profile.html');

expect(styleCss.includes('.announcement') && styleCss.includes('@keyframes marqueeMove'), 'base homepage announcement styles/keyframes missing');
expect(accountCss.includes('Account announcement ticker parity with homepage'), 'account ticker parity override missing');
expect(accountCss.includes('height:40px!important'), 'account ticker height parity missing');
expect(accountCss.includes('letter-spacing:.32em!important'), 'account ticker desktop letter spacing does not match homepage base');
expect(accountCss.includes('font-weight:500!important'), 'account ticker desktop font weight does not match homepage base');
expect(accountCss.includes('animation-duration:22s!important'), 'account ticker effective animation duration must match homepage master-upgrade duration');
expect(accountCss.includes('.account-page .header.account-header{top:40px!important;}'), 'account header top CSS guard missing');

const htmlFiles = ['account/profile.html', 'account/order-detail.html'];
for (const file of htmlFiles) {
  const html = read(file);
  if (!html.includes('<div class="announcement"><div class="marquee">') && !html.includes('<div class="announcement">')) warn.push(`${file}: announcement markup not found in expected compact/expanded form`);
}

if (errors.length) {
  console.error('COSMOSKIN header ticker parity validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  if (warn.length) warn.forEach((w) => console.warn(`warning: ${w}`));
  process.exit(1);
}
if (warn.length) warn.forEach((w) => console.warn(`warning: ${w}`));
console.log('COSMOSKIN header ticker parity validation passed: account ticker matches homepage timing/typography guardrails.');
