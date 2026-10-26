const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('Usage: node extract-docx.js <file.docx> [out.txt]');
  process.exit(1);
}

const docx = path.resolve(inputs[0]);
const out =
  inputs[1] ||
  path.join(path.dirname(docx), `_${path.basename(docx, '.docx')}_extract.txt`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
const zipPath = path.join(tmp, 'doc.zip');
fs.copyFileSync(docx, zipPath);

try {
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force`],
    { stdio: 'pipe' }
  );
} catch (e) {
  // fallback: use tar if available
  try {
    execFileSync('tar', ['-xf', zipPath, '-C', tmp], { stdio: 'pipe' });
  } catch (e2) {
    console.error('Failed to unzip docx', e.message || e);
    process.exit(1);
  }
}

const xmlPath = path.join(tmp, 'word', 'document.xml');
if (!fs.existsSync(xmlPath)) {
  console.error('No word/document.xml in', docx);
  process.exit(1);
}

const xml = fs.readFileSync(xmlPath, 'utf8');
const text = xml
  .replace(/<w:tab\/>/g, '\t')
  .replace(/<w:br\/>/g, '\n')
  .replace(/<\/w:p>/g, '\n')
  .replace(/<w:t[^>]*>/g, '')
  .replace(/<\/w:t>/g, '')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\n{3,}/g, '\n\n')
  .trim();

fs.writeFileSync(out, text, 'utf8');
console.log(`Wrote ${out} (${text.length} chars)`);
