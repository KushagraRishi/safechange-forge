# Pre-registration: SafeChange hazard model

Written and committed on 2026-11-27, **before any label existed and before any model was trained**. The git commit that adds this file is the lock. Anything changed after the test run is reported as post hoc, next to the locked result.

## Question

Can a small model trained on FDA recall text flag which hazard categories a software problem touches better than today's method, a fixed safety keyword checklist?

## Data

- Source: openFDA device recall API, every record with `root_cause_description` containing "Software" (`ml/fetch_recalls.py`). 4,329 product records, openFDA data updated 2026-11-21, downloaded 2026-11-27.
- Unit: one recall **event** (records grouped by `res_event_number`, `ml/build_events.py`), so near duplicate product records never sit on both sides of a split. 2,737 events; 11 dropped for a broken date (year before 2000) or text under 20 characters: 2,726 kept.
- File hashes (SHA-256):
  - `data/raw/recalls_software.jsonl`: 9f5be9784eada46209a59498e6b194fcff22f343c17827ca9c5494dbf3951bab
  - `data/events.jsonl`: c3f4c4f20aae46e6003fdc9670be59a1a0348975d94cc24cfb25ed80c2f6bec8
  - `ml/baseline_keywords.json`: f7c165ebc238afb7e7df22a08daec23ab7df96ebf22df3029440c4d5ef5c089a
  - `ml/CODEBOOK.md`: 9e65b103d003d557bf77dd0322ed955c32969edfee4cf1c8f3e34473e623284d
  - `data/splits.json` (exact event ids per split, `ml/make_splits.py`): 5d35e8f34527a396261d463655b66b069f6d27fc9b77f5248ff4b751628c5d07

## Splits (by date, so the test is the future)

| Split | Events | Rule |
|---|---|---|
| Train | 700 | random sample (seed 20261127) of the 2,200 events dated 2007-01-01 to 2021-12-31 |
| Dev | 175 | every event dated 2022-01-01 to 2023-12-31 |
| Test | 309 | every event dated 2024-01-01 or later (latest 2026-10-12) |

The test events are never read while building the model, the baseline or the thresholds.

## Labels

- Categories and rules: `ml/CODEBOOK.md` (8 categories, multi-label, or `none`).
- Dev and test: two independent labelers (A and B) label every event, blind to each other, to the model and to the baseline. Disagreements go to a third adjudicator (C), who sees the two label sets and the codebook, but no model or baseline output.
- Train: one labeler (D).
- The labelers are separate AI agent instances working only from the codebook and the recall text. This is disclosed wherever results are shown.
- Agreement is reported per category on the test set as Cohen's kappa, before adjudication.

## Methods compared

1. **Baseline (today):** the keyword checklist in `ml/baseline_keywords.json`, as committed. Case-insensitive whole word match with simple plurals.
2. **SafeChange model:** TF-IDF on word unigrams and bigrams (lowercase, sublinear tf, min_df 2), then one logistic regression per category (class_weight balanced). C is chosen from {0.25, 0.5, 1, 2, 4, 8} by 5-fold cross-validation on train (mean F2). One threshold per category is chosen on dev to maximise F2 (grid 0.05 to 0.95, step 0.05). Trained on train only. That frozen model is what ships in the Forge app.
3. **Union (secondary):** a category is flagged if either 1 or 2 flags it.

## Endpoints

- **Primary:** micro-averaged F2 over the 8 categories on the test set, model against baseline. F2 weighs recall twice as much as precision, because a missed hazard is worse than an extra review.
- **Success** means the paired bootstrap 95% interval (2,000 resamples of test events, seed 7) for (model F2 minus baseline F2) lies entirely above 0. Anything else is reported as a failure of the primary claim.
- **Secondary**, all with bootstrap 95% intervals: micro recall, micro precision, flags per event (review load), share of events with every labelled category caught, per-category recall and precision, the union method, and the subgroup of infusion and insulin pump events (events whose device name contains "infusion" or "insulin", case-insensitive).

## What gets reported

Everything above, run once by `python3 ml/evaluate.py --final`, written to `logs/ml_test.json` with the git commit hash. Categories with fewer than 10 test examples are flagged as too small to judge. Failures are reported in the same place and the same size as successes.
