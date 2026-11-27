"""Download every openFDA device recall record whose root cause is software.

Source: https://api.fda.gov/device/recall.json (public, no key).
Writes data/raw/recalls_software.jsonl (one product record per line) and
data/raw/meta.json (query, total, openFDA last_updated, download time).
"""
import json, time, urllib.request, urllib.parse, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw"
QUERY = 'root_cause_description:"Software"'
FIELDS = ["cfres_id", "res_event_number", "product_res_number", "event_date_initiated", "event_date_posted",
          "recall_status", "product_code", "product_description", "reason_for_recall", "root_cause_description",
          "recalling_firm", "action", "product_quantity"]

def get(params):
    url = "https://api.fda.gov/device/recall.json?" + urllib.parse.urlencode(params, safe=':"+[]')
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # retry on rate limit or network errors
            time.sleep(2 + attempt * 3)
            last = e
    raise last

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    first = get({"search": QUERY, "limit": 1})
    total = first["meta"]["results"]["total"]
    rows, skip = [], 0
    while skip < total:
        page = get({"search": QUERY, "limit": 1000, "skip": skip})
        for r in page["results"]:
            rec = {k: r.get(k) for k in FIELDS}
            rec["device_name"] = (r.get("openfda") or {}).get("device_name")
            rec["medical_specialty"] = (r.get("openfda") or {}).get("medical_specialty_description")
            rows.append(rec)
        skip += 1000
        time.sleep(0.5)
    with open(OUT / "recalls_software.jsonl", "w") as f:
        for r in rows:
            f.write(json.dumps(r, sort_keys=True) + "\n")
    meta = {"query": QUERY, "total_reported": total, "downloaded": len(rows),
            "openfda_last_updated": first["meta"]["last_updated"],
            "downloaded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "source": "https://api.fda.gov/device/recall.json", "license": "https://open.fda.gov/license/"}
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta, indent=2))

if __name__ == "__main__":
    main()
