// SafeChange: Forge entry points.

import Resolver from '@forge/resolver';
import { checkChange, signReview, recallsForHazard, releaseCheck, changesTouchingHazard, loadHazardLog, hazardLogStatus, staleAlert, releaseRecord, NotConfigured } from './services/engine.js';
import { getSettings, saveSettings } from './services/store.js';
import { findPages, getPage } from './services/atlassian.js';
import { blockMessage } from './core/gate.js';
import { draftNote } from './core/notes.js';
import { createDemo, listProjectsAndSpaces } from './services/demo.js';

const fail = (e) => ({ error: e instanceof NotConfigured ? 'not-configured' : 'error', message: String(e.message || e) });

// ---------- Issue panel ----------

const panel = new Resolver();

panel.define('check', async ({ context }) => {
  try {
    return await checkChange(context.extension.issue.key);
  } catch (e) {
    return fail(e);
  }
});

panel.define('sign', async ({ payload, context }) => {
  try {
    return await signReview({ ...payload, issueKey: context.extension.issue.key, accountId: context.accountId, via: 'panel' });
  } catch (e) {
    return fail(e);
  }
});

panel.define('recalls', async ({ payload }) => {
  try {
    const { hazards } = await loadHazardLog();
    const h = hazards.find((x) => x.id === payload.hazardId);
    const settings = await getSettings();
    return h ? await recallsForHazard(h, settings.productCodes) : { total: 0, items: [] };
  } catch (e) {
    return fail(e);
  }
});

panel.define('draft', async ({ payload, context }) => {
  try {
    const result = await checkChange(context.extension.issue.key);
    const item = result.gate.items.find((i) => i.hazard.id === payload.hazardId);
    return { note: item ? draftNote(result, item) : '' };
  } catch (e) {
    return fail(e);
  }
});

export const panelResolver = panel.getDefinitions();

// ---------- Admin (setup) page ----------

const admin = new Resolver();

admin.define('settings', async () => {
  const s = await getSettings();
  let log = null;
  if (s.pageId) {
    try {
      const l = await loadHazardLog();
      log = { count: l.hazards.length, problems: l.problems, page: l.page, hazards: l.hazards };
    } catch (e) {
      log = { error: String(e.message || e) };
    }
  }
  return { settings: s, log };
});

admin.define('findPages', async ({ payload }) => {
  try {
    return { pages: await findPages(payload?.text || '') };
  } catch (e) {
    return fail(e);
  }
});

admin.define('setPage', async ({ payload }) => {
  try {
    const page = await getPage(payload.pageId);
    await saveSettings({ pageId: page.id, pageTitle: page.title, pageUrl: page.url });
    const l = await loadHazardLog();
    return { ok: true, count: l.hazards.length, problems: l.problems };
  } catch (e) {
    return fail(e);
  }
});

admin.define('setProductCodes', async ({ payload }) => {
  const codes = String(payload.codes || '')
    .split(/[\s,]+/)
    .map((c) => c.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter((c) => c.length === 3);
  await saveSettings({ productCodes: codes });
  return { ok: true, productCodes: codes };
});

admin.define('targets', async () => {
  try {
    return await listProjectsAndSpaces();
  } catch (e) {
    return fail(e);
  }
});

admin.define('createDemo', async ({ payload }) => {
  try {
    return await createDemo(payload);
  } catch (e) {
    return fail(e);
  }
});

admin.define('releaseCheck', async ({ payload }) => {
  try {
    return await releaseCheck(payload.jql);
  } catch (e) {
    return fail(e);
  }
});

admin.define('releaseRecord', async ({ payload }) => {
  try {
    return await releaseRecord({ jql: payload.jql, title: payload.title });
  } catch (e) {
    return fail(e);
  }
});

export const adminResolver = admin.getDefinitions();

// ---------- Confluence byline on the hazard log page ----------

const byline = new Resolver();

byline.define('status', async ({ context }) => {
  try {
    const pageId = context.extension?.content?.id;
    const [status, settings] = await Promise.all([hazardLogStatus(pageId), getSettings()]);
    return { ...status, isActiveLog: settings.pageId === String(pageId) };
  } catch (e) {
    return fail(e);
  }
});

byline.define('useThisPage', async ({ context }) => {
  try {
    const page = await getPage(context.extension?.content?.id);
    await saveSettings({ pageId: page.id, pageTitle: page.title, pageUrl: page.url });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

export const bylineResolver = byline.getDefinitions();

// ---------- Workflow validator ----------

export async function validate(event) {
  const key = event?.issue?.key;
  try {
    const result = await checkChange(key);
    if (result.gate.status === 'blocked') return { result: false, errorMessage: blockMessage(result.gate) };
    return { result: true };
  } catch (e) {
    if (e instanceof NotConfigured) return { result: true };
    // Fail closed: if SafeChange cannot read the hazard log, the change waits.
    return { result: false, errorMessage: `SafeChange could not check this change: ${String(e.message || e).slice(0, 200)}` };
  }
}

// ---------- Rovo actions (also served as MCP tools) ----------

const issueKeyOf = (payload) =>
  String(payload?.issueKey || payload?.context?.jira?.issueKey || '')
    .trim()
    .toUpperCase();

export async function actionAnalyzeChange(payload) {
  const key = issueKeyOf(payload);
  if (!key) return 'Please tell me which Jira issue to check, for example PUMP-120.';
  try {
    const r = await checkChange(key);
    return {
      issue: key,
      summary: r.summary,
      verdict: r.gate.status,
      hazardsTouched: r.gate.total,
      hazardsNotCleared: r.gate.open,
      hazards: r.gate.items.map((i) => ({
        id: i.hazard.id,
        title: i.hazard.title,
        severity: i.hazard.severity,
        harm: i.hazard.harm,
        why: i.reasons.map((x) => `${x.kind} ${x.detail}`),
        riskControl: i.hazard.control,
        verification: i.hazard.verification,
        state: i.label,
        review: i.review
          ? { decision: i.review.decision, by: i.review.reviewerName, at: i.review.reviewedAt, note: i.review.note, test: i.review.testKey }
          : null,
        test: i.test,
      })),
      linkedIssues: r.linked,
      hazardLog: r.log.page,
      modelStrongSignals: r.model,
      modelSuggestionsNotBlocking: r.suggestions,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function actionHazardImpact(payload) {
  try {
    const id = String(payload?.hazardId || '').trim();
    const jql = payload?.jql || 'statusCategory != Done ORDER BY updated DESC';
    return await changesTouchingHazard(id, jql);
  } catch (e) {
    return fail(e);
  }
}

export async function actionSimilarRecalls(payload) {
  try {
    const { hazards, settings } = await loadHazardLog();
    const id = String(payload?.hazardId || '').trim().toLowerCase();
    const h = hazards.find((x) => x.id.toLowerCase() === id);
    if (!h) return { error: 'error', message: `No hazard ${payload?.hazardId} in the hazard log.` };
    const r = await recallsForHazard(h, settings.productCodes);
    return { hazard: h.id, source: 'openFDA device recall API, root cause software', productCodes: settings.productCodes, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function actionRecordReview(payload, context) {
  try {
    const key = issueKeyOf(payload);
    // The signer always comes from Forge's own context, never from inputs the agent filled in.
    const accountId = context?.accountId || payload?.context?.accountId;
    const r = await signReview({
      issueKey: key,
      hazardId: payload.hazardId,
      decision: payload.decision,
      note: payload.note,
      testKey: payload.testKey,
      accountId,
      via: 'rovo',
    });
    const item = r.gate.items.find((i) => i.hazard.id === payload.hazardId);
    return { saved: true, issue: key, hazard: payload.hazardId, state: item?.label, verdict: r.gate.status, stillOpen: r.gate.open };
  } catch (e) {
    return fail(e);
  }
}

export async function actionReleaseCheck(payload) {
  try {
    let jql = payload?.jql;
    if (!jql && payload?.version) jql = `fixVersion = "${String(payload.version).replace(/"/g, '')}"`;
    if (!jql && payload?.project) jql = `project = "${String(payload.project).replace(/"/g, '')}" AND statusCategory != Done`;
    if (!jql) jql = 'statusCategory != Done ORDER BY updated DESC';
    return await releaseCheck(jql);
  } catch (e) {
    return fail(e);
  }
}

export async function actionReleaseRecord(payload) {
  try {
    let jql = payload?.jql;
    if (!jql && payload?.version) jql = `fixVersion = "${String(payload.version).replace(/"/g, '')}"`;
    if (!jql && payload?.project) jql = `project = "${String(payload.project).replace(/"/g, '')}" ORDER BY key ASC`;
    if (!jql) return { error: 'error', message: 'Tell me which release, project or JQL to write the record for.' };
    return await releaseRecord({ jql, title: payload?.title });
  } catch (e) {
    return fail(e);
  }
}

// ---------- Trigger: live alert when a reviewed change is edited ----------

export async function onIssueUpdated(event) {
  try {
    const key = event?.issue?.key;
    if (!key) return;
    const fields = (event?.changelog?.items || []).map((i) => i.field || i.fieldId).filter(Boolean);
    const r = await staleAlert(key, fields);
    console.log(`SafeChange stale check ${key}: ${JSON.stringify(r)}`);
  } catch (e) {
    console.error(`SafeChange stale check failed: ${e.message || e}`);
  }
}
