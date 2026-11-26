// Finds real FDA device recalls with a software root cause that mention the
// same words as a hazard. Data: openFDA device recall API (public).

export const OPENFDA = 'https://api.fda.gov/device/recall.json';

/** The plain words a hazard watches (not file paths). */
export function hazardWords(hazard) {
  return hazard.watches.filter((w) => !w.includes('/') && !w.includes('*') && !/\.[a-z0-9]{1,5}$/i.test(w));
}

export function recallQuery(words, productCodes = []) {
  const terms = words
    .map((w) => w.replace(/["\\]/g, '').trim())
    .filter((w) => w.length > 2)
    .slice(0, 6)
    .map((w) => `reason_for_recall:"${w}"`);
  const codes = productCodes.map((c) => c.replace(/[^A-Z0-9]/gi, '').toUpperCase()).filter(Boolean);
  let q = 'root_cause_description:"Software"';
  if (codes.length) q += `+AND+(${codes.map((c) => `product_code:${c}`).join("+")})`;
  if (terms.length) q += `+AND+(${terms.join('+')})`;
  return q;
}

export function recallUrl(words, productCodes = [], limit = 3) {
  return `${OPENFDA}?search=${encodeURI(recallQuery(words, productCodes))}&sort=event_date_initiated:desc&limit=${limit}`;
}

export function shapeRecalls(json) {
  const total = json?.meta?.results?.total ?? 0;
  const items = (json?.results || []).map((r) => ({
    id: r.cfres_id,
    firm: (r.recalling_firm || '').trim(),
    date: r.event_date_initiated || '',
    product: (r.openfda?.device_name || r.product_description || '').split('\n')[0].slice(0, 120),
    reason: (r.reason_for_recall || '').replace(/\s+/g, ' ').slice(0, 280),
    rootCause: r.root_cause_description || '',
    url: r.cfres_id ? `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?id=${r.cfres_id}` : '',
  }));
  return { total, items, updated: json?.meta?.last_updated || '' };
}
