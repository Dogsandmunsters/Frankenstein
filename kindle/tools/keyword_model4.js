// Keyword model v2: flags reader-tracked (free), except loop-gating flags kept concrete inside their loop.
const G = require('./common.js')(process.argv[2]); const crypto = require('crypto'); const H = x => crypto.createHash('md5').update(x).digest('base64').slice(0, 16);
const { sections, blocks, varIdx, mkEngine, get2, partOf, resolve, NV } = G;
const CUT = +(process.env.CUT || 0); if (CUT) for (const id in sections) if (id.startsWith('part_') && +id.slice(5) >= CUT) sections[id].pieces = [];
const RANGE = { victor_empathy: [-13, 19], alienation: [-8, 17], trust_you: [-7, 8] };
const TRACK = (process.env.TRACK || '').split(',').filter(Boolean);
const C = ['victor_empathy', 'alienation', 'trust_you'].filter(n => !TRACK.includes(n)).map(n => varIdx[n]); const CAP = 80;
const FREEC = TRACK.map(n => ({ v: varIdx[n], lo: RANGE[n][0], hi: RANGE[n][1] }));
// SCCs and their gating flags
const succ = {}; for (const id in sections) { succ[id] = new Set(sections[id].pieces.filter(p => p.choice).map(p => resolve(p.target))); for (const a of (blocks[id] || '').matchAll(/auto=(\d+)/g)) succ[id].add('01_' + get2(+a[1])); }
let idx = 0; const st = [], on = new Set(), index = {}, low = {}, sccs = [];
function strong(v) { index[v] = low[v] = idx++; st.push(v); on.add(v); for (const w of succ[v]) { if (!(w in index)) { strong(w); low[v] = Math.min(low[v], low[w]); } else if (on.has(w)) low[v] = Math.min(low[v], index[w]); } if (low[v] === index[v]) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v); sccs.push(c); } }
for (const v in sections) if (!(v in index)) strong(v);
const sccOf = {}, gate = {}; // section -> scc id ; scc id -> gating flag indices
sccs.forEach((c, i) => { if (c.length > 1 || succ[c[0]].has(c[0])) { const blk = c.map(id => blocks[id] || '').join('\n'); const w = new Set([...blk.matchAll(/vars\[([a-z_0-9]+)\]=1/g)].map(m => m[1])); const r = new Set([...blk.matchAll(/vars\[([a-z_0-9]+)\]==/g)].map(m => m[1])); gate[i] = [...w].filter(x => r.has(x)).map(x => varIdx[x]).sort((a, b) => a - b); c.forEach(id => sccOf[id] = i); } });
if (process.env.NOGATE) for (const i in gate) gate[i] = [];
// warn if gating flags are written outside their SCC
for (const i in gate) for (const v of gate[i]) { const name = Object.keys(varIdx).find(k => varIdx[k] === v); for (const id in blocks) if (sccOf[id] !== +i && blocks[id].includes('vars[' + name + ']=1')) console.error('WARNING gating flag', name, 'written outside its loop in', id); }
const blockFree = {}; for (const id in sections) { const b = blocks[id] || ''; blockFree[id] = FREEC.filter(f => b.includes('vars[' + Object.keys(varIdx).find(n => varIdx[n] === f.v) + ']')); }
const blockFlags = {}; for (const id in sections) { const g = new Set(sccOf[id] !== undefined ? gate[sccOf[id]] : []); const b = blocks[id] || ''; blockFlags[id] = [...new Set([...b.matchAll(/vars\[([a-z_0-9]+)\]/g)].map(x => varIdx[x[1]]).filter(v => !C.includes(v) && !g.has(v)))].sort((a, b) => a - b); }
function run(s, cnt, gv, alpha, beta) {
  const vars = new Array(NV).fill(0); C.forEach((v, i) => vars[v] = cnt[i]); blockFlags[s].forEach((v, i) => vars[v] = (alpha >> i) & 1);
  let bb = beta; for (const f of blockFree[s]) { const span = f.hi - f.lo + 1; vars[f.v] = f.lo + (bb % span); bb = Math.floor(bb / span); }
  const g = sccOf[s] !== undefined ? gate[sccOf[s]] : []; g.forEach((v, i) => vars[v] = gv[i]);
  const ctx = { hidden: [] }; const auto = mkEngine(vars, ctx)(s);
  return { hidden: new Set(ctx.hidden), auto, cnt2: C.map(v => vars[v]), vars };
}
const states = new Map(); const queue = []; let capped = 0;
const key = (s, c, g) => s + '|' + c.join(',') + '|' + g.join('');
const ALLOWED = process.env.ALLOWED ? new Set(JSON.parse(require('fs').readFileSync(process.env.ALLOWED,'utf8'))) : null; let disallowed = 0;
const enq = (s, c, g) => { if (ALLOWED && !ALLOWED.has(s + '|' + c.join(','))) { disallowed++; return null; } if (c.some(x => Math.abs(x) > CAP)) { capped++; return null; } const k = key(s, c, g); if (!states.has(k)) { states.set(k, null); queue.push({ k, s, c, g }); } return k; };
const gvFor = (from, to, vars) => (sccOf[to] !== undefined && sccOf[to] === sccOf[from]) ? gate[sccOf[to]].map(v => vars[v]) : (sccOf[to] !== undefined ? gate[sccOf[to]].map(() => 0) : []);
enq('part_01', C.map(() => 0), []);
while (queue.length) {
  const { k, s, c, g } = queue.shift(); const sec = sections[s]; const nAlpha = 1 << blockFlags[s].length; const nBeta = blockFree[s].reduce((a, f) => a * (f.hi - f.lo + 1), 1);
  const obs = []; const edges = []; let alwaysHidden = null;
  for (let ab = 0; ab < nAlpha * nBeta; ab++) { const a = ab % nAlpha, b = Math.floor(ab / nAlpha);
    const r = run(s, c, g, a, b);
    alwaysHidden = alwaysHidden ? new Set([...alwaysHidden].filter(x => r.hidden.has(x))) : r.hidden;
    const d = r.cnt2.map((x, i) => x - c[i]);
    obs.push(ab + ':' + [...r.hidden].sort().join(',') + ':' + (r.auto ? 'auto' + r.auto : '') + ':' + d.join(','));
    if (r.auto) { const t = '01_' + get2(r.auto); const kk = enq(t, r.cnt2, gvFor(s, t, r.vars)); if (kk) edges.push({ lab: ab + '>auto', key: kk }); }
    else for (const p of sec.pieces) if (p.choice && !r.hidden.has(p.id)) { const t = resolve(p.target); const kk = enq(t, r.cnt2, gvFor(s, t, r.vars)); if (kk) edges.push({ lab: ab + '>' + p.id, key: kk }); }
  }
  let words = sec.baseWords; for (const p of sec.pieces) if (!alwaysHidden.has(p.id)) words += p.words;
  states.set(k, { s, c, sig: H(s + '#' + obs.join('|')), words, edges });
  if (states.size % 200000 === 0) console.error('states', states.size, 'queue', queue.length);
}
console.error('reachable states:', states.size, 'capped:', capped, 'disallowed edges:', disallowed);
// DFS post-order hash-consing (state graph is a DAG apart from flagged cycles)
const cls = new Map(); const interned = new Map(); let cycles = 0; let n = 0;
const rootKey = key('part_01', C.map(() => 0), []); const stack = [{ k: rootKey, i: 0 }]; const onPath = new Set([rootKey]);
while (stack.length) {
  const top = stack[stack.length - 1]; const p = states.get(top.k);
  if (top.i < p.edges.length) {
    const e = p.edges[top.i++]; if (cls.has(e.key)) continue;
    if (onPath.has(e.key)) { cycles++; continue; }
    onPath.add(e.key); stack.push({ k: e.key, i: 0 }); continue;
  }
  const sg = p.sig + '#' + p.edges.map(e => e.lab + '>' + (cls.has(e.key) ? cls.get(e.key) : 'CYC')).join(';');
  const h = H(sg); let c = interned.get(h); if (c === undefined) { c = n++; interned.set(h, c); }
  cls.set(top.k, c); onPath.delete(top.k); stack.pop();
}
console.error('classes', n, 'cycle edges', cycles);
const rep = new Map(); for (const [k, p] of states) if (!rep.has(cls.get(k))) rep.set(cls.get(k), p);
let words = 0; const perSect = {}, perPart = {}, range = {}, pairs = new Set();
for (const p of rep.values()) { words += p.words; perSect[p.s] = (perSect[p.s] || 0) + 1; const pt = partOf(p.s); perPart[pt] ||= { pages: 0, words: 0 }; perPart[pt].pages++; perPart[pt].words += p.words; }
for (const p of states.values()) { pairs.add(p.s + '|' + p.c.join(',')); const pt = partOf(p.s); range[pt] ||= C.map(() => [Infinity, -Infinity]); p.c.forEach((x, i) => { range[pt][i][0] = Math.min(range[pt][i][0], x); range[pt][i][1] = Math.max(range[pt][i][1], x); }); }
const origWords = Object.values(sections).reduce((a, s) => a + s.allWords, 0); const origPerPart = {}; for (const id in sections) { const pt = partOf(id); origPerPart[pt] ||= { sections: 0, words: 0 }; origPerPart[pt].sections++; origPerPart[pt].words += sections[id].allWords; }
const mult = Object.entries(perSect).sort((a, b) => b[1] - a[1]); const hist = {}; for (const [, c] of mult) { const b = c === 1 ? '1' : c <= 2 ? '2' : c <= 5 ? '3-5' : c <= 10 ? '6-10' : c <= 20 ? '11-20' : c <= 50 ? '21-50' : '>50'; hist[b] = (hist[b] || 0) + 1; }
if (process.env.CLASSMAP) { const m = {}; for (const [k, p] of states) m[p.s + '|' + p.c.join(',')] = cls.get(k); require('fs').writeFileSync(process.env.CLASSMAP, JSON.stringify(m)); }
if (process.env.DETAIL) {
  const det = {}; // section -> { cls -> {vals:Set, sig} }
  for (const [k, p] of states) { const c = cls.get(k); det[p.s] ||= { words: sections[p.s].allWords, classes: {} }; const e = det[p.s].classes[c] ||= { vals: new Set(), sigs: new Set() }; e.vals.add(p.c.join(',')); e.sigs.add(p.sig); }
  const outd = {};
  for (const s in det) { const cl = Object.values(det[s].classes); const sigs = new Set(cl.map(e => [...e.sigs][0])); outd[s] = { words: det[s].words, variants: cl.length, textDiffers: sigs.size > 1, groups: cl.map(e => [...e.vals].map(Number).sort((a, b) => a - b)) }; }
  require('fs').writeFileSync(process.env.DETAIL, JSON.stringify(outd));
}
console.log(JSON.stringify({ rawStates: states.size, sectionScorePairs: pairs.size, capped, pages: n, words, origWords, reachableSections: Object.keys(perSect).length, blowup: +(words / origWords).toFixed(2),
  perPart: Object.keys(origPerPart).sort().map(k => ({ part: +k, origSections: origPerPart[k].sections, origWords: origPerPart[k].words, pages: perPart[k]?.pages || 0, words: perPart[k]?.words || 0, scoreRanges: range[k] })),
  multiplicityHistogram: hist, worstSections: mult.slice(0, 15) }, null, 1));
