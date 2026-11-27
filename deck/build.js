// SafeChange pitch deck: 9 slides, one message each, script in the speaker notes.
// Same look as the approved InfuSafe deck (Georgia + Arial, teal, dark green cover and close).
// Shapes named "aN|..." fade in, in order N (add_animations.py).
// Shapes the video effects use: slide 2 a1|card1..a3|card3, slide 4 a1|stat1..a3|stat3,
// slide 5 a1|hazard log .. a4|result, slide 6 a1|input .. a3|model .. a6|chip, slide 8 a1|stat_model, a2|stat_base.
// Run: PPTX_SKILL=<pptx skill folder> node build.js
const pptxgen = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa');
const { applyTheme } = require(path.join(process.env.PPTX_SKILL, 'scripts/apply_theme.js'));

const ROOT = path.join(__dirname, '..', '..');
const PHOTO = (f) => path.join(__dirname, 'assets', 'photos', f);
const img = (f) => 'image/jpeg;base64,' + fs.readFileSync(PHOTO(f)).toString('base64');
const DEMO = path.join(ROOT, 'presentation', 'assets', 'demo.png');
const SCRIPT = path.join(ROOT, 'presentation', 'SafeChange_script.md');
const OUT = path.join(ROOT, 'presentation', 'SafeChange_deck_with_notes.pptx');

const THEME = {
  name: 'SafeChange Clear',
  headFontFace: 'Georgia',
  bodyFontFace: 'Arial',
  colors: {
    dk1: '1B2430', lt1: 'FFFFFF', dk2: '0F4C47', lt2: 'F3F8F7',
    accent1: '0FA58F', accent2: 'F5A524', accent3: 'E5484D', accent4: '3D6FE0', accent5: '6B7A88', accent6: 'DDF2EE',
    hlink: '0FA58F', folHlink: '0F4C47',
  },
};
const X = THEME.colors;
const PALE_RED = 'FDE8E8';
const PALE_AMBER = 'FFF3DD';
const LINE = 'E3ECEA';

// Speaker notes: each "## Slide N." paragraph from the script, word for word.
function readNotes() {
  const md = fs.readFileSync(SCRIPT, 'utf8');
  const parts = md.split(/^## Slide (\d+)\..*$/m);
  const notes = {};
  for (let i = 1; i < parts.length; i += 2) notes[Number(parts[i])] = parts[i + 1].trim();
  return notes;
}

async function icon(Comp, color) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size: 256 }));
  return 'image/png;base64,' + (await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer()).toString('base64');
}

(async () => {
  const NOTES = readNotes();
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
  pres.title = 'SafeChange'; pres.author = 'Kushagra Chaudhary'; pres.subject = 'Atlassian Codegeist 2026, Apps for Specialized Industries';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  pres.defineSlideMaster({ title: 'COVER', background: { color: X.dk2 }, objects: [] });
  pres.defineSlideMaster({
    title: 'CONTENT', background: { color: X.lt1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 0.78, w: 11.9, h: 0.8, fontSize: 32, bold: true, color: C.text2, fontFace: 'Georgia', align: 'left', valign: 'top', margin: 0 }, text: '' } },
      { text: { text: 'SafeChange', options: { x: 0.7, y: 7.0, w: 4, h: 0.3, fontSize: 11, bold: true, color: C.accent1, margin: 0 } } },
    ],
    slideNumber: { x: 12.1, y: 7.0, w: 0.5, h: 0.3, fontSize: 11, color: X.accent5, align: 'right' },
  });

  const content = (sec, eyebrow, title) => {
    const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: sec });
    s.addText(eyebrow, { x: 0.7, y: 0.42, w: 8, h: 0.3, fontSize: 12, bold: true, color: C.accent1, charSpacing: 3, margin: 0, isTextBox: true, objectName: 'eyebrow' });
    s.addText(title, { placeholder: 'title' });
    return s;
  };
  const shadow = () => ({ type: 'outer', color: '1B2430', opacity: 0.14, blur: 14, offset: 4, angle: 90 });
  const rbox = (s, x, y, w, h, fill, name, o = {}) =>
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: o.r ?? 0.18, fill: { color: fill }, line: { color: o.line || fill, width: o.line ? 1 : 0, dashType: o.dash }, shadow: o.shadow ? shadow() : undefined, objectName: name });
  const text = (s, t, x, y, w, h, o, name) => s.addText(t, { x, y, w, h, margin: 0, isTextBox: true, objectName: name, ...o });
  const pill = (s, t, x, y, w, h, fill, color, name, size = 14) => {
    rbox(s, x, y, w, h, fill, name + ' bg', { r: h / 2 });
    text(s, t, x, y, w, h, { fontSize: size, bold: true, color, align: 'center', valign: 'middle' }, name);
  };
  const iconIn = async (s, Ic, color, x, y, d, name) =>
    s.addImage({ data: await icon(Ic, color), x, y, w: d, h: d, objectName: name, altText: name.split('|')[1] || name });
  const circleIcon = async (s, x, y, d, bg, Ic, name) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg, width: 0 }, objectName: name + ' circle' });
    await iconIn(s, Ic, 'FFFFFF', x + d * 0.26, y + d * 0.26, d * 0.48, name + ' icon');
  };
  const arrow = (s, x1, y1, x2, y2, name, color, dash) => s.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipV: y2 < y1,
    line: { color: color || X.accent5, width: 2.5, endArrowType: 'triangle', dashType: dash }, objectName: name,
  });
  const source = (s, t) => text(s, t, 0.7, 6.55, 11.9, 0.3, { fontSize: 10, color: C.accent5 }, 'source');

  // ============ 1. Cover ============
  pres.addSection({ title: 'Opening' });
  let s = pres.addSlide({ masterName: 'COVER', sectionTitle: 'Opening' });
  s.addImage({ data: img('cover_iv.jpg'), x: 6.9, y: 0, w: 6.433, h: 7.5, sizing: { type: 'cover', w: 6.433, h: 7.5 }, objectName: 'a1|photo IV line at a pump', altText: 'A hand checks an IV line above an infusion pump' });
  text(s, 'FOR MEDICAL DEVICE SOFTWARE TEAMS', 0.8, 1.25, 5.9, 0.35, { fontSize: 12, bold: true, color: C.accent2, charSpacing: 2 }, 'a1|eyebrow');
  text(s, 'SafeChange', 0.8, 1.8, 5.9, 1.2, { fontSize: 64, bold: true, color: C.background1, fontFace: 'Georgia' }, 'a1|title');
  text(s, 'No code change reaches a patient until its risks are checked.', 0.8, 3.15, 5.6, 1.3, { fontSize: 26, color: 'DDF2EE', fontFace: 'Georgia', italic: true, valign: 'top' }, 'a2|tagline');
  text(s, [
    { text: 'Kushagra Chaudhary', options: { bold: true, color: C.background1, fontSize: 15, breakLine: true } },
    { text: 'Atlassian Codegeist 2026', options: { color: 'A9D8CF', fontSize: 13, breakLine: true } },
    { text: 'Forge app with a Rovo agent  ·  Apps for Specialized Industries', options: { color: 'A9D8CF', fontSize: 13 } },
  ], 0.8, 5.4, 5.8, 1.1, { valign: 'top', paraSpaceAfter: 4 }, 'a3|event line');

  // ============ 2. The problem: three cards ============
  pres.addSection({ title: 'The problem' });
  s = content('The problem', 'THE PROBLEM', 'A small code change can hurt a patient');
  const CARD_W = 3.8, CARD_GAP = (11.9 - 3 * CARD_W) / 2, CARD_Y = 1.9, CARD_H = 4.45;
  const card = (k, photo, alt, head, line) => {
    const x = 0.7 + (k - 1) * (CARD_W + CARD_GAP);
    const n = `a${k}|card${k}`;
    rbox(s, x, CARD_Y, CARD_W, CARD_H, X.lt1, n, { line: LINE, shadow: true, r: 0.2 });
    s.addImage({ data: img(photo), x: x + 0.15, y: CARD_Y + 0.15, w: CARD_W - 0.3, h: 2.85, sizing: { type: 'cover', w: CARD_W - 0.3, h: 2.85 }, objectName: `${n} photo`, altText: alt });
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: CARD_Y + 3.3, w: 0.55, h: 0.55, fill: { color: X.accent3 }, line: { color: X.accent3, width: 0 }, objectName: `${n} number circle` });
    text(s, String(k), x + 0.25, CARD_Y + 3.3, 0.55, 0.55, { fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle' }, `${n} number`);
    text(s, head, x + 0.95, CARD_Y + 3.25, CARD_W - 1.1, 0.65, { fontSize: 20, bold: true, color: C.text2, fontFace: 'Georgia', valign: 'middle' }, `${n} title`);
    text(s, line, x + 0.25, CARD_Y + 3.95, CARD_W - 0.5, 0.4, { fontSize: 17, color: C.accent3, bold: true, valign: 'top' }, `${n} line`);
  };
  card(1, 'card_rate.jpg', 'IV bags above an infusion pump', 'Rate math changed', 'Overdose');
  card(2, 'card_alarm.jpg', 'A nurse checks a bedside monitor', 'Alarm changed', 'Warning too quiet to hear');
  card(3, 'card_sensor.jpg', 'An IV drip chamber and tubing', 'Sensor code changed', 'Air in the line missed');

  // ============ 3. The real case ============
  s = content('The problem', 'THE REAL CASE', 'One app update put 85,863 pump users at risk');
  rbox(s, 0.7, 1.9, 11.9, 0.75, PALE_RED, 'a1|real case strip', { r: 0.2 });
  text(s, [
    { text: 'It really happens:  ', options: { bold: true, color: C.accent3 } },
    { text: '2024, an insulin pump phone app, version 2.7', options: { color: C.text1 } },
  ], 1.0, 1.9, 11.4, 0.75, { fontSize: 18, valign: 'middle' }, 'a1|real case text');
  const fact = (k, x, w, big, color, cap) => {
    text(s, big, x, 3.0, w, 1.0, { fontSize: 54, bold: true, color, fontFace: 'Georgia', valign: 'bottom' }, `a${k}|fact ${big}`);
    text(s, cap, x, 4.05, w, 0.5, { fontSize: 17, color: C.accent5, valign: 'top' }, `a${k}|fact ${big} caption`);
  };
  fact(2, 0.7, 3.7, 'Class I', C.text2, 'the most serious kind of recall');
  fact(3, 4.8, 3.7, '85,863', C.accent3, 'users');
  fact(4, 8.9, 3.7, '224', C.accent3, 'reported injuries');
  rbox(s, 0.7, 4.95, 11.9, 1.2, PALE_AMBER, 'a5|root cause box', { r: 0.2 });
  await iconIn(s, fa.FaSearch, X.accent2, 1.05, 5.27, 0.55, 'a5|root cause icon');
  text(s, [
    { text: 'FDA root cause', options: { fontSize: 14, bold: true, color: C.accent5, breakLine: true } },
    { text: '\u201CSoftware Design Change\u201D', options: { fontSize: 26, bold: true, color: C.text2, fontFace: 'Georgia' } },
  ], 1.9, 4.95, 10.4, 1.2, { valign: 'middle' }, 'a5|root cause text');
  source(s, 'Source: FDA recall Z-1609-2024 (Tandem Diabetes Care t:connect app v2.7), FDA.gov, as of April 15, 2024');

  // ============ 4. The numbers ============
  s = content('The problem', 'THE NUMBERS', 'Most software recalls start with a change');
  const stat = (k, x, big, color, cap, from) => {
    rbox(s, x, 1.95, 3.8, 4.2, X.lt2, `a${k}|stat${k} card`, { r: 0.2 });
    s.addShape(pres.shapes.RECTANGLE, { x: x + 0.35, y: 2.3, w: 0.6, h: 0.08, fill: { color }, line: { color, width: 0 }, objectName: `a${k}|stat${k} mark` });
    text(s, big, x + 0.35, 2.55, 3.2, 1.15, { fontSize: 54, bold: true, color, fontFace: 'Georgia', valign: 'middle' }, `a${k}|stat${k}`);
    text(s, cap, x + 0.35, 3.85, 3.15, 1.3, { fontSize: 18, color: C.text1, valign: 'top' }, `a${k}|stat${k} caption`);
    text(s, from, x + 0.35, 5.45, 3.15, 0.4, { fontSize: 12, bold: true, color: C.accent5, valign: 'top' }, `a${k}|stat${k} from`);
  };
  stat(1, 0.7, '79%', X.accent3, 'of software recalls came from changes after release', 'FDA, 1992 to 1998');
  stat(2, 0.7 + 3.8 + 0.25, '4,329', X.accent1, 'device recall records with a software root cause', 'openFDA, all years');
  stat(3, 0.7 + 2 * (3.8 + 0.25), '1 in 9', X.accent3, 'recall events in 2024 and 2025 caused by software', 'openFDA, 223 of 1,919');
  source(s, 'Sources: FDA, General Principles of Software Validation (2002), section 2.4; openFDA device recall API, openFDA data updated 2026-11-21');

  // ============ 5. The gap ============
  s = content('The problem', 'THE GAP', 'A keyword checklist misses almost half');
  const panel = async (k, x, Ic, head, sub, name, rows) => {
    rbox(s, x, 1.85, 4.6, 2.85, X.lt2, `a${k}|${name}`, { r: 0.2, line: LINE });
    await circleIcon(s, x + 0.3, 2.1, 0.6, X.dk2, Ic, `a${k}|${name} icon`);
    text(s, [
      { text: head, options: { fontSize: 20, bold: true, color: C.text2, fontFace: 'Georgia', breakLine: true } },
      { text: sub, options: { fontSize: 13, color: C.accent5 } },
    ], x + 1.1, 2.05, 3.3, 0.75, { valign: 'middle' }, `a${k}|${name} title`);
    rows.forEach(([key, pillText], i) => {
      const y = 3.05 + i * 0.5;
      text(s, key, x + 0.3, y, 1.2, 0.36, { fontSize: 13, bold: true, color: C.text2, fontFace: 'Courier New', valign: 'middle' }, `a${k}|${name} row ${key}`);
      rbox(s, x + 1.55, y + 0.12, pillText ? 1.6 : 2.65, 0.12, 'D5DFDD', `a${k}|${name} row ${key} line`, { r: 0.06 });
      if (pillText) pill(s, pillText, x + 3.4, y + 0.02, 0.9, 0.32, PALE_RED, C.accent3, `a${k}|${name} row ${key} pill`, 11);
    });
  };
  await panel(1, 0.7, fa.FaBook, 'Hazard log', 'Confluence', 'hazard log', [['HAZ-1'], ['HAZ-2'], ['HAZ-3']]);
  await panel(2, 8.0, fa.FaTasks, 'Changes', 'Jira', 'changes', [['PUMP-120', 'Done'], ['PUMP-125', 'Done'], ['PUMP-105', 'Done']]);
  s.addShape(pres.shapes.LINE, { x: 5.3, y: 3.27, w: 0.95, h: 0, line: { color: X.accent5, width: 3, dashType: 'dash' }, objectName: 'a3|link left' });
  s.addShape(pres.shapes.LINE, { x: 7.05, y: 3.27, w: 0.95, h: 0, line: { color: X.accent5, width: 3, dashType: 'dash' }, objectName: 'a3|link right' });
  await circleIcon(s, 6.3, 2.92, 0.7, X.accent3, fa.FaUnlink, 'a3|link break');
  text(s, 'only a keyword checklist', 5.35, 3.7, 2.6, 0.35, { fontSize: 13, bold: true, color: C.accent3, align: 'center' }, 'a3|link break label');
  rbox(s, 0.7, 4.95, 11.9, 1.25, PALE_RED, 'a4|result strip', { r: 0.2 });
  text(s, '56%', 1.0, 4.95, 1.9, 1.25, { fontSize: 54, bold: true, color: C.accent3, fontFace: 'Georgia', valign: 'middle' }, 'a4|result');
  text(s, 'of hazards caught by a keyword checklist', 2.95, 4.95, 9.4, 1.25, { fontSize: 22, bold: true, color: C.accent3, valign: 'middle' }, 'a4|result caption');
  text(s, '309 FDA software recalls, 2024 to 2026', 0.7, 6.35, 11.9, 0.35, { fontSize: 13, color: C.accent5 }, 'a5|test set');

  // ============ 6. The solution ============
  pres.addSection({ title: 'The solution' });
  s = content('The solution', 'THE SOLUTION', 'SafeChange connects the hazard log to every change');
  const inBox = async (k, y, Ic, head, sub, name) => {
    rbox(s, 0.7, y, 3.15, 1.3, X.lt2, `a${k}|input ${name}`, { r: 0.18, line: LINE });
    await iconIn(s, Ic, X.dk2, 0.95, y + 0.4, 0.5, `a${k}|input ${name} icon`);
    text(s, [
      { text: head, options: { fontSize: 17, bold: true, color: C.text2, breakLine: true } },
      { text: sub, options: { fontSize: 13, color: C.accent5 } },
    ], 1.65, y, 2.1, 1.3, { valign: 'middle' }, `a${k}|input ${name} text`);
  };
  await inBox(1, 2.0, fa.FaTasks, 'Jira change', 'components, files, words', 'jira change');
  await inBox(1, 3.85, fa.FaBook, 'Hazard log', 'Confluence', 'hazard log');
  arrow(s, 3.85, 2.65, 4.7, 2.65, 'a2|arrow jira change');
  arrow(s, 3.85, 4.5, 4.7, 4.5, 'a2|arrow hazard log');
  rbox(s, 4.7, 1.85, 4.1, 3.8, X.dk2, 'a3|safechange box', { r: 0.2, shadow: true });
  text(s, 'SafeChange', 5.0, 1.95, 3.5, 0.55, { fontSize: 24, bold: true, color: C.background1, fontFace: 'Georgia', valign: 'middle' }, 'a3|safechange title');
  rbox(s, 4.88, 2.55, 3.74, 0.5, '1D6A62', 'a3|model bg', { r: 0.25 });
  await iconIn(s, fa.FaBrain, 'FFFFFF', 5.03, 2.65, 0.3, 'a3|model icon');
  text(s, 'Model trained on 700 FDA recalls', 5.45, 2.55, 3.15, 0.5, { fontSize: 13, bold: true, color: C.background1, valign: 'middle' }, 'a3|model');
  const checks = ['Finds touched hazards', 'Needs a signed review', 'Needs a passed test', 'Review goes stale on edit'];
  for (let i = 0; i < checks.length; i++) {
    const y = 3.2 + i * 0.58;
    await iconIn(s, i === 3 ? fa.FaHistory : fa.FaCheckCircle, i === 3 ? X.accent2 : '5FD3BE', 5.0, y + 0.07, 0.34, `a3|safechange check ${i + 1} icon`);
    text(s, checks[i], 5.5, y, 3.2, 0.48, { fontSize: 16, color: C.background1, valign: 'middle' }, `a3|safechange check ${i + 1}`);
  }
  arrow(s, 8.8, 2.9, 9.6, 2.65, 'a4|arrow held', X.accent3);
  pill(s, 'Held at Done', 9.6, 2.25, 3.0, 0.8, X.accent3, C.background1, 'a4|pill held', 18);
  text(s, 'until review and test are in', 9.6, 3.1, 3.0, 0.4, { fontSize: 13, color: C.accent5, align: 'center' }, 'a4|pill held caption');
  arrow(s, 8.8, 4.4, 9.6, 4.65, 'a5|arrow cleared', X.accent1);
  pill(s, 'Cleared', 9.6, 4.25, 3.0, 0.8, X.accent1, C.background1, 'a5|pill cleared', 18);
  text(s, 'review signed, test passed', 9.6, 5.1, 3.0, 0.4, { fontSize: 13, color: C.accent5, align: 'center' }, 'a5|pill cleared caption');
  const chip = async (x, Ic, t, name) => {
    rbox(s, x, 5.95, 1.95, 0.5, X.accent6, `a6|chip ${name}`, { r: 0.25 });
    await iconIn(s, Ic, X.dk2, x + 0.2, 6.05, 0.3, `a6|chip ${name} icon`);
    text(s, t, x + 0.55, 5.95, 1.35, 0.5, { fontSize: 13, bold: true, color: C.text2, valign: 'middle' }, `a6|chip ${name} text`);
  };
  s.addShape(pres.shapes.LINE, { x: 6.75, y: 5.65, w: 0, h: 0.3, line: { color: X.accent5, width: 1.5, dashType: 'dash' }, objectName: 'a6|chip link' });
  await chip(4.7, fa.FaRobot, 'Rovo agent', 'rovo agent');
  await chip(6.85, fa.FaFileMedical, 'FDA recalls', 'fda recalls');

  // ============ 7. Live demo ============
  s = content('The solution', 'LIVE DEMO', 'Live on Forge');
  const SX = 0.7, SY = 1.85, SW = 7.6, SH = 4.275;
  if (fs.existsSync(DEMO)) {
    const meta = await sharp(DEMO).metadata();
    const r = Math.min(SW / meta.width, SH / meta.height);
    const w = meta.width * r, h = meta.height * r;
    const x = SX + (SW - w) / 2, y = SY + (SH - h) / 2;
    // rounded corners: mask the screenshot with a rounded rectangle, then draw a thin frame on top
    const rad = Math.round(0.16 / r);
    const mask = Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><rect width="${meta.width}" height="${meta.height}" rx="${rad}" ry="${rad}"/></svg>`);
    const rounded = await sharp(DEMO).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    s.addImage({ data: 'image/png;base64,' + rounded.toString('base64'), x, y, w, h, objectName: 'a1|demo screen', altText: 'SafeChange running on Forge' });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.16, fill: { color: X.lt1, transparency: 100 }, line: { color: 'C9D6D3', width: 1 }, objectName: 'a1|demo screen frame' });
  } else {
    rbox(s, SX, SY, SW, SH, 'EEF2F1', 'a1|demo screen', { r: 0.2, line: 'D5DFDD' });
    await circleIcon(s, SX + SW / 2 - 0.45, SY + SH / 2 - 0.75, 0.9, X.accent5, fa.FaPlay, 'a1|demo screen play');
    text(s, 'Demo recording', SX, SY + SH / 2 + 0.3, SW, 0.5, { fontSize: 18, bold: true, color: C.accent5, align: 'center' }, 'a1|demo screen label');
  }
  const steps = ['Finds the hazard', 'Blocks Done', 'Signed review + passed test', 'Edited after review: comment right away'];
  for (let i = 0; i < steps.length; i++) {
    const y = 2.0 + i * 0.78;
    const k = 2 + i;
    await circleIcon(s, 8.75, y, 0.48, i === 1 ? X.accent3 : i === 3 ? X.accent2 : X.accent1, [fa.FaSearch, fa.FaBan, fa.FaCheck, fa.FaHistory][i], `a${k}|demo step ${i + 1}`);
    text(s, steps[i], 9.4, y - 0.06, 3.25, 0.6, { fontSize: 17, color: C.text1, valign: 'middle' }, `a${k}|demo step ${i + 1} text`);
  }
  pill(s, 'Real Forge app, not a mockup', 8.75, 5.45, 3.85, 0.5, X.accent6, C.text2, 'a6|real tag', 14);

  // ============ 8. Results ============
  pres.addSection({ title: 'Proof' });
  s = content('Proof', 'RESULTS', '83% of hazards caught on recalls it never saw');
  text(s, '83%', 0.7, 1.95, 4.4, 1.3, { fontSize: 72, bold: true, color: C.accent1, fontFace: 'Georgia', valign: 'middle' }, 'a1|stat_model');
  text(s, 'SafeChange model', 0.7, 3.25, 4.4, 0.45, { fontSize: 19, bold: true, color: C.text1, valign: 'top' }, 'a1|stat_model caption');
  text(s, '56%', 0.7, 3.95, 4.4, 0.85, { fontSize: 40, bold: true, color: C.accent5, fontFace: 'Georgia', valign: 'middle' }, 'a2|stat_base');
  text(s, 'keyword checklist', 0.7, 4.8, 4.4, 0.4, { fontSize: 16, color: C.accent5, valign: 'top' }, 'a2|stat_base caption');
  const BX = 5.9, BW = 6.7, TRACK = BW - 1.5;
  const bar = (k, y, label, pct, color, name) => {
    text(s, label, BX, y, BW, 0.4, { fontSize: 16, bold: true, color: C.text1, valign: 'bottom' }, `a${k}|bar ${name} label`);
    rbox(s, BX, y + 0.5, TRACK, 0.5, 'E6EEEC', `a${k}|bar ${name} track`, { r: 0.18 });
    rbox(s, BX, y + 0.5, TRACK * pct / 100, 0.5, color, `a${k}|bar ${name} fill`, { r: 0.18 });
    text(s, pct.toFixed(1) + '%', BX + BW - 1.35, y + 0.42, 1.35, 0.66, { fontSize: 22, bold: true, color, fontFace: 'Georgia', valign: 'middle', align: 'right' }, `a${k}|bar ${name} value`);
  };
  bar(3, 1.95, 'Model', 82.6, X.accent1, 'model');
  bar(4, 3.05, 'Keyword checklist', 55.5, X.accent5, 'keywords');
  bar(5, 4.15, 'Model + keywords', 89.5, X.dk2, 'model plus keywords');
  pill(s, 'Plan locked in git before training', BX, 5.4, 4.3, 0.46, X.accent6, C.text2, 'a6|plan locked', 14);
  text(s, '309 FDA software recalls from 2024 to 2026, unseen in training. Model precision 39% vs 59%; it loses on security. 396 tests and CI check every number.', 0.7, 6.1, 11.9, 0.55, { fontSize: 12, color: C.accent5, valign: 'top' }, 'a7|method');

  // ============ 9. Close ============
  pres.addSection({ title: 'Closing' });
  s = pres.addSlide({ masterName: 'COVER', sectionTitle: 'Closing' });
  s.addImage({ data: img('close_dev.jpg'), x: 6.9, y: 0, w: 6.433, h: 7.5, sizing: { type: 'cover', w: 6.433, h: 7.5 }, objectName: 'a1|photo developer at a laptop', altText: 'A developer works on a laptop' });
  text(s, 'WHAT COMES NEXT', 0.8, 0.95, 5.8, 0.35, { fontSize: 13, bold: true, color: C.accent2, charSpacing: 3 }, 'a1|next eyebrow');
  text(s, [
    { text: 'Read changed files from Bitbucket pull requests', options: { bullet: { indent: 20 }, breakLine: true } },
    { text: 'Publish on the Atlassian Marketplace', options: { bullet: { indent: 20 } } },
  ], 0.8, 1.45, 5.7, 1.5, { fontSize: 18, color: C.background1, paraSpaceAfter: 10, valign: 'top' }, 'a2|next list');
  text(s, 'So a small change never becomes a big recall.', 0.8, 3.35, 5.7, 1.7, { fontSize: 36, bold: true, color: C.background1, fontFace: 'Georgia', valign: 'top' }, 'a3|closing line');
  text(s, 'Thank you', 0.8, 5.2, 5.7, 0.5, { fontSize: 20, italic: true, color: 'DDF2EE', fontFace: 'Georgia' }, 'a3|thanks');
  text(s, 'github.com/KushagraRishi/safechange-forge', 0.8, 6.15, 5.8, 0.4, { fontSize: 16, color: C.accent2, hyperlink: { url: 'https://github.com/KushagraRishi/safechange-forge' } }, 'a3|repo');

  if (pres._slides.length !== 9) throw new Error('expected 9 slides, got ' + pres._slides.length);
  pres._slides.forEach((sl, i) => {
    if (!NOTES[i + 1]) throw new Error('no script paragraph for slide ' + (i + 1));
    sl.addNotes(NOTES[i + 1]);
  });
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('wrote', OUT, fs.existsSync(DEMO) ? '(with demo.png)' : '(demo placeholder: add presentation/assets/demo.png and rebuild)');
})();
