"""Evaluate the frozen model (src/core/model.json) against today's method.

  python3 ml/evaluate.py --dev     # allowed any time, dev split only
  python3 ml/evaluate.py --final   # the locked test run (PREREGISTRATION.md); writes logs/ml_test.json

The model is scored from model.json itself (the file the Forge app ships), not
from the scikit-learn objects, so the numbers describe exactly what users get.
"""
import json, math, random, re, subprocess, sys, datetime
from common import ROOT, CATS, events, splits, gold, read_labels, to_matrix, baseline, micro, per_cat, caught_all, flags_per_event

TOKEN = re.compile(r"(?u)\b\w\w+\b")


class Frozen:
    def __init__(self, path=ROOT / "src" / "core" / "model.json"):
        m = json.load(open(path))
        self.m = m
        self.index = {t: i for i, t in enumerate(m["terms"])}

    def features(self, text):
        toks = TOKEN.findall(text.lower())
        grams = toks + [a + " " + b for a, b in zip(toks, toks[1:])]
        tf = {}
        for g in grams:
            i = self.index.get(g)
            if i is not None:
                tf[i] = tf.get(i, 0) + 1
        x = {i: (1 + math.log(c)) * self.m["idf"][i] for i, c in tf.items()}
        norm = math.sqrt(sum(v * v for v in x.values())) or 1.0
        return {i: v / norm for i, v in x.items()}

    def proba(self, text):
        x = self.features(text)
        out = []
        for c in CATS:
            w = self.m["coef"][c]
            if w is None:
                out.append(0.0)
                continue
            z = self.m["intercept"][c] + sum(v * w[i] for i, v in x.items())
            out.append(1 / (1 + math.exp(-z)))
        return out

    def evidence(self, text):
        x = self.features(text)
        return [sum(v * self.m["coef"][c][i] for i, v in x.items()) if self.m["coef"][c] is not None else 0.0 for c in CATS]

    def predict(self, text):
        return [1 if p >= self.m["thresholds"][c] else 0 for p, c in zip(self.proba(text), CATS)]

    def predict_app(self, text, min_evidence=0.5):
        """The app operating point (PREREGISTRATION.md amendment 1)."""
        return [1 if (f and e >= min_evidence) else 0 for f, e in zip(self.predict(text), self.evidence(text))]


def kappa(a, b):
    n = len(a)
    po = sum(x == y for x, y in zip(a, b)) / n
    pa, pb = sum(a) / n, sum(b) / n
    pe = pa * pb + (1 - pa) * (1 - pb)
    return (po - pe) / (1 - pe) if pe < 1 else 1.0


def bootstrap(y, preds, B=2000, seed=7):
    """Paired bootstrap over events. preds: dict name -> matrix."""
    rng = random.Random(seed)
    n = len(y)
    keys = ["recall", "precision", "f2"]
    samples = {k: {m: [] for m in keys} for k in preds}
    samples["diff_f2_model_minus_baseline"] = []
    samples["caught_all"] = {k: [] for k in preds}
    samples["flags"] = {k: [] for k in preds}
    for _ in range(B):
        idx = [rng.randrange(n) for _ in range(n)]
        yy = [y[i] for i in idx]
        f2 = {}
        for name, p in preds.items():
            pp = [p[i] for i in idx]
            r = micro(yy, pp)
            for m in keys:
                samples[name][m].append(r[m])
            samples["caught_all"][name].append(caught_all(yy, pp))
            samples["flags"][name].append(flags_per_event(pp))
            f2[name] = r["f2"]
        samples["diff_f2_model_minus_baseline"].append(f2["model"] - f2["baseline"])

    def ci(v):
        v = sorted(v)
        return [round(v[int(0.025 * len(v))], 4), round(v[int(0.975 * len(v)) - 1], 4)]

    out = {name: {m: ci(samples[name][m]) for m in keys} for name in preds}
    for name in preds:
        out[name]["caught_all"] = ci(samples["caught_all"][name])
        out[name]["flags_per_event"] = ci(samples["flags"][name])
    out["diff_f2_model_minus_baseline"] = ci(samples["diff_f2_model_minus_baseline"])
    return out


def score(split, ids, ev, labels, model, base):
    y = to_matrix(ids, labels)
    texts = [ev[i]["text"] for i in ids]
    pm = [model.predict(t) for t in texts]
    pb = [base(t) for t in texts]
    pu = [[a | b for a, b in zip(r1, r2)] for r1, r2 in zip(pm, pb)]
    pa = [model.predict_app(t) for t in texts]
    pau = [[a | b for a, b in zip(r1, r2)] for r1, r2 in zip(pa, pb)]
    preds = {"model": pm, "baseline": pb, "union": pu, "model_app": pa, "union_app": pau}
    res = {name: {**micro(y, p), "caught_all": caught_all(y, p), "flags_per_event": flags_per_event(p),
                  "per_category": per_cat(y, p)} for name, p in preds.items()}
    return y, preds, res


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--dev"
    ev, sp = events(), splits()
    model, base = Frozen(), baseline()
    split = "test" if mode == "--final" else "dev"
    ids = sp[split]
    labels = gold(split)
    missing = [i for i in ids if i not in labels]
    if missing:
        raise SystemExit(f"{len(missing)} {split} events have no gold label")
    y, preds, res = score(split, ids, ev, labels, model, base)
    out = {"split": split, "events": len(ids), "label_counts": {c: sum(r[j] for r in y) for j, c in enumerate(CATS)},
           "events_with_no_label": sum(1 for r in y if not any(r)), "results": res,
           "ci95": bootstrap(y, preds)}
    out["primary_success"] = out["ci95"]["diff_f2_model_minus_baseline"][0] > 0
    pump = [k for k, i in enumerate(ids) if re.search(r"infusion|insulin", ev[i]["device"] or "", re.I)]
    if pump:
        sub_y = [y[k] for k in pump]
        out["subgroup_infusion_insulin"] = {"events": len(pump), **{n: micro(sub_y, [p[k] for k in pump]) for n, p in preds.items()}}
    # labeler agreement before adjudication
    A = read_labels(ROOT / "data" / "labels" / "A_devtest.jsonl")
    Bl = read_labels(ROOT / "data" / "labels" / "B_devtest.jsonl")
    out["kappa_A_vs_B"] = {c: round(kappa([int(c in A[i]) for i in ids], [int(c in Bl[i]) for i in ids]), 3) for c in CATS}
    out["small_categories"] = [c for c in CATS if out["label_counts"][c] < 10]
    out["misses"] = [{"event": i, "gold": labels[i], "model": [c for c, v in zip(CATS, preds["model"][k]) if v],
                      "text": ev[i]["text"][:240]}
                     for k, i in enumerate(ids) if any(a and not b for a, b in zip(y[k], preds["model"][k]))][:40]
    out["commit"] = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    out["run_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    name = "ml_test.json" if split == "test" else "ml_dev.json"
    if split == "test" and (ROOT / "logs" / name).exists() and "--again" not in sys.argv:
        raise SystemExit("The locked test was already run. Its result stands (logs/ml_test.json). Use --again only for a post hoc rerun, and report it as post hoc.")
    (ROOT / "logs" / name).write_text(json.dumps(out, indent=2) + "\n")
    s = out["results"]
    print(json.dumps({k: {m: round(s[k][m], 3) for m in ("recall", "precision", "f2", "caught_all", "flags_per_event")} for k in s}, indent=1))
    print("ci95", json.dumps(out["ci95"]["diff_f2_model_minus_baseline"]), "primary_success", out["primary_success"])
    print("kappa", out["kappa_A_vs_B"])


if __name__ == "__main__":
    main()
