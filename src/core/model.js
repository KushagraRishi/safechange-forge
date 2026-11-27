import MODEL from './model-data.js';

// The SafeChange hazard model, run inside Forge with no outside service.
// It is the same TF-IDF + logistic regression that ml/train.py fits on FDA
// software recall events; model.json holds the frozen weights. A parity test
// checks these probabilities against scikit-learn's to 1e-6.

export const CATEGORIES = ['dose', 'info', 'alarm', 'stop', 'comms', 'security', 'ui', 'power'];

export const CATEGORY_NAMES = {
  dose: 'Wrong therapy amount',
  info: 'Wrong or missing information',
  alarm: 'Alarm or detection failure',
  stop: 'Loss of function',
  comms: 'Connectivity or data transfer',
  security: 'Security',
  ui: 'User interface or input',
  power: 'Power or battery',
};

const TOKEN = /[\p{L}\p{N}\p{M}_]{2,}/gu;

/**
 * In the app, a model category counts only if the change's own words push it
 * up by at least this much (logit, before the intercept). Recall text always
 * describes a failure, so the model never saw a harmless change; without this
 * bar it would flag short, harmless tickets. Fixed before the locked test
 * (ml/PREREGISTRATION.md, amendment 1).
 */
export const APP_MIN_EVIDENCE = 0.5;

export function tokenize(text) {
  return String(text || '').toLowerCase().match(TOKEN) || [];
}

export class HazardModel {
  constructor(model) {
    this.m = model;
    this.index = new Map(model.terms.map((t, i) => [t, i]));
  }

  /** Sparse, L2 normalised TF-IDF vector: Map(termIndex -> weight). */
  features(text) {
    const toks = tokenize(text);
    const grams = toks.slice();
    for (let i = 0; i + 1 < toks.length; i++) grams.push(`${toks[i]} ${toks[i + 1]}`);
    const tf = new Map();
    for (const g of grams) {
      const i = this.index.get(g);
      if (i !== undefined) tf.set(i, (tf.get(i) || 0) + 1);
    }
    const x = new Map();
    let norm = 0;
    for (const [i, c] of tf) {
      const v = (1 + Math.log(c)) * this.m.idf[i];
      x.set(i, v);
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [i, v] of x) x.set(i, v / norm);
    return x;
  }

  /** Probability per category, plus the words that pushed it up most. */
  score(text, topWords = 3) {
    const x = this.features(text);
    return CATEGORIES.map((c) => {
      const w = this.m.coef[c];
      if (!w) return { category: c, p: 0, evidence: 0, flagged: false, appFlag: false, words: [] };
      let evidence = 0;
      const parts = [];
      for (const [i, v] of x) {
        const contrib = v * w[i];
        evidence += contrib;
        if (contrib > 0) parts.push([contrib, this.m.terms[i]]);
      }
      const p = 1 / (1 + Math.exp(-(this.m.intercept[c] + evidence)));
      parts.sort((a, b) => b[0] - a[0]);
      return {
        category: c,
        name: CATEGORY_NAMES[c],
        p,
        threshold: this.m.thresholds[c],
        evidence,
        flagged: p >= this.m.thresholds[c],
        appFlag: p >= this.m.thresholds[c] && evidence >= APP_MIN_EVIDENCE,
        words: parts.slice(0, topWords).map((q) => q[1]),
      };
    });
  }
}

let cached = null;
/** The bundled model, built once per function instance. */
export function loadModel() {
  if (!cached) cached = new HazardModel(MODEL);
  return cached;
}

/** Map any spelling of a category ("Alarm or detection failure", "alarm") to its code. */
export function categoryCode(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  if (CATEGORIES.includes(t)) return t;
  const hit = Object.entries(CATEGORY_NAMES).find(([, n]) => n.toLowerCase() === t || t.startsWith(n.toLowerCase().split(' ')[0]));
  return hit ? hit[0] : null;
}
