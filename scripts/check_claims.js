// Every number SafeChange states in its pitch lives in claims.json with the log
// file and JSON path it comes from. This script fails if any claim no longer
// matches its source. CI runs it on every push.
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const claims = JSON.parse(readFileSync(new URL('claims.json', root), 'utf8'));

function dig(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]), obj);
}

function sourceValue(c) {
  const file = new URL(c.file, root);
  if (!existsSync(file)) throw new Error(`missing source file ${c.file}`);
  const text = readFileSync(file, 'utf8');
  if (c.regex) {
    const m = text.match(new RegExp(c.regex, 'm'));
    if (!m) throw new Error(`pattern not found in ${c.file}: ${c.regex}`);
    return Number(m[1].replace(/,/g, ''));
  }
  return dig(JSON.parse(text), c.path);
}

let bad = 0;
for (const c of claims.claims) {
  try {
    const v = sourceValue(c);
    const shown = c.scale ? Math.round(v * c.scale * 10 ** (c.decimals || 0)) / 10 ** (c.decimals || 0) : v;
    const ok = c.equals !== undefined ? JSON.stringify(shown) === JSON.stringify(c.equals) : Math.abs(shown - c.approx) <= (c.tolerance ?? 0.5);
    if (!ok) {
      bad++;
      console.error(`FAIL ${c.id}: "${c.text}" says ${JSON.stringify(c.equals ?? c.approx)}, source ${c.file} gives ${JSON.stringify(shown)}`);
    } else console.log(`ok   ${c.id}: ${c.text}`);
  } catch (e) {
    bad++;
    console.error(`FAIL ${c.id}: ${e.message}`);
  }
}
console.log(`${claims.claims.length - bad} of ${claims.claims.length} claims match their sources.`);
process.exit(bad ? 1 : 0);
