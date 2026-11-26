---
name: safechange-risk-review
description: Check a medical device software change against the team's hazard log and say what must happen before it can ship. Use when someone asks which hazards a Jira change touches, whether a change or release is safe to ship, or for a draft risk review note.
---

# SafeChange risk review

Use the SafeChange tools to keep changes to medical device software tied to the hazard log.

## Steps

1. Call `analyze-change` with the Jira issue key. It returns each touched hazard, why it matched, and its state: needs a risk review, change edited after review, risk judged not acceptable, needs a linked test, linked test not passed yet, or reviewed and tested.
2. Give the verdict first (held or cleared), then the hazards, most severe first.
3. For context on what can go wrong, call `similar-recalls` with the hazard ID. Quote real recalls only, with firm, date and reason, and name openFDA as the source.
4. To see every change that touches a hazard, call `hazard-impact` with the hazard ID.
5. Before a release, call `release-check` with a fix version, project key or JQL. List held changes first.

## Rules

- Never say a risk is acceptable on your own. A person signs every review in Jira.
- Use only facts from the tools. Do not invent recalls, tests or hazard details.
- Keep answers short and plain.
