// The TO-BE Process Design as a Word document in the standard layout: summary,
// confidence, the process with what each step depends on, traceability of every pain
// point and gap, what to validate with the customer, and sign-off.
// (A BA's own Word template is filled in the browser instead; see lib/asis-template.js.)
import * as D from 'docx';

import { CHANGE_LABEL, DIRECTION_LABEL, KIND_LABEL, TRACE_LABEL, flagLabel } from '@/lib/asis-design';

const FONT = 'Arial';
const BLUE = '1E3668';
const INK = '0A1628';
const MUTED = '5A7399';
const W = 9638; // A4 width minus 2 cm margins, in DXA

const border = { style: D.BorderStyle.SINGLE, size: 4, color: 'C9D6EA' };
const borders = { top: border, bottom: border, left: border, right: border };
const run = (text, o = {}) => new D.TextRun({ text: String(text ?? ''), font: FONT, ...o });
const para = (children, o = {}) => new D.Paragraph({ children: Array.isArray(children) ? children : [run(children)], spacing: { after: 120 }, ...o });
const bullet = (children) => new D.Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: Array.isArray(children) ? children : [run(children)], spacing: { after: 60 } });
const h1 = (t) => new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: [run(t)], spacing: { before: 320, after: 140 } });
const small = (t, o = {}) => para([run(t, { size: 18, ...o })], { spacing: { after: 40 } });
const cell = (children, width, o = {}) => new D.TableCell({
  width: { size: width, type: D.WidthType.DXA }, borders,
  shading: o.fill ? { fill: o.fill, type: D.ShadingType.CLEAR, color: 'auto' } : undefined,
  margins: { top: 80, bottom: 80, left: 100, right: 100 },
  children: (Array.isArray(children) ? children : [children]).map(c => (c instanceof D.Paragraph ? c : para([run(c, { size: 18 })], { spacing: { after: 0 } }))),
});
const headRow = (labels, widths) => new D.TableRow({
  tableHeader: true,
  children: labels.map((l, i) => cell(para([run(l, { bold: true, color: 'FFFFFF', size: 18 })], { spacing: { after: 0 } }), widths[i], { fill: BLUE })),
});
const table = (widths, rows) => new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: widths, rows });
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };

export function designDocument(p, m) {
  const body = [];
  body.push(para([run('HARRIS COMPUTER · SYSCON JUSTICE SYSTEM', { size: 16, bold: true, color: MUTED, characterSpacing: 40 })], { spacing: { after: 80 } }));
  body.push(new D.Paragraph({ heading: D.HeadingLevel.TITLE, children: [run('TO-BE Process Design')], spacing: { after: 80 } }));
  body.push(para([run(p.name, { size: 28, bold: true, color: BLUE })], { spacing: { after: 200 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 12, color: BLUE, space: 8 } } }));

  const mw = [2400, W - 2400];
  body.push(table(mw, [
    ['Module / process', p.module || '—'],
    ['Built on AS-IS knowledge base', m.d.basedOnKb + (m.stale ? ` (the knowledge base is now v${p.version})` : '')],
    ['Design generated', fmtDate(m.d.generatedAt)],
    ['Document prepared', fmtDate(new Date().toISOString())],
    ['Status', m.d.demo ? 'Demo script sample, not a real analysis' : 'Draft for customer validation'],
  ].map(r => new D.TableRow({ children: [cell(para([run(r[0], { bold: true, size: 18, color: MUTED })], { spacing: { after: 0 } }), mw[0], { fill: 'F0F5FB' }), cell(r[1], mw[1])] }))));

  body.push(h1('1. Summary'));
  body.push(para(m.d.summary || '—'));
  if (m.d.principles?.length) {
    body.push(para([run('Design principles', { bold: true })], { spacing: { before: 120, after: 60 } }));
    m.d.principles.forEach(x => body.push(bullet(x)));
  }
  if (m.d.direction) {
    body.push(para([run('Design direction given: ', { bold: true }), run(m.d.direction, { italics: true })], { spacing: { before: 120 } }));
    for (const x of m.d.directionApplied || []) {
      const color = x.status === 'APPLIED' ? '15803D' : x.status === 'PARTIAL' ? 'B45309' : 'B91C1C';
      body.push(bullet([run(`${x.instruction} — `, { bold: true }), run(DIRECTION_LABEL[x.status] || x.status, { color, bold: true }), run(x.how ? `: ${x.how}` : '')]));
    }
  }

  body.push(h1('2. Confidence'));
  body.push(para(m.flaggedSteps
    ? `${m.flaggedSteps} of ${m.steps.length} TO-BE steps depend on information that is not confirmed yet. They are marked ⚑ below, and section 5 lists what to validate with the customer.`
    : 'Every TO-BE step is based on confirmed information or on AS-IS context.'));
  body.push(para(`Coverage of AS-IS pain points and gaps: ${m.coverage.addressed} addressed, ${m.coverage.partial} partly addressed, ${m.coverage.none} not addressed (of ${m.coverage.total}).`));

  body.push(h1('3. TO-BE process'));
  const pw = [560, 3600, 1900, 1240, W - 560 - 3600 - 1900 - 1240];
  body.push(table(pw, [headRow(['#', 'Step', 'Actor / system', 'Change', 'Depends on'], pw), ...m.steps.map(s => {
    const fill = s.flags.length ? 'FFF7E6' : undefined;
    const stepParas = [para([run(s.name, { bold: true, size: 18 })], { spacing: { after: 40 } })];
    if (s.description) stepParas.push(small(s.description));
    if (s.replaces?.length) stepParas.push(small(`Replaces AS-IS: ${s.replaces.map(r => r.text).join('; ')}`, { color: MUTED, italics: true }));
    const dep = s.refs.length ? s.refs.map(r => {
      const flag = r.live.level === 'unconfirmed' || r.live.level === 'invalid';
      return small(`${flag ? '⚑ ' : ''}${KIND_LABEL[r.kind] || ''}${r.live.status ? ` (${r.live.level === 'invalid' ? 'no longer valid' : r.live.status})` : ''}: ${r.text}`, flag ? { color: '92400E' } : {});
    }) : [small('—')];
    return new D.TableRow({
      cantSplit: true,
      children: [
        cell(para([run(`${s.flags.length ? '⚑ ' : ''}${s.n}`, { bold: true, size: 18 })], { spacing: { after: 0 } }), pw[0], { fill }),
        cell(stepParas, pw[1], { fill }),
        cell([small(s.actor || '—', { bold: true }), small(s.system || '')], pw[2], { fill }),
        cell(CHANGE_LABEL[s.change] || s.change, pw[3], { fill }),
        cell(dep, pw[4], { fill }),
      ],
    });
  })]));

  body.push(h1('4. Traceability: AS-IS pain points and gaps'));
  const tw = [2900, 1000, 3438, 900, 1400];
  const stFill = { ADDRESSED: 'E7F7EE', PARTIAL: 'FFF7E6', NOT_ADDRESSED: 'FDECEC' };
  body.push(table(tw, [headRow(['AS-IS item', 'Type', 'How the TO-BE addresses it', 'Steps', 'Status'], tw), ...m.trace.map(t => new D.TableRow({
    cantSplit: true,
    children: [
      cell([small(t.text, { bold: true }), ...(t.detail ? [small(t.detail, { color: MUTED })] : [])], tw[0]),
      cell(`${t.kind === 'gap' ? 'Gap' : 'Pain point'}${t.priority ? ` · ${t.priority}` : ''}`, tw[1]),
      cell(t.resolution || '—', tw[2]),
      cell(t.stepNums.length ? t.stepNums.join(', ') : '—', tw[3]),
      cell(TRACE_LABEL[t.status] || t.status, tw[4], { fill: stFill[t.status] }),
    ],
  }))]));

  body.push(h1('5. To validate with the customer'));
  if (!m.validation.length && !m.assumptions.length) body.push(para('Nothing outstanding: the design rests on confirmed information.'));
  if (m.validation.length) {
    body.push(para('These items are not confirmed in the AS-IS knowledge base, but the design depends on them.'));
    const vw = [4300, 1300, 1600, W - 4300 - 1300 - 1600];
    body.push(table(vw, [headRow(['Item', 'Type', 'Current status', 'TO-BE steps affected'], vw), ...m.validation.map(v => new D.TableRow({
      cantSplit: true,
      children: [
        cell(v.text, vw[0]), cell(KIND_LABEL[v.kind] || v.kind, vw[1]),
        cell(v.live.level === 'invalid' ? (v.live.status === 'MISSING' ? 'Removed from KB' : 'Superseded') : v.live.status, vw[2], { fill: v.live.level === 'invalid' ? 'FDECEC' : 'FFF7E6' }),
        cell(`${v.steps.length ? v.steps.join(', ') : '—'}${v.assumptions ? ` · ${v.assumptions} assumption${v.assumptions > 1 ? 's' : ''}` : ''}`, vw[3]),
      ],
    }))]));
  }
  if (m.assumptions.length) {
    body.push(para([run('Design assumptions', { bold: true })], { spacing: { before: 200, after: 60 } }));
    for (const a of m.assumptions) {
      body.push(bullet([run(a.text), ...(a.flags.length ? [run(`  (relies on ${a.flags.map(r => `${flagLabel(r)}: ${r.text}`).join('; ')})`, { color: '92400E', size: 18 })] : [])]));
    }
  }

  body.push(h1('6. Sign-off'));
  const sw = [3212, 3213, 3213];
  body.push(table(sw, [headRow(['Prepared by', 'Reviewed by', 'Approved by (customer)'], sw),
    new D.TableRow({ height: { value: 900, rule: D.HeightRule.ATLEAST }, children: sw.map(w => cell([small('Name:'), small('Date:')], w)) })]));

  return new D.Document({
    creator: 'AS-IS Navigator', title: `TO-BE Process Design — ${p.name}`,
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: INK } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 44, bold: true, color: INK } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: BLUE }, paragraph: { outlineLevel: 0 } },
      ],
    },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: {
        default: new D.Footer({
          children: [new D.Paragraph({
            alignment: D.AlignmentType.RIGHT,
            children: [run(`TO-BE Process Design · ${p.name} · page `, { size: 16, color: MUTED }), new D.TextRun({ children: [D.PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })],
          })],
        }),
      },
      children: body,
    }],
  });
}

export const designDocx = (p, m) => D.Packer.toBuffer(designDocument(p, m));
