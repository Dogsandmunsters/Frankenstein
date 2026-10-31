const fs = require('fs');
module.exports = function load(path) {
  const html = fs.readFileSync(path, 'utf8');
  const stripWords = s => s.replace(/<[^>]*>/g, ' ').replace(/xoptx/g, '').replace(/&[a-z]+;/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const sections = {};
  for (const line of html.split('\n')) {
    const m = line.match(/^<div id="sect_([^"]+)" class="nosect">(.*)<\/div>\s*$/); if (!m) continue;
    const id = m[1], inner = m[2]; const pieces = [];
    const re = /<span id="(piece[^"]*)"([^>]*)>([\s\S]*?)<\/span>/g; let mm;
    while ((mm = re.exec(inner))) { const attrs = mm[2]; let target = null; const t = attrs.match(/changesect\('([^']+)'/); if (t) target = t[1]; const b = attrs.match(/beginPart\((\d)\)/); if (b) target = 'BEGINPART' + b[1]; pieces.push({ id: mm[1], choice: /buttonon/.test(attrs), target, words: stripWords(mm[3]) }); }
    const are = /<a [^>]*onclick="changesect\('([^']+)'[^>]*>([\s\S]*?)<\/a>/g; let am, ai = 0;
    while ((am = are.exec(inner))) pieces.push({ id: 'link_' + id + '_' + (ai++), choice: true, target: am[1], words: 0 });
    sections[id] = { pieces, baseWords: stripWords(inner.replace(re, ' ')), allWords: stripWords(inner) };
  }
  const partFirst = { 1: '01_01', 2: '01_3G', 3: '01_9N', 4: '01_FM', 5: '01_LP', 6: '01_QQ' };
  const i0 = html.indexOf('function initsect(s) {'); const i1 = html.indexOf('// INITIALIZATION', i0);
  let body = html.slice(i0, i1); body = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'));
  const varIdx = {}; for (const m of html.matchAll(/^const ([a-z_0-9]+) = (\d+);/gm)) varIdx[m[1]] = +m[2];
  const consts = Object.entries(varIdx).map(([k, v]) => `const ${k}=${v};`).join('\n');
  const mkEngine = new Function('vars', 'ctx', consts + `let auto = 0, temp = 0; const hidepiece = p => ctx.hidden.push(p); return function(s){ auto = 0; ${body}; return auto; };`);
  const blocks = {}; { const re = /if\(s=="([^"]+)"\)\s*\{/g; let m; const st = []; while ((m = re.exec(body))) st.push({ id: m[1], at: m.index + m[0].length }); for (let i = 0; i < st.length; i++) blocks[st[i].id] = body.slice(st[i].at, i + 1 < st.length ? st[i + 1].at : body.length); }
  const base36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; const get2 = n => base36[Math.floor(n / 36)] + base36[n % 36];
  const partOf = id => { if (id.startsWith('part_')) return +id.slice(5); const n = base36.indexOf(id[3]) * 36 + base36.indexOf(id[4]); let part = 1; Object.values(partFirst).forEach((f, i) => { if (n >= base36.indexOf(f[3]) * 36 + base36.indexOf(f[4])) part = i + 1; }); return part; };
  const resolve = t => t.startsWith('BEGINPART') ? partFirst[+t[9]] : t;
  return { html, sections, partFirst, blocks, varIdx, mkEngine, get2, partOf, resolve, NV: 145 };
};
