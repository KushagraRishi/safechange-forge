# SafeChange

**Hazard-aware change control for medical device software, in Jira and Confluence.** An Atlassian Forge app with a Rovo agent, built for Codegeist 2026 (Apps for Specialized Industries: healthcare).

Teams that build medical device software keep a hazard log: the ways the device could hurt a patient, and the controls and tests that stop each one. But code keeps changing after release, and in Jira a change can reach Done without anyone checking it against that log.

SafeChange connects the two:

- **Reads the hazard log** from a Confluence page (one table: ID, Hazard, Harm, Severity, Watches, Risk control, Verification).
- **Finds the hazards each change touches.** It matches the Jira issue's components, the code paths it lists and its words against each hazard's Watches column, and says why each one matched.
- **Holds the change at Done.** A workflow validator stops the transition until every touched hazard has a risk review, signed by a person, and a linked verification test that has passed.
- **Catches edits after review.** Each review is tied to a fingerprint of the change. If the change is edited later, the review goes stale and must be done again.
- **Shows real FDA recalls** with a software root cause that match each hazard, from the public openFDA recall data.
- **SafeChange Risk Reviewer**, a Rovo agent, explains the impact, finds similar recalls, drafts the review note, checks a whole release, and records a review only after the person agrees. The same actions are served as MCP tools (`rovo:mcp`) and as a reusable skill (`rovo:skill`, [SKILL.md](skills/safechange-risk-review/SKILL.md)).

## What is in the app

| Module | What it does |
|---|---|
| `jira:issuePanel` (UI Kit) | Verdict, each touched hazard with why it matched, review form, FDA recalls |
| `jira:workflowValidator` | The Done gate. Fails closed if the hazard log cannot be read |
| `jira:adminPage` (UI Kit) | Pick the hazard log page, one click sample data, FDA product codes, release check |
| `rovo:agent` + 5 `action`s | Analyze change, hazard impact, similar recalls, record risk review, release check |
| `rovo:mcp` | The four read actions as MCP tools for other agents |
| `rovo:skill` | `skills/safechange-risk-review/SKILL.md` |

Data: settings in Forge storage (`@forge/kvs`); reviews as a Jira issue property (`safechange-reviews`) so they stay with the issue; hazard log parsed from Confluence and cached by page version.

## Try it (judges)

1. Open the install link from the Devpost page and install SafeChange on your site in **Jira**, then in **Confluence**. Rovo must be on for the agent.
2. In Jira, open **Apps, SafeChange setup**. Under "Try it with sample data", pick a company-managed project and a Confluence space, then click **Create sample data**. This makes a sample infusion pump hazard log page, 8 verification tests and 8 sample changes, and sets the page as the hazard log.
3. Turn on the gate: **Project settings, Workflows**, edit the workflow, select the transition into Done, **Add rule**, pick **SafeChange hazard gate**, and publish.
4. Open the change "Max flow rate raised to 1200 mL/h". Open the **SafeChange** panel (the shield button under the summary). It shows HAZ-1 (over-infusion, Catastrophic) and why it matched.
5. Try to move it to Done. Jira refuses with the SafeChange message.
6. Click **Review risk**, then **Draft from hazard log**, pick the linked test and **Sign review**. It is still held, because the test has not passed. Move the test issue to Done, then the change can move to Done.
7. Edit the change's description to add `src/alarms/priorities.c`. The review goes stale and HAZ-6 appears. The gate holds again.
8. In Rovo, open **SafeChange Risk Reviewer** and ask "Which hazards does PUMP-1 touch?" or "Is project PUMP safe to ship?".

## Build and deploy it yourself

Needs Node.js 22 or 24 and the Forge CLI (`npm install -g @forge/cli`), and an Atlassian account.

```bash
npm install
npm test                 # 21 tests: parser, matcher, gate, and every handler against a fake Jira and Confluence
npm run evaluate         # scores the matcher on 30 labelled sample changes, writes logs/evaluate.log
forge login
forge register           # gives the app your own id
forge site provision     # a free demo site with Jira, Confluence and Rovo
forge deploy
forge install --product jira
forge install --product confluence
```

On this Mac, `./forge.sh` runs the Forge CLI with Node 24.

## Results so far

From `logs/evaluate.log` (30 sample changes for a sample infusion pump, 8 hazards, labelled by hand):

- SafeChange found **27 of 27** expected hazard links and missed none. It added 3 extra links, all on the safe side (it asks for a review that a person may decide is not needed).
- 21 of the 30 changes touch a hazard. A plain Jira workflow has no hazard check, so all 21 could reach Done with no risk review. With SafeChange, all of them are held until reviewed and tested.
- The 9 changes that touch no hazard (docs, CI, translations) pass with no extra step.

## Project layout

```
manifest.yml               Forge modules, scopes, egress (api.fda.gov)
src/core/                  pure logic: hazard log parser, matcher, gate, recall query, note draft
src/services/              Jira, Confluence, openFDA, storage, sample data
src/frontend/              UI Kit issue panel and setup page
src/index.js               resolvers, the validator and the Rovo actions
static/prompts/            the agent prompt
skills/                    the reusable skill
fixtures/                  sample hazard log and 30 labelled changes
test/                      node:test suites
```

## License

MIT. Hazard data in `fixtures/` is a made-up sample for a sample pump. Recall data comes from openFDA (https://open.fda.gov), which says not to rely on it for medical decisions.
