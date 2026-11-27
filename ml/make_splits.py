"""Fix the train, dev and test event ids exactly as PREREGISTRATION.md says."""
import json, pathlib, random

ROOT = pathlib.Path(__file__).resolve().parent.parent

def main():
    ev = [json.loads(l) for l in open(ROOT / "data" / "events.jsonl")]
    ok = [e for e in ev if e["year"] >= 2000 and len(e["text"]) >= 20]
    pool = [e["event"] for e in ok if "2007-01-01" <= e["date"] <= "2021-12-31"]
    rng = random.Random(20261127)
    train = sorted(rng.sample(pool, 700))
    dev = [e["event"] for e in ok if "2022-01-01" <= e["date"] <= "2023-12-31"]
    test = [e["event"] for e in ok if e["date"] >= "2024-01-01"]
    out = {"train": train, "dev": dev, "test": test}
    (ROOT / "data" / "splits.json").write_text(json.dumps(out, indent=1) + "\n")
    print({k: len(v) for k, v in out.items()})

if __name__ == "__main__":
    main()
