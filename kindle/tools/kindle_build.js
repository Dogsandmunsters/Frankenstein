// Build the Kindle working manuscript: flags -> keyword placeholders, Empathy/Alienation -> reader tallies,
// Trust -> unrolled page copies (page classes from classmap_trust.json).
const fs = require('fs');
const G = require('./common.js')(process.argv[2]);
const classmap = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const OUT = process.argv[4];
const { html, sections, blocks, varIdx, partFirst, get2, partOf, resolve } = G;
const TALLY = { victor_empathy: 'Empathy', alienation: 'Alienation' };
const TRUST = 'trust_you';
const KW = n => 'KW_' + n;
const base36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; const snum = s => base36.indexOf(s[3]) * 36 + base36.indexOf(s[4]);
const chapterImages = { '01_01': 'pic1_1.jpg', '01_16': 'pic1_2.jpg', '01_1U': 'pic1_3.jpg', '01_3G': 'pic2_1.jpg', '01_5U': 'pic2_2.jpg', '01_78': 'pic2_3.jpg', '01_9N': 'pic3_1.jpg', '01_C7': 'pic3_2.jpg', '01_D3': 'pic3_3.jpg', '01_FM': 'pic4_1.jpg', '01_I8': 'pic4_2.jpg', '01_JU': 'pic4_3.jpg', '01_LP': 'pic5_1.jpg', '01_MW': 'pic5_2.jpg', '01_PQ': 'pic5_3.jpg', '01_QQ': 'pic6_1.jpg', '01_S3': 'pic6_2.jpg', '01_TA': 'pic6_3.jpg' };

// ---------- 1. Parser for the game-logic subset ----------
function tokenize(src) {
  src = src.replace(/\/\/[^\n]*/g, ' ');
  const toks = []; const re = /\s*(==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|[A-Za-z_][A-Za-z_0-9]*|-?\d+|"[^"]*"|[()\[\]{};!=<>])/y;
  let i = 0; while (i < src.length) { re.lastIndex = i; const m = re.exec(src); if (!m) { if (/^\s*$/.test(src.slice(i))) break; throw new Error('tok at ' + src.slice(i, i + 30)); } toks.push(m[1]); i = re.lastIndex; }
  return toks;
}
function parse(src) {
  const t = tokenize(src); let p = 0;
  const peek = () => t[p], next = () => t[p++], expect = x => { const v = next(); if (v !== x) throw new Error(`expected ${x} got ${v} near ${t.slice(p - 3, p + 3).join(' ')}`); };
  function stmts(end) { const out = []; while (p < t.length && peek() !== end) { const s = stmt(); if (s) out.push(s); } return out; }
  function stmt() {
    const k = peek();
    if (k === ';') { next(); return null; }
    if (k === '{') { next(); const b = stmts('}'); expect('}'); return { k: 'block', b }; }
    if (k === 'if') { next(); expect('('); const c = expr(); expect(')'); const th = stmt(); let el = null; if (peek() === 'else') { next(); el = stmt(); } return { k: 'if', c, th, el }; }
    if (k === 'vars') { next(); expect('['); const v = next(); expect(']'); const op = next(); let n = null; if (op === '=' || op === '+=' || op === '-=') n = +next(); if (peek() === ';') next(); return { k: 'var', v, op, n }; }
    if (k === 'auto' || k === 'temp') { next(); expect('='); const n = +next(); if (peek() === ';') next(); return { k, n }; }
    if (k === 'hidepiece') { next(); expect('('); const id = next().slice(1, -1); expect(')'); if (peek() === ';') next(); return { k: 'hide', id }; }
    throw new Error('stmt at ' + t.slice(p, p + 6).join(' '));
  }
  function expr() { let a = andE(); while (peek() === '||') { next(); a = { t: 'or', a: [a, andE()] }; } return a; }
  function andE() { let a = notE(); while (peek() === '&&') { next(); a = { t: 'and', a: [a, notE()] }; } return a; }
  function notE() { if (peek() === '!') { next(); return { t: 'not', e: notE() }; } if (peek() === '(') { next(); const e = expr(); expect(')'); return e; } return atom(); }
  function atom() { let v; if (peek() === 'vars') { next(); expect('['); v = next(); expect(']'); } else if (peek() === 'temp') { next(); v = 'temp'; } else throw new Error('atom at ' + t.slice(p, p + 5).join(' ')); const op = next(); const n = +next(); return { t: 'cmp', v, op, n }; }
  return stmts('}');
}
const parsed = {}; for (const id in blocks) parsed[id] = parse(blocks[id]);

// ---------- 2. Symbolic boolean expressions ----------
const T = { t: 'const', v: true }, F = { t: 'const', v: false };
const isC = (e, v) => e.t === 'const' && e.v === v;
function dedupe(a) { const seen = new Set(); return a.filter(x => { const k = keyOf(x); if (seen.has(k)) return false; seen.add(k); return true; }); }
function AND(...xs) { let a = []; for (const x of xs) { if (isC(x, false)) return F; if (isC(x, true)) continue; if (x.t === 'and') a.push(...x.a); else a.push(x); } a = dedupe(a); if (!a.length) return T; if (a.length === 1) return a[0]; return { t: 'and', a }; }
function OR(...xs) { let a = []; for (const x of xs) { if (isC(x, true)) return T; if (isC(x, false)) continue; if (x.t === 'or') a.push(...x.a); else a.push(x); } a = dedupe(a); if (!a.length) return F; if (a.length === 1) return a[0]; return { t: 'or', a }; }
function NOT(x) { if (x.t === 'const') return x.v ? F : T; if (x.t === 'not') return x.e; if (x.t === 'cmp') { const inv = { '==': '!=', '!=': '==', '<': '>=', '>=': '<', '>': '<=', '<=': '>' }; return { t: 'cmp', v: x.v, op: inv[x.op], n: x.n }; } if (x.t === 'and') return OR(...x.a.map(NOT)); if (x.t === 'or') return AND(...x.a.map(NOT)); return { t: 'not', e: x }; }
const cmpv = (a, op, n) => ({ '==': a === n, '!=': a !== n, '<': a < n, '<=': a <= n, '>': a > n, '>=': a >= n })[op];
function evalE(e, env) { // env: {known: {var: int}, temp: Expr}
  switch (e.t) {
    case 'const': return e;
    case 'cmp': if (e.v === 'temp') { const te = env.temp; return (e.op === '==' ? e.n === 1 : e.n !== 1) ? te : NOT(te); } if (e.v in env.known) return cmpv(env.known[e.v], e.op, e.n) ? T : F; return e;
    case 'not': return NOT(evalE(e.e, env));
    case 'and': return AND(...e.a.map(x => evalE(x, env)));
    case 'or': return OR(...e.a.map(x => evalE(x, env)));
  }
}
function keyOf(e) { return JSON.stringify(e); }
function render(e, top = true) {
  switch (e.t) {
    case 'const': return e.v ? 'always' : 'never';
    case 'cmp': { if (e.v in TALLY) { const sym = { '==': '=', '!=': '≠', '<': '<', '<=': '≤', '>': '>', '>=': '≥' }[e.op]; return `${TALLY[e.v]} ${sym} ${e.n}`; } const have = (e.op === '==' && e.n === 1) || (e.op === '!=' && e.n === 0) || (e.op === '>' && e.n === 0) || (e.op === '>=' && e.n === 1); const not = (e.op === '==' && e.n === 0) || (e.op === '!=' && e.n === 1) || (e.op === '<' && e.n === 1) || (e.op === '<=' && e.n === 0); if (have) return `you have ${KW(e.v)}`; if (not) return `you do not have ${KW(e.v)}`; return `${KW(e.v)} ${e.op} ${e.n}`; }
    case 'not': return `not (${render(e.e, false)})`;
    case 'and': { const s = e.a.map(x => render(x, false)).join(' and '); return top ? s : `(${s})`; }
    case 'or': { const s = e.a.map(x => render(x, false)).join(' or '); return top ? s : `(${s})`; }
  }
}

// ---------- 3. Symbolic run of a section for a given Trust value ----------
function runSym(s, trust) {
  const env = { known: { [TRUST]: trust }, temp: F };
  const fx = { hides: {}, sets: [], incs: [], autos: [], unhandled: [] }; // hides: piece -> Expr (hidden when)
  function walk(list, cond) {
    for (const st of list) {
      if (st.k === 'block') walk(st.b, cond);
      else if (st.k === 'if') { const c = evalE(st.c, env); const ct = AND(cond, c), ce = AND(cond, NOT(c)); if (!isC(ct, false)) walk([st.th], ct); if (st.el && !isC(ce, false)) walk([st.el], ce); }
      else if (st.k === 'hide') fx.hides[st.id] = OR(fx.hides[st.id] || F, cond);
      else if (st.k === 'temp') { env.temp = st.n === 1 ? OR(env.temp, cond) : AND(env.temp, NOT(cond)); }
      else if (st.k === 'auto') { fx.autos = fx.autos.map(a => ({ n: a.n, cond: AND(a.cond, NOT(cond)) })).filter(a => !isC(a.cond, false)); fx.autos.push({ n: st.n, cond }); }
      else if (st.k === 'var') {
        if (st.op === '=') { fx.sets.push({ v: st.v, n: st.n, cond }); if (isC(cond, true)) env.known[st.v] = st.n; else delete env.known[st.v]; }
        else { const d = st.op === '++' ? 1 : st.op === '--' ? -1 : st.op === '+=' ? st.n : -st.n; fx.incs.push({ v: st.v, d, cond }); if (st.v === TRUST) { if (isC(cond, true)) env.known[TRUST] += d; else delete env.known[TRUST]; } else if (st.v in env.known) { if (isC(cond, true)) env.known[st.v] += d; else delete env.known[st.v]; } }
      } else fx.unhandled.push(JSON.stringify(st));
    }
  }
  walk(parsed[s] || [], T);
  // trust outcomes: list of {trust, cond}
  let outs = [{ trust, cond: T }];
  for (const inc of fx.incs.filter(i => i.v === TRUST)) { const nx = []; for (const o of outs) { const a = AND(o.cond, inc.cond), b = AND(o.cond, NOT(inc.cond)); if (!isC(a, false)) nx.push({ trust: o.trust + inc.d, cond: a }); if (!isC(b, false)) nx.push({ trust: o.trust, cond: b }); } outs = nx; }
  // merge outcomes with same trust
  const m = new Map(); for (const o of outs) m.set(o.trust, m.has(o.trust) ? OR(m.get(o.trust), o.cond) : o.cond); fx.trustOut = [...m].map(([trust, cond]) => ({ trust, cond }));
  return fx;
}

// ---------- 4. HTML -> text ----------
function htmlText(h) {
  let x = h;
  x = x.replace(/<img src="images\/tab\.png"\/>/g, '\u0001');
  x = x.replace(/<br\s*\/?>/g, '\n');
  x = x.replace(/<div class="s1">([^<]*)<\/div>/g, '\n\n**$1**\n');
  x = x.replace(/<div class="s3">([^<]*)<\/div>/g, '*$1*\n\n');
  x = x.replace(/<div class="s4">([^<]*)<\/div>/g, '\n**$1**\n');
  x = x.replace(/<div class="timepasses">([^<]*)<\/div>/g, '\n*$1*\n');
  x = x.replace(/<div class="chapter-image">.*?<\/div>/g, '');
  x = x.replace(/<em>/g, '*').replace(/<\/em>/g, '*');
  x = x.replace(/<span class="hlink">/g, '').replace(/<span class="question">[^<]*<\/span>/g, '');
  x = x.replace(/<[^>]+>/g, '');
  x = x.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  x = x.replace(/xoptx\s*/g, '');
  return x;
}
function finishText(x) { // paragraph marks -> blank lines, collapse
  x = x.replace(/\u0001/g, '\n\n');
  x = x.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return x.trim();
}
// Split a section's HTML into segments: {kind:'text', html} | {kind:'piece', id, choice, target, html}
function segments(id) {
  const line = html.split('\n').find(l => l.startsWith(`<div id="sect_${id}" class="nosect">`));
  const inner = line.replace(/^<div id="sect_[^"]+" class="nosect">/, '').replace(/<\/div>\s*$/, '');
  const segs = []; const re = /<span id="(piece[^"]*)"([^>]*)>([\s\S]*?)<\/span>|<a [^>]*onclick="changesect\('([^']+)'[^>]*>([\s\S]*?)<\/a>/g;
  let last = 0, m, ai = 0;
  while ((m = re.exec(inner))) {
    if (m.index > last) segs.push({ kind: 'text', html: inner.slice(last, m.index) });
    if (m[1]) { const attrs = m[2]; let target = null; const t = attrs.match(/changesect\('([^']+)'/); if (t) target = t[1]; const b = attrs.match(/beginPart\((\d)\)/); if (b) target = 'BEGINPART' + b[1]; segs.push({ kind: 'piece', id: m[1], choice: /buttonon/.test(attrs), target, html: m[3] }); }
    else segs.push({ kind: 'piece', id: 'link_' + id + '_' + (ai++), choice: true, target: m[4], html: m[5], isLink: true });
    last = re.lastIndex;
  }
  if (last < inner.length) segs.push({ kind: 'text', html: inner.slice(last) });
  return segs;
}

// ---------- 5. Page graph: which classes become numbered pages ----------
const classOf = (s, t) => classmap[s + '|' + t];
const classes = {}; // cls -> {s, t(min), trusts:[]}
for (const k in classmap) { const [s, t] = k.split('|'); const c = classmap[k]; classes[c] ||= { s, trusts: [] }; classes[c].trusts.push(+t); }
for (const c in classes) { classes[c].trusts.sort((a, b) => a - b); classes[c].t = classes[c].trusts[0]; }
const copiesOf = {}; for (const c in classes) { const s = classes[c].s; copiesOf[s] = (copiesOf[s] || 0) + 1; }
// render each class to a structure
const pageData = {}; const problems = [];
function build(c) {
  const { s, t } = classes[c]; const fx = runSym(s, t);
  const segs = s.startsWith('part_') ? [] : segments(s);
  const sec = sections[s];
  // continuation
  let cont = []; // {cls, cond, auto:true} or choice edges
  const trustTargets = (target, condChoice) => fx.trustOut.map(o => { let tgt = resolve(target); if (tgt.startsWith('part_')) tgt = partFirst[+tgt.slice(5)]; const cl = classOf(tgt, o.trust); if (cl === undefined) problems.push(`${s} trust ${t}: no page for ${tgt}|${o.trust}`); return { cls: cl, cond: AND(condChoice, o.cond), target: tgt }; }).filter(e => !isC(e.cond, false));
  const autos = fx.autos.map(a => ({ n: '01_' + get2(a.n), cond: a.cond }));
  const autoEdges = []; for (const a of autos) for (const e of trustTargets(a.n, a.cond)) autoEdges.push({ ...e, auto: true });
  const choices = [];
  for (const sg of segs) if (sg.kind === 'piece' && sg.choice) { const hidden = fx.hides[sg.id] || F; const shown = NOT(hidden); if (isC(shown, false)) continue; for (const e of trustTargets(sg.target, shown)) choices.push({ ...e, text: finishText(htmlText(sg.html)), piece: sg.id, isLink: sg.isLink }); }
  pageData[c] = { s, t, trusts: classes[c].trusts, fx, segs, autoEdges, choices, unhandled: fx.unhandled };
}
for (const c in classes) build(c);
// numbered pages: root, and anything reached by a choice or a conditional auto
const numbered = new Set(); const root = classOf('part_01', 0);
const firstOfParts = new Set(Object.values(partFirst));
for (const c in pageData) { const p = pageData[c]; for (const e of p.choices) numbered.add(e.cls); const uncond = p.autoEdges.length === 1 && isC(p.autoEdges[0].cond, true); if (!uncond) for (const e of p.autoEdges) numbered.add(e.cls); }
numbered.delete(root);
// part headers: redirect choices into part_0N to the part's first section (same trust); do not number part headers
for (const c in pageData) if (pageData[c].s.startsWith('part_')) { numbered.delete(+c); }
function redirectPart_unused(e) { if (classes[e.cls] && classes[e.cls].s.startsWith('part_')) { const n = +classes[e.cls].s.slice(5); const pd = pageData[e.cls]; const tgt = pd.choices[0]; if (tgt) { e.cls = tgt.cls; e.target = tgt.target; numbered.add(tgt.cls); } } return e; }

numbered.add(classOf('01_01', 0));
const order = [...numbered].sort((a, b) => { const A = classes[a], B = classes[b]; return snum(A.s) - snum(B.s) || A.t - B.t; });
const pageNo = {}; order.forEach((c, i) => pageNo[c] = i + 1);

// ---------- 6. Rendering ----------
let editCount = 0; const editSites = new Set(); const detail = JSON.parse(fs.readFileSync(process.argv[5], 'utf8')); const keywordUse = {}; // kw -> {set:Set, test:Set}
const noteKW = (v, kind, s) => { keywordUse[v] ||= { set: new Set(), del: new Set(), test: new Set() }; keywordUse[v][kind].add(s); };
function condVars(e, s) { if (e.t === 'cmp') { if (!(e.v in TALLY) && e.v !== TRUST) noteKW(e.v, 'test', s); } else if (e.t === 'not') condVars(e.e, s); else if (e.a) e.a.forEach(x => condVars(x, s)); }
function renderBody(c, depth, out) {
  const p = pageData[c]; const s = p.s;
  if (chapterImages[s]) out.push(`[ILLUSTRATION: ${chapterImages[s]}]`, '');
  if (detail[s] && detail[s].textDiffers && depth === 0) out.push('> ⚠ TRUST-DEPENDENT TEXT: this copy of the section reads differently from its other Trust-thread copies (text or links that today depend on Trust have been resolved for this thread).', '');
  // instructions
  const instr = [];
  for (const st of p.fx.sets) if (!(st.v in TALLY) && st.v !== TRUST) { noteKW(st.v, st.n ? 'set' : 'del', s); condVars(st.cond, s); const act = st.n ? `Note the keyword ${KW(st.v)}.` : `Delete the keyword ${KW(st.v)} if you have it.`; instr.push(isC(st.cond, true) ? act : `If ${render(st.cond)}: ${act}`); }
  for (const inc of p.fx.incs) if (inc.v in TALLY) { condVars(inc.cond, s); const act = `${inc.d > 0 ? 'Add' : 'Subtract'} ${Math.abs(inc.d)} ${inc.d > 0 ? 'to' : 'from'} your ${TALLY[inc.v]} score.`; instr.push(isC(inc.cond, true) ? act : `If ${render(inc.cond)}: ${act}`); }
  for (const u of p.unhandled) { editCount++; editSites.add(s + '/u'); instr.push(`⚠ EDIT: unhandled logic ${u}`); }
  if (instr.length) { out.push(...instr.map(x => `> ${x}`), ''); }
  // body text with conditional pieces
  let body = ''; let prevHtml = '';
  for (const sg of p.segs) {
    if (sg.kind === 'text') { body += htmlText(sg.html); prevHtml = sg.html; continue; }
    if (sg.choice) continue;
    const hidden = p.fx.hides[sg.id] || F; const shown = NOT(hidden);
    const txt = htmlText(sg.html);
    if (isC(shown, false)) { continue; }
    if (isC(shown, true)) { body += txt; continue; }
    condVars(shown, s);
    const inline = !(/(^|\n|\u0001)\s*$/.test(body) || /^\s*[\n\u0001]/.test(txt)) || !/(\n|\u0001)\s*$/.test(txt);
    if (inline) { editCount++; editSites.add(s + '/' + sg.id); body += `⟦⚠ EDIT inline, if ${render(shown)}: ${txt.trim()}⟧`; }
    else body += `\n⟦If ${render(shown)}, read the following:⟧\n${txt}`;
  }
  body = finishText(body);
  if (body) out.push(body, '');
  // continuation
  const uncondAuto = p.autoEdges.length === 1 && isC(p.autoEdges[0].cond, true);
  if (uncondAuto) {
    const e = p.autoEdges[0];
    if (pageNo[e.cls] !== undefined) out.push(`→ Turn to ${pageNo[e.cls]}.`, '');
    else if (depth < 12) renderBody(e.cls, depth + 1, out);
    else out.push(`⚠ EDIT: auto-chain too deep at ${e.target}`);
  } else if (p.autoEdges.length) {
    for (const e of p.autoEdges) { condVars(e.cond, s); out.push(`→ If ${render(e.cond)}, turn to ${pageNo[e.cls] ?? '??'}.`); }
    out.push('');
  }
  if (p.choices.length) {
    for (const e of p.choices) { condVars(e.cond, s); const pre = isC(e.cond, true) ? '' : `[If ${render(e.cond)}] `; const txt = e.text || '(continue)'; out.push(`• ${pre}${txt} — turn to ${pageNo[e.cls] ?? '??'}`); }
    out.push('');
  }
  if (!p.autoEdges.length && !p.choices.length && !s.startsWith('part_')) out.push('*(The story ends here.)*', '');
}
const partTitle = {}; for (let n = 1; n <= 6; n++) { const line = html.split('\n').find(l => l.startsWith(`<div id="sect_part_0${n}"`)); const a = line.match(/<div class="s1">([^<]*)<\/div>/), b = line.match(/<div class="s3">([^<]*)<\/div>/); partTitle[n] = `${a ? a[1] : 'PART ' + n}${b ? ' — ' + b[1] : ''}`; }
const out = []; let curPart = 0;
for (const c of order) {
  const p = pageData[c]; const pt = partOf(p.s);
  if (pt !== curPart) { curPart = pt; out.push(`\n# ${partTitle[pt]}\n`); }
  const bands = (() => { const g = p.trusts; const rs = []; let st = g[0], pr = g[0]; for (const x of g.slice(1)) { if (x === pr + 1) pr = x; else { rs.push([st, pr]); st = pr = x; } } rs.push([st, pr]); return rs.map(([a, b]) => a === b ? `${a}` : `${a} to ${b}`).join(', '); })();
  out.push(`## ${pageNo[c]}`);
  out.push(`*(${p.s}${copiesOf[p.s] > 1 ? ` · Trust thread ${bands}` : ''})*`, '');
  renderBody(c, 0, out);
}
// ---------- 7. Front matter ----------
const kwList = Object.keys(keywordUse).sort();
const front = [];
front.push('# I, Frankenstein — Kindle working manuscript', '');
front.push('Generated from story.html. Conventions:', '');
front.push('- The reader keeps two scores, **Empathy** and **Alienation**, both starting at 0. Instructions to change them appear as `> Add 1 to your Empathy score.`', '');
front.push('- Every true/false flag in the game is a **keyword** the reader notes down. Placeholders are `KW_<name>`; rename them as you like. `> Note the keyword KW_x.` means the reader writes it down; `> Delete the keyword` means they cross it out.', '');
front.push('- The third score, Trust, is not tracked by the reader. Instead each section that depends on it exists in several numbered copies, one per **Trust thread** (shown in the page header). Links always send the reader to the copy that matches their choices, so the reader never sees Trust.', '');
front.push('- Text that today appears only under a condition is marked `⟦If you have KW_x, read the following:⟧` when it is a whole paragraph, or `⟦⚠ EDIT inline, if …: …⟧` when it sits inside a sentence. **Every ⚠ EDIT marker needs your hand**: decide whether to keep both readings with a keyword instruction, or rewrite the sentence so one wording serves both.', '');
front.push('- Choices are listed as `• text — turn to N`. A choice shown only under a condition is prefixed `[If …]`. A `→ If …, turn to N` line is an automatic continuation that depends on a keyword or score.', '');
front.push(`- ${order.length} numbered pages and ${kwList.length} keyword placeholders. ${editCount} ⚠ EDIT markers in all, but only ${editSites.size} distinct edit sites: the rest are the same sentence repeated in Trust-thread copies, so fix it once and paste the fix into the other copies.`, '');
front.push('- Copies of a section in different Trust threads have identical text and instructions except where the page carries a `⚠ TRUST-DEPENDENT TEXT` note; otherwise only the link numbers differ.', '');
front.push('## Keyword placeholders', '', '| Keyword | Noted at | Deleted at | Tested at |', '| --- | --- | --- | --- |');
for (const k of kwList) { const u = keywordUse[k]; front.push(`| ${KW(k)} | ${[...u.set].join(', ') || '—'} | ${[...u.del].join(', ') || '—'} | ${[...u.test].join(', ') || '—'} |`); }
front.push('');
const unreachable = Object.keys(sections).filter(s => !s.startsWith('part_') && !copiesOf[s]);
front.push(`## Sections not reachable in the current game (omitted): ${unreachable.length}`, '', unreachable.sort((a, b) => snum(a) - snum(b)).join(', '), '');
fs.writeFileSync(OUT, front.join('\n') + '\n' + out.join('\n') + '\n');
console.error(`pages ${order.length}, edits ${editCount}, keywords ${kwList.length}, problems ${problems.length}`); if (problems.length) console.error(problems.slice(0, 10).join('\n'));
