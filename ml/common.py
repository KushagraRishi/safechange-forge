"""Shared helpers for the SafeChange hazard model (see PREREGISTRATION.md)."""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATS = ["dose", "info", "alarm", "stop", "comms", "security", "ui", "power"]


def events():
    return {e["event"]: e for e in (json.loads(l) for l in open(ROOT / "data" / "events.jsonl"))}


def splits():
    return json.load(open(ROOT / "data" / "splits.json"))


def read_labels(path):
    out = {}
    for line in open(path):
        r = json.loads(line)
        labs = [l for l in r["labels"] if l != "none"]
        bad = [l for l in labs if l not in CATS]
        if bad:
            raise ValueError(f"{path}: unknown label {bad} on {r['event']}")
        out[r["event"]] = sorted(set(labs))
    return out


def gold(split):
    """Train: labeler D. Dev and test: adjudicated labels."""
    d = ROOT / "data" / "labels"
    if split == "train":
        return read_labels(d / "D_train.jsonl")
    return read_labels(d / "gold_devtest.jsonl")


def to_matrix(ids, labels):
    return [[1 if c in labels[i] else 0 for c in CATS] for i in ids]


# ---------- today's method: keyword checklist ----------

def _kw_regex(word):
    esc = re.escape(word.strip().lower()).replace(r"\ ", r"\s+")
    return re.compile(r"(?<![\w])" + esc + r"(?:e?s)?(?![\w])", re.I)


def baseline():
    kw = json.load(open(ROOT / "ml" / "baseline_keywords.json"))
    rx = {c: [_kw_regex(w) for w in kw[c]] for c in CATS}

    def predict(text):
        return [1 if any(r.search(text) for r in rx[c]) else 0 for c in CATS]

    return predict


# ---------- metrics ----------

def fbeta(tp, fp, fn, beta=2.0):
    b2 = beta * beta
    den = (1 + b2) * tp + b2 * fn + fp
    return (1 + b2) * tp / den if den else 0.0


def micro(y, p):
    tp = fp = fn = 0
    for yr, pr in zip(y, p):
        for a, b in zip(yr, pr):
            tp += a and b
            fp += (not a) and b
            fn += a and (not b)
    rec = tp / (tp + fn) if tp + fn else 0.0
    prec = tp / (tp + fp) if tp + fp else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "recall": rec, "precision": prec, "f2": fbeta(tp, fp, fn)}


def per_cat(y, p):
    out = {}
    for j, c in enumerate(CATS):
        out[c] = micro([[r[j]] for r in y], [[r[j]] for r in p])
        out[c]["support"] = sum(r[j] for r in y)
    return out


def caught_all(y, p):
    """Share of events with at least one label where every label was flagged."""
    rows = [(a, b) for a, b in zip(y, p) if any(a)]
    if not rows:
        return 0.0
    return sum(all(bb or not aa for aa, bb in zip(a, b)) for a, b in rows) / len(rows)


def flags_per_event(p):
    return sum(sum(r) for r in p) / len(p) if p else 0.0
