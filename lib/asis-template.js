// AS-IS Navigator: the BA's TO-BE Word template (.docx or .dotx), in the browser.
// describeTemplate() reads its structure (headings, the guidance under each, tables,
// cover/header/footer texts) for the server to plan the writing. fillTemplate() writes
// the generated content into the template, keeping its cover page, styles, headers,
// footers, section breaks and tables. Uses the browser's DOMParser and XMLSerializer.
import JSZip from 'jszip';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const isEl = (n) => n && n.nodeType === 1;
const isW = (n, name) => isEl(n) && n.namespaceURI === W_NS && (!name || n.localName === name);
const kids = (el, name) => Array.prototype.filter.call(el.childNodes, n => isW(n, name));
const all = (el, name) => Array.prototype.slice.call(el.getElementsByTagNameNS(W_NS, name));
const attr = (el, name) => (el ? el.getAttributeNS(W_NS, name) || el.getAttribute(`w:${name}`) || '' : '');
const closestP = (n) => { let x = n.parentNode; while (x && !isW(x, 'p')) x = x.parentNode; return x; };
const ownTexts = (p) => all(p, 't').filter(t => closestP(t) === p);
const paraText = (p) => ownTexts(p).map(t => t.textContent).join('');
const pPr = (p) => kids(p, 'pPr')[0] || null;
const hasSectPr = (p) => { const pp = pPr(p); return Boolean(pp && kids(pp, 'sectPr').length); };
const hasDrawing = (el) => all(el, 'drawing').length > 0 || el.getElementsByTagName('v:shape').length > 0 || all(el, 'object').length > 0;
const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml');

function parseStyles(xml) {
  const map = {};
  if (!xml) return map;
  for (const s of all(parse(xml), 'style')) {
    const pp = kids(s, 'pPr')[0];
    const ol = pp && kids(pp, 'outlineLvl')[0];
    const np = pp && kids(pp, 'numPr')[0];
    map[attr(s, 'styleId')] = {
      name: attr(kids(s, 'name')[0], 'val'), basedOn: attr(kids(s, 'basedOn')[0], 'val'),
      outline: ol ? parseInt(attr(ol, 'val'), 10) : null, numId: np ? attr(kids(np, 'numId')[0], 'val') : null,
    };
  }
  return map;
}
function styleProp(styles, id, prop, depth = 0) {
  const s = styles[id];
  if (!s || depth > 10) return null;
  if (s[prop] != null && s[prop] !== '') return s[prop];
  return s.basedOn ? styleProp(styles, s.basedOn, prop, depth + 1) : null;
}
function parseNumbering(xml) {
  const res = { num: {}, abs: {} };
  if (!xml) return res;
  const doc = parse(xml);
  for (const a of all(doc, 'abstractNum')) {
    const lv = {};
    for (const l of kids(a, 'lvl')) lv[attr(l, 'ilvl')] = attr(kids(l, 'numFmt')[0], 'val');
    res.abs[attr(a, 'abstractNumId')] = lv;
  }
  for (const n of all(doc, 'num')) res.num[attr(n, 'numId')] = attr(kids(n, 'abstractNumId')[0], 'val');
  return res;
}

function headingLevel(p, styles) {
  const pp = pPr(p);
  const sid = pp ? attr(kids(pp, 'pStyle')[0], 'val') : '';
  const name = ((sid && styles[sid]?.name) || '').toLowerCase();
  if (/^toc|^title|^subtitle|caption/.test(name) || /^toc/i.test(sid)) return 0;
  const direct = pp && kids(pp, 'outlineLvl')[0];
  const lvl = direct ? parseInt(attr(direct, 'val'), 10) : sid ? styleProp(styles, sid, 'outline') : null;
  if (lvl != null && lvl >= 0 && lvl < 9) return lvl + 1;
  const m = name.match(/^heading ([1-9])$/);
  return m ? parseInt(m[1], 10) : 0;
}
function listKind(p, styles, numbering) {
  const pp = pPr(p);
  if (!pp) return null;
  const np = kids(pp, 'numPr')[0];
  let numId = np ? attr(kids(np, 'numId')[0], 'val') : null;
  const ilvl = np ? attr(kids(np, 'ilvl')[0], 'val') || '0' : '0';
  if (!numId) { const sid = attr(kids(pp, 'pStyle')[0], 'val'); numId = sid ? styleProp(styles, sid, 'numId') : null; }
  if (!numId || numId === '0') return null;
  const abs = numbering.abs[numbering.num[numId]] || {};
  const fmt = abs[ilvl] || abs['0'] || '';
  return fmt === 'bullet' ? 'bullet' : fmt ? 'number' : null;
}

// Splits the template body into sections at its headings. Returns live DOM references.
async function analyze(zip) {
  const main = zip.file('word/document.xml');
  if (!main) throw new Error("it has no document body. Is it a Word file?");
  const stylesFile = zip.file('word/styles.xml');
  const numFile = zip.file('word/numbering.xml');
  const styles = parseStyles(stylesFile ? await stylesFile.async('string') : '');
  const numbering = parseNumbering(numFile ? await numFile.async('string') : '');
  const doc = parse(await main.async('string'));
  if (doc.getElementsByTagName('parsererror').length) throw new Error("its document.xml couldn't be read");
  const body = all(doc, 'body')[0];
  if (!body) throw new Error('it has no document body');
  const preamble = [];
  const sections = [];
  const tables = {};
  let cur = null;
  let sn = 0;
  let tn = 0;
  for (const el of kids(body)) {
    if (isW(el, 'sectPr')) continue;
    const lvl = isW(el, 'p') ? headingLevel(el, styles) : 0;
    if (lvl && paraText(el).trim()) {
      cur = { id: `S${++sn}`, level: lvl, heading: paraText(el).trim(), headingEl: el, content: [] };
      sections.push(cur);
      continue;
    }
    (cur ? cur.content : preamble).push(el);
  }
  const cellTexts = (tr) => kids(tr, 'tc').map(tc => kids(tc, 'p').map(paraText).join(' ').replace(/\s+/g, ' ').trim());
  const describeTable = (tbl, sectionId) => {
    const id = `T${++tn}`;
    const rows = kids(tbl, 'tr');
    tables[id] = { id, el: tbl, sectionId, columns: rows.length ? cellTexts(rows[0]) : [], examples: rows.slice(1, 3).map(cellTexts) };
    return id;
  };
  preamble.forEach(el => { if (isW(el, 'tbl')) describeTable(el, 'S0'); });
  for (const s of sections) {
    s.tableIds = s.content.filter(el => isW(el, 'tbl')).map(el => describeTable(el, s.id));
    s.guidance = s.content.filter(el => isW(el, 'p')).map(paraText).filter(t => t.trim()).join(' ').replace(/\s+/g, ' ').trim();
    s.hasImage = s.content.some(el => !isW(el, 'tbl') && hasDrawing(el));
  }
  // Short texts on the cover page, headers and footers that may need project-specific values.
  const fixedTexts = [];
  const addText = (t) => { t = (t || '').replace(/\s+/g, ' ').trim(); if (t && t.length <= 160 && !fixedTexts.includes(t)) fixedTexts.push(t); };
  for (const el of preamble) {
    const paras = (isW(el, 'p') ? [el] : isW(el, 'sdt') ? [] : all(el, 'p')).filter(p => {
      const pp = pPr(p);
      const sid = pp ? attr(kids(pp, 'pStyle')[0], 'val') : '';
      return !/^toc/i.test(sid) && !/^toc/i.test(styles[sid]?.name || '');
    });
    paras.forEach(p => addText(paraText(p)));
    all(el, 'txbxContent').forEach(tb => kids(tb, 'p').forEach(p => addText(paraText(p))));
  }
  const parts = {};
  for (const name of Object.keys(zip.files).filter(n => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    parts[name] = parse(await zip.file(name).async('string'));
    all(parts[name], 'p').forEach(p => addText(paraText(p)));
  }
  return { doc, body, styles, numbering, sections, tables, fixedTexts: fixedTexts.slice(0, 60), parts };
}

function outlineOf(an) {
  return {
    sections: an.sections.map(s => ({ id: s.id, level: s.level, heading: s.heading, guidance: s.guidance.slice(0, 420), hasImage: s.hasImage, tables: s.tableIds })),
    tables: Object.values(an.tables).map(t => ({ id: t.id, section: t.sectionId, columns: t.columns.map(c => c.slice(0, 60)), examples: t.examples.map(r => r.map(c => c.slice(0, 140))) })),
    fixedTexts: an.fixedTexts,
  };
}

// Reads a template File and returns its outline, or throws with a message for the BA.
export async function describeTemplate(file) {
  let an;
  try {
    an = await analyze(await JSZip.loadAsync(await file.arrayBuffer()));
  } catch (e) {
    throw new Error(`This file couldn't be read as a Word document (${e.message || 'unknown error'}).`);
  }
  if (!an.sections.length) throw new Error("No headings were found. Format the section titles with Word's Heading styles (Heading 1, Heading 2…) and upload the template again.");
  return outlineOf(an);
}

// ---- writing into the template ----

const mk = (doc, name) => doc.createElementNS(W_NS, `w:${name}`);
function setText(t, text) {
  t.textContent = text;
  if (/^\s|\s$/.test(text)) t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
}
function cleanRPr(rPr) {
  if (!rPr) return null;
  const c = rPr.cloneNode(true);
  for (const n of ['i', 'iCs', 'color', 'highlight', 'shd', 'vanish', 'u', 'strike', 'rStyle']) kids(c, n).forEach(x => c.removeChild(x));
  return c;
}
function protoFrom(p) {
  const pp = pPr(p);
  const ppc = pp ? pp.cloneNode(true) : null;
  if (ppc) { kids(ppc, 'sectPr').forEach(x => ppc.removeChild(x)); kids(ppc, 'rPr').forEach(x => ppc.removeChild(x)); }
  const r = kids(p, 'r').find(x => kids(x, 't').length);
  return { pPr: ppc, rPr: cleanRPr(r && kids(r, 'rPr')[0]) };
}
// Turns list numbering off for a paragraph prototype. numId 0 is Word's explicit "no
// numbering", which also overrides numbering that comes from the style.
function stripNum(proto) {
  if (!proto?.pPr) return proto;
  const c = proto.pPr.cloneNode(true);
  const np = kids(c, 'numPr')[0];
  if (!np) return { pPr: c, rPr: proto.rPr };
  while (np.firstChild) np.removeChild(np.firstChild);
  const d = np.ownerDocument;
  const il = d.createElementNS(W_NS, 'w:ilvl'); il.setAttributeNS(W_NS, 'w:val', '0');
  const ni = d.createElementNS(W_NS, 'w:numId'); ni.setAttributeNS(W_NS, 'w:val', '0');
  np.appendChild(il); np.appendChild(ni);
  return { pPr: c, rPr: proto.rPr };
}
function makeP(doc, proto, text) {
  const p = mk(doc, 'p');
  if (proto?.pPr) p.appendChild(proto.pPr.cloneNode(true));
  const r = mk(doc, 'r');
  if (proto?.rPr) r.appendChild(proto.rPr.cloneNode(true));
  const t = mk(doc, 't');
  setText(t, text);
  r.appendChild(t);
  p.appendChild(r);
  return p;
}

// Replaces text that may be split across several runs, keeping the first run's format.
function replaceInParagraph(p, find, repl) {
  const ts = ownTexts(p);
  if (!ts.length) return;
  let full = ts.map(t => t.textContent).join('');
  let idx = full.indexOf(find);
  while (idx >= 0) {
    const end = idx + find.length;
    let pos = 0; let startT = -1; let startOff = 0; let endT = -1; let endOff = 0;
    for (let i = 0; i < ts.length; i++) {
      const len = ts[i].textContent.length;
      if (startT < 0 && idx < pos + len) { startT = i; startOff = idx - pos; }
      if (endT < 0 && end <= pos + len) { endT = i; endOff = end - pos; break; }
      pos += len;
    }
    if (startT < 0 || endT < 0) break;
    const s0 = ts[startT].textContent;
    if (startT === endT) setText(ts[startT], s0.slice(0, startOff) + repl + s0.slice(endOff));
    else {
      setText(ts[startT], s0.slice(0, startOff) + repl);
      for (let k = startT + 1; k < endT; k++) setText(ts[k], '');
      setText(ts[endT], ts[endT].textContent.slice(endOff));
    }
    full = ts.map(t => t.textContent).join('');
    idx = full.indexOf(find, idx + repl.length);
  }
}
function setParaText(p, text) {
  const ts = ownTexts(p);
  if (!ts.length) return;
  setText(ts[0], text);
  for (let i = 1; i < ts.length; i++) setText(ts[i], '');
}
function setCellText(doc, tc, value) {
  const paras = kids(tc, 'p');
  const proto = paras.length ? protoFrom(paras[0]) : null;
  const bulletPara = paras.find(p => pPr(p) && kids(pPr(p), 'numPr').length);
  const bulletProto = bulletPara ? protoFrom(bulletPara) : null;
  paras.forEach(p => tc.removeChild(p));
  for (const line of String(value ?? '').split(/\n/)) {
    const m = line.match(/^\s*(?:[-•*]\s+)(.*)$/);
    if (m && bulletProto) tc.appendChild(makeP(doc, bulletProto, m[1]));
    else tc.appendChild(makeP(doc, proto ? stripNum(proto) : null, m && !bulletProto ? `• ${m[1]}` : line));
  }
  if (!kids(tc, 'p').length) tc.appendChild(mk(doc, 'p'));
}
// Keeps the header row(s), then writes one row per value list, styled like the template's first data row.
function fillTable(doc, tbl, rows) {
  const trs = kids(tbl, 'tr');
  if (!trs.length || (trs.length === 1 && !rows?.length)) return;
  let headerCount = 0;
  trs.forEach((tr, i) => { if (i === headerCount) { const tp = kids(tr, 'trPr')[0]; if (tp && kids(tp, 'tblHeader').length) headerCount++; } });
  headerCount = Math.max(1, headerCount);
  const proto = trs[headerCount] ? trs[headerCount].cloneNode(true) : (() => {
    const c = trs[0].cloneNode(true);
    kids(c, 'trPr').forEach(x => c.removeChild(x));
    all(c, 'shd').forEach(x => x.parentNode.removeChild(x));
    all(c, 'b').forEach(x => x.parentNode.removeChild(x));
    return c;
  })();
  kids(proto, 'tc').forEach(tc => { const tp = kids(tc, 'tcPr')[0]; if (tp) kids(tp, 'vMerge').forEach(x => tp.removeChild(x)); });
  trs.slice(headerCount).forEach(tr => tbl.removeChild(tr));
  for (let vals of rows?.length ? rows : [[]]) {
    const tr = proto.cloneNode(true);
    if (!Array.isArray(vals)) vals = [String(vals)];
    kids(tr, 'tc').forEach((tc, i) => setCellText(doc, tc, i < vals.length ? vals[i] : ''));
    tbl.appendChild(tr);
  }
}
function findProto(elements, test) {
  for (const el of elements) if (isW(el, 'p') && test(el)) return protoFrom(el);
  return null;
}

// Merges the per-batch results from the server into one.
export function mergeFillResults(results) {
  const out = { replacements: [], sections: [], coverTables: [] };
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    out.replacements.push(...(r.replacements || []));
    out.sections.push(...(r.sections || []));
    out.coverTables.push(...(r.coverTables || []));
  }
  return out;
}

// Writes `out` into the template (an ArrayBuffer) and returns the finished .docx Blob.
export async function fillTemplate(buffer, out) {
  const zip = await JSZip.loadAsync(buffer);
  const an = await analyze(zip);
  const { doc } = an;
  const everything = an.sections.flatMap(s => s.content);
  const isBody = (p) => paraText(p).trim() && !listKind(p, an.styles, an.numbering) && !hasDrawing(p);
  const isList = (kind) => (p) => listKind(p, an.styles, an.numbering) === kind;
  const globalBody = findProto(everything, isBody);
  const globalBullet = findProto(everything, isList('bullet'));
  const globalNum = findProto(everything, isList('number'));

  // 1. Text replacements in every paragraph, header and footer.
  const reps = (out.replacements || []).filter(r => r?.find && typeof r.replace === 'string' && r.find !== r.replace);
  const docs = [doc, ...Object.values(an.parts)];
  for (const r of reps) for (const d of docs) all(d, 'p').forEach(p => replaceInParagraph(p, r.find, r.replace));

  // 2. Cover-page tables.
  for (const t of out.coverTables || []) {
    const info = an.tables[t.id];
    if (info?.sectionId === 'S0' && Array.isArray(t.rows)) fillTable(doc, info.el, t.rows);
  }

  // 3. Sections.
  const byId = new Map((out.sections || []).filter(s => s?.id).map(s => [s.id, s]));
  for (const sec of an.sections) {
    const o = byId.get(sec.id);
    if (!o) continue;
    if (o.newHeading?.trim() && o.newHeading !== sec.heading) setParaText(sec.headingEl, o.newHeading.trim());
    for (const t of o.tables || []) {
      const info = an.tables[t.id];
      if (info?.sectionId === sec.id && Array.isArray(t.rows)) fillTable(doc, info.el, t.rows);
    }
    if (o.action !== 'replace') continue;
    const body = stripNum(findProto(sec.content, isBody) || globalBody);
    const bullet = findProto(sec.content, isList('bullet')) || globalBullet;
    const num = findProto(sec.content, isList('number')) || globalNum;
    for (const el of sec.content) {
      if (isW(el, 'p') && hasSectPr(el)) {
        // Keep the section break (e.g. a landscape page) but drop its old content.
        Array.prototype.slice.call(el.childNodes).forEach(n => { if (!isW(n, 'pPr')) el.removeChild(n); });
      } else if (isW(el, 'p')) el.parentNode.removeChild(el);
      else if (isW(el, 'sdt') && !/TOC/.test(el.textContent) && !all(el, 'instrText').some(x => /TOC/.test(x.textContent))) el.parentNode.removeChild(el);
    }
    let anchor = sec.headingEl;
    const insert = (node) => { anchor.parentNode.insertBefore(node, anchor.nextSibling); anchor = node; };
    for (const b of o.blocks || []) {
      if (b?.type === 'bullets' || b?.type === 'numbered') {
        const pr = b.type === 'bullets' ? bullet : num;
        (b.items || []).forEach((it, i) => insert(pr ? makeP(doc, pr, String(it)) : makeP(doc, body, `${b.type === 'bullets' ? '• ' : `${i + 1}. `}${it}`)));
      } else if (b) {
        String(b.text || '').split(/\n+/).forEach(line => { if (line.trim()) insert(makeP(doc, body, line)); });
      }
    }
  }

  // 4. Word needs a paragraph between two tables and after a final table.
  for (const el of kids(an.body)) {
    let next = el.nextSibling;
    while (next && !isEl(next)) next = next.nextSibling;
    if (isW(el, 'tbl') && (!next || isW(next, 'tbl') || isW(next, 'sectPr'))) an.body.insertBefore(mk(doc, 'p'), next || null);
  }

  const ser = new XMLSerializer();
  zip.file('word/document.xml', ser.serializeToString(doc));
  for (const [name, part] of Object.entries(an.parts)) zip.file(name, ser.serializeToString(part));

  // 5. Ask Word to refresh the table of contents when the file is opened.
  const settings = zip.file('word/settings.xml');
  if (settings) {
    const sd = parse(await settings.async('string'));
    const root = sd.documentElement;
    if (!kids(root, 'updateFields').length) {
      const after = ['hdrShapeDefaults', 'footnotePr', 'endnotePr', 'compat', 'docVars', 'rsids', 'mathPr', 'attachedSchema', 'themeFontLang', 'clrSchemeMapping', 'doNotIncludeSubdocsInStats', 'doNotAutoCompressPictures', 'forceUpgrade', 'captions', 'readModeInkLockDown', 'smartTagType', 'schemaLibrary', 'shapeDefaults', 'doNotEmbedSmartTags', 'decimalSymbol', 'listSeparator'];
      const uf = sd.createElementNS(W_NS, 'w:updateFields');
      uf.setAttributeNS(W_NS, 'w:val', 'true');
      root.insertBefore(uf, Array.prototype.find.call(root.childNodes, n => isEl(n) && after.includes(n.localName)) || null);
      zip.file('word/settings.xml', ser.serializeToString(sd));
    }
  }
  // 6. A .dotx template becomes a normal document.
  const ct = zip.file('[Content_Types].xml');
  if (ct) {
    const cts = await ct.async('string');
    if (cts.includes('wordprocessingml.template.main+xml')) zip.file('[Content_Types].xml', cts.replace('wordprocessingml.template.main+xml', 'wordprocessingml.document.main+xml'));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
