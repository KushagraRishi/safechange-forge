# Judge guide: SafeChange in about two minutes

## 1. Install (30 seconds)
Open the install link from the Devpost page. Install SafeChange in **Jira**, then in **Confluence**, on a site with Rovo turned on.

## 2. Load the sample (30 seconds)
In Jira, open **Apps, SafeChange** in the left sidebar. Under "Try it with sample data", pick a company-managed project and any Confluence space, then click **Create sample data**.
You get a sample infusion pump hazard log in Confluence (8 hazards), 8 verification tests and 8 sample changes.

## 3. Turn on the gate (30 seconds)
**Project settings, Workflows**, edit the workflow, click the transition into **Done**, **Add rule**, **SafeChange hazard gate**, then **Update workflow**.

## 4. See it work (30 seconds)
Open the change **"Max flow rate raised to 1200 mL/h"**. You should see:
- the SafeChange panel: **Held at Done: 1 of 1 hazard not cleared**, HAZ-1 Catastrophic, and why it matched (component Dose Calculator, file `src/dose/limits.c`, the words "flow rate")
- **FDA recalls like this**: real infusion pump software recalls from openFDA
- moving the change to Done is refused with "SafeChange: this change touches 1 hazard that is not cleared: HAZ-1 (needs a risk review)"

Then: **Review risk**, **Draft from hazard log**, **Sign review**. It stays held ("Linked test not passed yet") until you move the linked test to Done. Edit the description to add `src/alarms/priorities.c` and SafeChange comments on the issue: the review is stale and two new hazards appear.

## 5. Ask Rovo
In Rovo chat, pick **SafeChange Risk Reviewer** and ask "Which hazards does this change touch, and what is missing before Done?" or "Write the release safety record for project <KEY>".

## The numbers, and where they come from
- The hazard model, on 309 FDA software recalls from 2024 to 2026 that it never saw: 82.6% of hazard categories caught, against 55.5% for a keyword checklist. Locked plan: `ml/PREREGISTRATION.md`. Result: `ml/RESULTS.md`. Raw output: `logs/ml_test.json`.
- What failed: `ml/RESULTS.md` (section "What failed") and `LIMITS.md`.
- Every number in the pitch is in `claims.json`, and `scripts/check_claims.js` checks each one against the logs in CI.
- Tests: `npm test` (Forge app) and `python -m unittest discover -s ml -p "test_*.py"` (data and model). CI runs both on every push.
