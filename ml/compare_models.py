"""Fail if a retrained model differs from the shipped one (reproducibility check)."""
import json, sys

a, b = (json.load(open(p)) for p in sys.argv[1:3])
for key in ["categories", "terms", "thresholds", "C"]:
    assert a[key] == b[key], f"{key} differs after retraining"
for c in a["categories"]:
    if a["coef"][c] is None:
        assert b["coef"][c] is None, c
        continue
    worst = max(abs(x - y) for x, y in zip(a["coef"][c], b["coef"][c]))
    assert worst < 1e-4, f"{c}: coefficients differ by {worst}"
    assert abs(a["intercept"][c] - b["intercept"][c]) < 1e-4, c
print("Retrained model matches the shipped model.")
