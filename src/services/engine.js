// Puts the pieces together: hazard log + issue + reviews => gate result.

import { parseHazardLog } from '../core/hazardLog.js';
import { analyzeChange, changeFromIssue, fingerprint } from '../core/analyze.js';
import { evaluateGate } from '../core/gate.js';
import { hazardWords } from '../core/recalls.js';
import { getSettings, getCachedLog, setCachedLog, getReviews, putReview } from './store.js';
import { getIssue, getPage, getStatuses, linkedIssues, similarRecalls, getUserName, searchIssues } from './atlassian.js';

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
  return { ...log, page: { id: page.id, title: page.title, version: page.version, url: page.url }, settings };
}

/** Full check of one change. */
export async function checkChange(issueKey) {
  const [log, issue, reviews] = await Promise.all([loadHazardLog(), getIssue(issueKey), getReviews(issueKey)]);
  const change = changeFromIssue(issue);
  const print = fingerprint(change);
  const touched = analyzeChange(change, log.hazards);
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
    const touched = analyzeChange(change, log.hazards);
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
    const t = analyzeChange(change, [hazard]);
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
    const touched = analyzeChange(change, log.hazards);
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
