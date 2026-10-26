/**
 * Builds docs/TaxMesh_API_Architecture_and_Developer_Guide.docx from the Markdown guide.
 * Optional: copies to Downloads if that path exists.
 */
const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} = require('docx');

const ROOT = path.join(__dirname, '..');
const MD = path.join(ROOT, 'docs', 'TaxMesh_API_Architecture_and_Developer_Guide.md');
const OUT = path.join(ROOT, 'docs', 'TaxMesh_API_Architecture_and_Developer_Guide.docx');
const DOWNLOADS = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'TaxMesh_API_Architecture_and_Developer_Guide.docx'
);

function thinBorders() {
  const b = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' };
  return { top: b, bottom: b, left: b, right: b };
}

function cell(text, opts = {}) {
  return new TableCell({
    borders: thinBorders(),
    width: { size: opts.width || 2000, type: WidthType.DXA },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(text ?? ''),
            bold: !!opts.bold,
            size: opts.bold ? 18 : 17,
            font: 'Calibri',
          }),
        ],
      }),
    ],
  });
}

function parseMd(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: 'code', lang, text: body.join('\n') });
      continue;
    }
    if (line.startsWith('|') && line.includes('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const raw = lines[i];
        if (!/^\|\s*-+/.test(raw)) {
          const cells = raw
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim().replace(/\*\*/g, ''));
          rows.push(cells);
        }
        i++;
      }
      if (rows.length) blocks.push({ type: 'table', rows });
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2).trim() });
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
      i++;
      continue;
    }
    if (line.trim() === '---') {
      i++;
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    // paragraph (may include inline **bold**)
    blocks.push({ type: 'p', text: line.trim() });
    i++;
  }
  return blocks;
}

function inlineRuns(text) {
  const runs = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      runs.push(new TextRun({ text: text.slice(last, m.index), size: 20, font: 'Calibri' }));
    }
    if (m[1]) {
      runs.push(new TextRun({ text: m[1], bold: true, size: 20, font: 'Calibri' }));
    } else if (m[2]) {
      runs.push(new TextRun({ text: m[2], font: 'Consolas', size: 18 }));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    runs.push(new TextRun({ text: text.slice(last), size: 20, font: 'Calibri' }));
  }
  if (!runs.length) runs.push(new TextRun({ text, size: 20, font: 'Calibri' }));
  return runs;
}

async function main() {
  const md = fs.readFileSync(MD, 'utf8');
  const blocks = parseMd(md);
  const children = [];

  for (const b of blocks) {
    if (b.type === 'h1') {
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: [new TextRun({ text: b.text, bold: true, size: 36, font: 'Calibri' })],
        })
      );
    } else if (b.type === 'h2') {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 120 },
          children: [new TextRun({ text: b.text, bold: true, size: 26, font: 'Calibri', color: '1F4E3D' })],
        })
      );
    } else if (b.type === 'h3') {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: b.text, bold: true, size: 22, font: 'Calibri' })],
        })
      );
    } else if (b.type === 'code') {
      for (const line of b.text.split('\n')) {
        children.push(
          new Paragraph({
            shading: { type: 'clear', fill: 'F3F4F6' },
            children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 16 })],
          })
        );
      }
      children.push(new Paragraph({ children: [] }));
    } else if (b.type === 'table') {
      const colCount = Math.max(...b.rows.map((r) => r.length));
      const colW = Math.floor(9000 / colCount);
      const tableRows = b.rows.map(
        (row, ri) =>
          new TableRow({
            children: Array.from({ length: colCount }, (_, ci) =>
              cell(row[ci] || '', { bold: ri === 0, width: colW })
            ),
          })
      );
      children.push(
        new Table({
          width: { size: 9000, type: WidthType.DXA },
          rows: tableRows,
        })
      );
      children.push(new Paragraph({ children: [] }));
    } else if (b.type === 'p') {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          alignment: AlignmentType.LEFT,
          children: inlineRuns(b.text),
        })
      );
    }
  }

  const doc = new Document({
    creator: 'TaxMesh',
    title: 'TaxMesh API Architecture & Developer Guide',
    description: 'Microservices · Contract Catalog · Filing Workflow · API Testing',
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT, buffer);
  console.log('Wrote', OUT);

  try {
    if (DOWNLOADS && fs.existsSync(path.dirname(DOWNLOADS))) {
      fs.copyFileSync(OUT, DOWNLOADS);
      console.log('Wrote', DOWNLOADS);
    }
  } catch (err) {
    console.warn('Could not copy to Downloads:', err.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
