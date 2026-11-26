// Reads a hazard log out of a Confluence page.
//
// The page holds one table. The header row names the columns, in any order:
//   ID | Hazard | Harm | Severity | Watches | Risk control | Verification
// "Watches" lists what in the software can cause the hazard, separated by
// commas: Jira component names, code paths (anything with a "/"), and words.

const COLUMN_ALIASES = {
  id: ['id', 'hazard id', 'ref'],
  hazard: ['hazard', 'hazard description', 'hazardous situation'],
  harm: ['harm', 'possible harm'],
  severity: ['severity', 'sev'],
  watches: ['watches', 'software items', 'software item', 'watch', 'triggers'],
  control: ['risk control', 'risk controls', 'control', 'mitigation'],
  verification: ['verification', 'verification test', 'test'],
};

export const SEVERITIES = ['Catastrophic', 'Critical', 'Serious', 'Minor', 'Negligible'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function htmlToText(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function rowsOf(tableHtml) {
  const rows = [];
  for (const tr of tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [];
    for (const m of tr.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      cells.push(htmlToText(m[2]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function columnKey(header) {
  const h = header.toLowerCase().replace(/[^a-z ]/g, '').trim();
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(h)) return key;
  }
  return null;
}

export function normaliseSeverity(text) {
  const t = String(text || '').trim().toLowerCase();
  return SEVERITIES.find((s) => t.startsWith(s.toLowerCase())) || (t ? text.trim() : 'Unrated');
}

export function splitWatches(text) {
  return String(text || '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse the first table on the page that has an ID column and a Watches column.
 * Returns { hazards, problems } so the UI can tell the team what to fix.
 */
export function parseHazardLog(storageHtml) {
  const problems = [];
  const tables = String(storageHtml || '').match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const table of tables) {
    const rows = rowsOf(table);
    if (rows.length < 2) continue;
    const keys = rows[0].map(columnKey);
    if (!keys.includes('id') || !keys.includes('watches')) continue;

    const hazards = [];
    const seen = new Set();
    rows.slice(1).forEach((cells, i) => {
      const rec = {};
      keys.forEach((k, j) => {
        if (k) rec[k] = cells[j] ?? '';
      });
      const id = (rec.id || '').trim();
      if (!id) return;
      if (seen.has(id)) {
        problems.push(`Row ${i + 2}: hazard ${id} is listed twice. The first one is used.`);
        return;
      }
      seen.add(id);
      const watches = splitWatches(rec.watches);
      if (!watches.length) problems.push(`Hazard ${id} has nothing under Watches, so no change can match it.`);
      hazards.push({
        id,
        title: rec.hazard || id,
        harm: rec.harm || '',
        severity: normaliseSeverity(rec.severity),
        watches,
        control: rec.control || '',
        verification: rec.verification || '',
      });
    });
    return { hazards, problems };
  }
  problems.push('No hazard table found. The page needs a table with at least an "ID" and a "Watches" column.');
  return { hazards: [], problems };
}
