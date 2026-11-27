# Limits

What SafeChange does not do, and where its numbers stop. Read this before trusting a result.

## The model
- **It reads recall text, not code.** It was trained on 700 and tested on 309 FDA recall events (`ml/RESULTS.md`). Jira tickets are shorter and often harmless, which recall text never is. That is why the gate uses a stricter setting in the app (`ml/PREREGISTRATION.md`, amendment 1).
- **At the app's gate setting it is conservative.** On the test recalls it caught 13.9% of hazard categories alone. Most of the gate's work is done by the team's own watch list; the model's wider reading is shown as non-blocking suggestions.
- **It flags a lot at full sensitivity.** 2.57 flags per recall against 1.14 for keywords.
- **Keywords win on security**, and both are weak on user interface problems. On the 30 pump recalls the model alone did not beat keywords.
- **Labels come from AI labelers**, two independent agents plus an adjudicator, working from a written codebook. Agreement was high (kappa 0.81 to 1.00 on the test set), but no human expert checked every label.
- **Small categories:** `power` has 9 test events, too few to judge.
- **English only.** The tokenizer and the training data are English.

## The rules and the gate
- **Files come from the ticket text.** SafeChange reads file paths written in the issue description ("Files changed: ..."). It does not read pull requests yet.
- **The watch list is only as good as the team writes it.** A hazard with an empty Watches column can only be found by the model, and only if the log gives it a Category.
- **The gate checks a linked test's status, not its content.** A test moved to Done counts as passed.
- **A review is tied to the ticket's text, components, labels and listed files.** Changing other fields (assignee, priority) does not make it stale, by design.
- **The validator must be added to the workflow by an admin** (one rule on the transition into Done).
- **Release check and the safety record read up to 50 issues** per query.

## The 30 sample changes
- `logs/evaluate.log` scores the rule matcher on 30 changes I wrote and labelled myself. It shows the matcher works as designed. It is not an independent test; the locked test on FDA recalls is.

## Not medical or regulatory advice
SafeChange helps a team follow its own risk process. It does not replace the team's risk management under ISO 14971 or IEC 62304, and openFDA data comes with FDA's own disclaimer: "Do not rely on openFDA to make decisions regarding medical care."
