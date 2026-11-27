"""Group software recall product records into recall events (one row per event).

One FDA recall event can cover many products with the same reason, so models are
trained and tested per event, never per product record, to avoid near duplicate
text leaking between train and test.
Writes data/events.jsonl.
"""
import json, pathlib, re, collections

ROOT = pathlib.Path(__file__).resolve().parent.parent

def clean(t):
    return re.sub(r"\s+", " ", (t or "")).strip()

def main():
    groups = collections.defaultdict(list)
    for line in open(ROOT / "data" / "raw" / "recalls_software.jsonl"):
        r = json.loads(line)
        key = r.get("res_event_number") or ("cfres:" + str(r.get("cfres_id")))
        groups[key].append(r)
    events = []
    for key, rs in groups.items():
        reasons = []
        for r in rs:
            c = clean(r.get("reason_for_recall"))
            if c and c not in reasons:
                reasons.append(c)
        dates = sorted(d for d in (r.get("event_date_initiated") for r in rs) if d)
        if not reasons or not dates:
            continue
        events.append({
            "event": key,
            "date": dates[0],
            "year": int(dates[0][:4]),
            "text": " ".join(reasons)[:4000],
            "product_codes": sorted({r.get("product_code") for r in rs if r.get("product_code")}),
            "root_causes": sorted({r.get("root_cause_description") for r in rs if r.get("root_cause_description")}),
            "firm": clean(rs[0].get("recalling_firm")),
            "device": clean((rs[0].get("device_name") or rs[0].get("product_description") or ""))[:160],
            "specialty": rs[0].get("medical_specialty"),
            "records": len(rs),
            "cfres_ids": sorted({str(r.get("cfres_id")) for r in rs if r.get("cfres_id")})[:20],
        })
    events.sort(key=lambda e: (e["date"], e["event"]))
    with open(ROOT / "data" / "events.jsonl", "w") as f:
        for e in events:
            f.write(json.dumps(e, sort_keys=True) + "\n")
    by_year = collections.Counter(e["year"] for e in events)
    print("events", len(events), "from records", sum(len(v) for v in groups.values()))
    print(sorted(by_year.items()))

if __name__ == "__main__":
    main()
