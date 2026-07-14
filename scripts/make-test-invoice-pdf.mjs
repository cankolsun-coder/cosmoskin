#!/usr/bin/env node
// E4 — Generates the NON-FISCAL test invoice artifact used to verify invoice
// email rendering and delivery end-to-end without ever touching the QNB /
// e-invoice production integration or production invoice numbering.
// Output: email-previews/TEST-INVOICE-MALI-DEGERI-YOKTUR.pdf
// The document is visibly watermarked "TEST BELGESIDIR - MALI DEGERI YOKTUR".
// (PDF core fonts are Latin-1; the watermark uses ASCII transliteration —
// the accompanying email/runbook carry the full Turkish wording.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'email-previews');
mkdirSync(outDir, { recursive: true });

const lines = [
  ['COSMOSKIN — TEST FATURA GORUNUMU', 60, 780, 18],
  ['TEST BELGESIDIR - MALI DEGERI YOKTUR', 60, 740, 22],
  ['Fatura No: TEST-2026-0001 (uretim numaralandirmasi DEGILDIR)', 60, 700, 12],
  ['Siparis No: CS-TEST-E4-001', 60, 680, 12],
  ['Musteri: Test Fixture <test-fixture@cosmoskin.invalid>', 60, 660, 12],
  ['Tutar: 3.097,00 TL (KDV dahil) — ornek veri', 60, 640, 12],
  ['Bu belge yalnizca e-posta/uygulama gorunum testleri icindir.', 60, 600, 12],
  ['Resmi e-Fatura / e-Arsiv entegrasyonu KULLANILMAMISTIR.', 60, 580, 12]
];

const contentOps = [
  'BT',
  ...lines.flatMap(([text, x, y, size]) => [
    `/F1 ${size} Tf`,
    `1 0 0 1 ${x} ${y} Tm`,
    `(${text.replace(/[\\()]/g, (ch) => '\\' + ch)}) Tj`
  ]),
  'ET',
  // Diagonal grey watermark strokes behind the page frame
  '0.8 0.75 0.7 RG 2 w 40 40 m 555 800 l S',
  '0.8 0.75 0.7 RG 2 w 40 800 m 555 40 l S'
].join('\n');

const objects = [];
objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
objects[5] = `<< /Length ${contentOps.length} >>\nstream\n${contentOps}\nendstream`;

let pdf = '%PDF-1.4\n';
const offsets = [0];
for (let i = 1; i < objects.length; i++) {
  offsets[i] = pdf.length;
  pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
}
const xrefStart = pdf.length;
pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
for (let i = 1; i < objects.length; i++) {
  pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

const file = join(outDir, 'TEST-INVOICE-MALI-DEGERI-YOKTUR.pdf');
writeFileSync(file, pdf, 'latin1');
console.log(`written ${file} (${pdf.length} bytes)`);
