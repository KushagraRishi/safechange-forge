// Puts the pieces together: hazard log + issue + reviews => gate result.

import { parseHazardLog } from '../core/hazardLog.js';
import { analyzeChange, changeFromIssue, fingerprint } from '../core/analyze.js';
import { evaluateGate } from '../core/gate.js';
import { hazardWords } from '../core/recalls.js';
import { loadModel } from '../core/model.js';

/** The model's reading of a change (summary and description). */
export function modelScores(change) {
  return loadModel().score(`${change.summary}\n${change.description}`);
}
import { getSettings, getCachedLog, setCachedLog, getReviews, putReview, getAlertMark, setAlertMark } from './store.js';
import { getIssue, getPage, getStatuses, linkedIssues, similarRecalls, getUserName, searchIssues, addComment, createPage } from './atlassian.js';

export class NotConfigured extends Error {}

export async function loadHazardLog() {
  const settings = await getSettings();
  if (!settings.pageId) throw new NotConfigured('No hazard log page is set yet. Open Apps, SafeChange setup, to pick one.');
  const page = await getPage(settings.pageId);
  let log = await getCachedLog(page.id, page.version);
  if (!log) {
    log = parseHazardLog(page.body);
    await setCachedLog(page.id, page.version, log);
  }
  return { ...log, page: { id: page.id, title: page.title, version: page.version, url: page.url, spaceId: page.spaceId }, settings };
}

/** Full check of one change. */
export async function checkChange(issueKey) {
  const [log, issue, reviews] = await Promise.all([loadHazardLog(), getIssue(issueKey), getReviews(issueKey)]);
  const change = changeFromIssue(issue);
  const print = fingerprint(change);
  const scores = modelScores(change);
  const touched = analyzeChange(change, log.hazards, scores);
  const testKeys = Object.values(reviews).map((r) => r.testKey);
  const tests = await getStatuses(testKeys);
  const gate = evaluateGate(touched, reviews, print, tests);
  return {
    issueKey,
    summary: change.summary,
    status: issue.fields.status?.name || '',
    statusCategory: issue.fields.status?.statusCategory?.key || '',
    files: change.files,
    components: change.components,
    fingerprint: print,
    gate,
    linked: linkedIssues(issue),
    log: { page: log.page, problems: log.problems, count: log.hazards.length },
    productCodes: log.settings.productCodes,
    model: scores.filter((x) => x.appFlag).map(({ category, name, p, words }) => ({ category, name, p, words })),
  };
}

/** Sign a review for one hazard on one change. The signer is the person calling. */
export async function signReview({ issueKey, hazardId, decision, note, testKey, accountId, via }) {
  if (!accountId) throw new Error('A risk review must be signed by a signed-in person.');
  if (!['acceptable', 'not-acceptable'].includes(decision)) throw new Error('Decision must be acceptable or not-acceptable.');
  if (!note || note.trim().length < 10) throw new Error('Write a short note (at least 10 characters) on why the risk is or is not acceptable.');
  const result = await checkChange(issueKey);
  const item = result.gate.items.find((i) => i.hazard.id === hazardId);
  if (!item) throw new Error(`${issueKey} does not touch ${hazardId}, so there is nothing to review.`);
  const name = await getUserName(accountId);
  const review = {
    decision,
    note: note.trim().slice(0, 2000),
    testKey: (testKey || '').trim().toUpperCase(),
    fingerprint: result.fingerprint,
    reviewer: accountId,
    reviewerName: name,
    reviewedAt: new Date().toISOString(),
    hazardLogVersion: result.log.page.version,
    via: via || 'panel',
  };
  await putReview(issueKey, hazardId, review);
  return checkChange(issueKey);
}

export async function recallsForHazard(hazard, productCodes) {
  return similarRecalls(hazardWords(hazard), productCodes);
}

/** Every open change in a set of issues that has hazards not cleared. */
export async function releaseCheck(jql) {
  const log = await loadHazardLog();
  const issues = await searchIssues(jql, 50);
  const rows = [];
  for (const issue of issues) {
    const change = changeFromIssue(issue);
    const touched = analyzeChange(change, log.hazards, modelScores(change));
    if (!touched.length) {
      rows.push({ key: issue.key, summary: change.summary, status: 'no-hazards', open: 0, total: 0, hazards: [] });
      continue;
    }
    const reviews = await getReviews(issue.key);
    const tests = await getStatuses(Object.values(reviews).map((r) => r.testKey));
    const gate = evaluateGate(touched, reviews, fingerprint(change), tests);
    rows.push({
      key: issue.key,
      summary: change.summary,
      status: gate.status,
      open: gate.open,
      total: gate.total,
      hazards: gate.items.map((i) => ({ id: i.hazard.id, severity: i.hazard.severity, state: i.state })),
    });
  }
  return {
    jql,
    checked: rows.length,
    blocked: rows.filter((r) => r.status === 'blocked').length,
    clear: rows.filter((r) => r.status === 'clear').length,
    noHazards: rows.filter((r) => r.status === 'no-hazards').length,
    rows,
  };
}

/** Which open changes touch one hazard (for the hazard view). */
export async function changesTouchingHazard(hazardId, jql) {
  const log = await loadHazardLog();
  const hazard = log.hazards.find((h) => h.id.toLowerCase() === String(hazardId).toLowerCase());
  if (!hazard) throw new Error(`No hazard ${hazardId} in the hazard log.`);
  const issues = await searchIssues(jql, 50);
  const hits = [];
  for (const issue of issues) {
    const change = changeFromIssue(issue);
    const t = analyzeChange(change, [hazard], modelScores(change));
    if (t.length) hits.push({ key: issue.key, summary: change.summary, status: issue.fields.status?.name || '', reasons: t[0].reasons });
  }
  return { hazard, changes: hits };
}

/**
 * For a Confluence page that holds a hazard log: each hazard with the open
 * changes that touch it, and how many are still held. Reads the page it is on,
 * so it does not depend on the Jira side settings.
 */
export async function hazardLogStatus(pageId, jql = 'statusCategory != Done ORDER BY updated DESC') {
  const page = await getPage(pageId);
  const log = parseHazardLog(page.body);
  if (!log.hazards.length) return { isHazardLog: false, problems: log.problems, page: { id: page.id, title: page.title } };
  const issues = await searchIssues(jql, 50);
  const per = Object.fromEntries(log.hazards.map((h) => [h.id, { hazard: h, changes: [] }]));
  for (const issue of issues) {
    const change = changeFromIssue(issue);
    const touched = analyzeChange(change, log.hazards, modelScores(change));
    if (!touched.length) continue;
    const reviews = await getReviews(issue.key);
    const tests = await getStatuses(Object.values(reviews).map((r) => r.testKey));
    const gate = evaluateGate(touched, reviews, fingerprint(change), tests);
    for (const item of gate.items) {
      per[item.hazard.id].changes.push({ key: issue.key, summary: change.summary, state: item.state, label: item.label, blocks: item.blocks });
    }
  }
  const rows = Object.values(per).map((r) => ({
    ...r,
    open: r.changes.filter((c) => c.blocks).length,
  }));
  return {
    isHazardLog: true,
    page: { id: page.id, title: page.title, version: page.version },
    problems: log.problems,
    checked: issues.length,
    rows,
  };
}

// ---------- Live alert: a change edited after its review ----------

const WATCHED_FIELDS = ['summary', 'description', 'components', 'labels', 'Component', 'Labels'];

/**
 * Called by the Jira "issue updated" trigger. If an edit made a signed review
 * stale, comment on the issue once (per new version of the change) so the
 * team knows now, not when someone tries Done.
 */
export async function staleAlert(issueKey, changedFields = []) {
  if (changedFields.length && !changedFields.some((f) => WATCHED_FIELDS.includes(f))) return { skipped: 'no watched field changed' };
  const reviews = await getReviews(issueKey);
  if (!Object.keys(reviews).length) return { skipped: 'no reviews yet' };
  const result = await checkChange(issueKey);
  const stale = result.gate.items.filter((i) => i.state === 'stale-review');
  const fresh = result.gate.items.filter((i) => i.state === 'missing-review');
  if (!stale.length) return { skipped: 'no stale review' };
  const last = await getAlertMark(issueKey);
  if (last === result.fingerprint) return { skipped: 'already alerted for this version' };
  const lines = [
    `SafeChange: this change was edited after its risk review, so ${stale.length === 1 ? 'one review is' : `${stale.length} reviews are`} now stale: ${stale.map((i) => `${i.hazard.id} (${i.hazard.title})`).join('; ')}.`,
  ];
  if (fresh.length) lines.push(`The edit also touches ${fresh.length === 1 ? 'a new hazard' : `${fresh.length} new hazards`}: ${fresh.map((i) => i.hazard.id).join(', ')}.`);
  lines.push('It cannot move to Done until these are reviewed again. Open the SafeChange panel to review them.');
  await addComment(issueKey, lines.join('\n'));
  await setAlertMark(issueKey, result.fingerprint);
  return { commented: true, stale: stale.map((i) => i.hazard.id), newHazards: fresh.map((i) => i.hazard.id) };
}

// ---------- Release safety record (Confluence page) ----------

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STATE_TEXT = {
  ok: 'Reviewed and tested',
  'missing-review': 'Needs a risk review',
  'stale-review': 'Edited after review',
  rejected: 'Risk not acceptable',
  'missing-test': 'Needs a linked test',
  'test-not-passed': 'Test not passed',
};

/** Storage format XHTML for the record page. Pure, so it is unit tested. */
export function releaseRecordHtml({ title, jql, generatedAt, log, rows }) {
  const held = rows.filter((r) => r.gate.status === 'blocked').length;
  const clear = rows.filter((r) => r.gate.status === 'clear').length;
  const none = rows.filter((r) => r.gate.status === 'no-hazards').length;
  const head = `<p>Generated by SafeChange on ${esc(generatedAt)} from the JQL <code>${esc(jql)}</code>, against the hazard log <strong>${esc(log.title)}</strong> (version ${esc(log.version)}).</p>
<p><strong>${rows.length}</strong> changes: <strong>${clear}</strong> cleared, <strong>${held}</strong> held, <strong>${none}</strong> touching no hazard.</p>`;
  const body = rows
    .flatMap((r) =>
      r.gate.items.length
        ? r.gate.items.map(
            (i, k) => `<tr>${k === 0 ? `<td rowspan="${r.gate.items.length}"><p>${esc(r.key)}</p></td><td rowspan="${r.gate.items.length}"><p>${esc(r.summary)}</p></td>` : ''}<td><p>${esc(i.hazard.id)} ${esc(i.hazard.severity)}</p></td><td><p>${esc(i.reasons.map((x) => `${x.kind} ${x.detail}`).join('; '))}</p></td><td><p>${esc(STATE_TEXT[i.state])}</p></td><td><p>${esc(i.review ? `${i.review.decision}, ${i.review.reviewerName || i.review.reviewer}, ${String(i.review.reviewedAt).slice(0, 10)}` : '')}</p></td><td><p>${esc(i.test ? `${i.test.key} (${i.test.status})` : '')}</p></td><td><p><code>${esc(r.fingerprint)}</code></p></td></tr>`
          )
        : [`<tr><td><p>${esc(r.key)}</p></td><td><p>${esc(r.summary)}</p></td><td colspan="6"><p>No hazard touched</p></td></tr>`]
    )
    .join('\n');
  return `${head}
<table><tbody>
<tr><th><p>Change</p></th><th><p>Summary</p></th><th><p>Hazard</p></th><th><p>Why it matched</p></th><th><p>State</p></th><th><p>Review</p></th><th><p>Test</p></th><th><p>Change fingerprint</p></th></tr>
${body}
</tbody></table>
<p>Each review is tied to the change fingerprint above. If a change is edited after its review, the fingerprint changes and the review shows as edited after review.</p>`;
}

export async function releaseRecord({ jql, title }) {
  const log = await loadHazardLog();
  const issues = await searchIssues(jql, 50);
  const rows = [];
  for (const issue of issues) rows.push({ key: issue.key, ...(await checkChange(issue.key)) });
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const pageTitle = title || `Release safety record ${generatedAt}`;
  const html = releaseRecordHtml({ title: pageTitle, jql, generatedAt, log: log.page, rows });
  const page = await createPage(log.page.spaceId, pageTitle, html, log.page.id);
  return {
    page,
    changes: rows.length,
    held: rows.filter((r) => r.gate.status === 'blocked').length,
    cleared: rows.filter((r) => r.gate.status === 'clear').length,
    noHazards: rows.filter((r) => r.gate.status === 'no-hazards').length,
  };
}
