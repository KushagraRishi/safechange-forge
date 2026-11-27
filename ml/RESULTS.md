# Results: the locked test

Run once on 2026-11-27 by `python3 ml/evaluate.py --final`, at commit `8e1f77c` (the frozen model was committed before the run). Raw output: `logs/ml_test.json`. Plan: `ml/PREREGISTRATION.md`.

**Test set:** all 309 FDA device recall events with a software root cause dated 2024-01-01 or later (latest 2026-10-12). The model never saw them. 22 of them carry no hazard category (`none`).

## Primary result: passed

The SafeChange model scored a higher F2 than the keyword checklist: **0.674 against 0.562**. The paired bootstrap 95% interval for the gap is **0.060 to 0.164**, entirely above zero, so the pre-registered success test is met.

## All methods (95% intervals in brackets, 2,000 bootstrap resamples)

| Method | Recall | Precision | F2 | Events with every category caught | Flags per event |
|---|---|---|---|---|---|
| Keyword checklist (today) | 55.5% (50.3 to 60.6) | 59.0% (54.5 to 63.7) | 0.562 (0.514 to 0.608) | 47.0% | 1.14 |
| SafeChange model | 82.6% (78.6 to 86.3) | 38.8% (35.9 to 41.6) | 0.674 (0.638 to 0.705) | 78.7% | 2.57 |
| Model + keywords | 89.5% (86.2 to 92.5) | 37.7% (35.2 to 40.1) | 0.703 (0.674 to 0.729) | 86.8% | 2.86 |
| Model, app gate setting | 13.9% (10.4 to 17.5) | 75.4% (65.8 to 85.0) | 0.167 (0.125 to 0.207) | 12.2% | 0.22 |
| App gate setting + keywords | 57.6% (52.5 to 62.7) | 58.0% (53.7 to 62.5) | 0.577 (0.530 to 0.623) | 49.8% | 1.20 |

## Per category (test set)

| Category | Events | Model recall | Model precision | Keyword recall | Keyword precision |
|---|---|---|---|---|---|
| dose | 35 | 77.1% | 28.7% | 77.1% | 42.9% |
| info | 123 | 95.9% | 50.6% | 53.7% | 64.1% |
| alarm | 47 | 93.6% | 30.3% | 66.0% | 75.6% |
| stop | 85 | 80.0% | 46.6% | 34.1% | 82.9% |
| comms | 35 | 82.9% | 25.9% | 51.4% | 45.0% |
| security | 22 | 45.5% | 62.5% | 90.9% | 100.0% |
| ui | 17 | 23.5% | 23.5% | 47.1% | 24.2% |
| power | 9 | 88.9% | 25.8% | 88.9% | 50.0% |

`power` has fewer than 10 test events, too few to judge.

## What failed, stated as plainly as what passed

1. **More flags.** The model raises 2.57 flags per event against 1.14 for keywords, so its precision is lower (38.8% against 59.0%).
2. **Security and user interface.** Keywords beat the model on `security` (recall 90.9% against 45.5%). Both are weak on `ui`.
3. **Pump recalls.** On the 30 infusion and insulin pump events, the model alone did **not** beat keywords (F2 0.543 against 0.630). Model plus keywords did best there (F2 0.652, recall 84.8%).
4. **The app gate setting is conservative.** At the evidence bar fixed before the test (amendment 1), the model alone catches only 13.9% of categories on recall text, at 75.4% precision. Combined with keywords it is about the same as keywords alone (F2 0.577).

## What this means for the app

- The **gate** stays conservative: the team's own watch list, plus the model only when the change's words give strong evidence (amendment 1). It should rarely block a harmless ticket.
- The model's wider reading, which caught 82.6% of hazard categories on unseen recalls, is shown as **"Also worth a look (not blocking)"** in the panel and in the Rovo agent's answers. This split was decided after the test, so it is a product choice, not a tested claim.

## Label quality

Two independent labelers (separate AI agent instances working only from `ml/CODEBOOK.md`) labelled every dev and test event, blind to each other and to the model. Cohen's kappa on the test set before adjudication:

| Category | dose | info | alarm | stop | comms | security | ui | power |
|---|---|---|---|---|---|---|---|---|
| Kappa | 0.92 | 0.899 | 0.921 | 0.944 | 0.969 | 1.0 | 0.813 | 0.872 |

They agreed on 425 of 484 dev and test events. A third adjudicator, blind to the model, decided the other 59.
