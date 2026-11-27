"""Tests for the data pipeline, splits, baseline and metrics.
Run: ml/.venv/bin/python -m unittest discover -s ml -p "test_*.py"
"""
import json, re, unittest, random, hashlib
from common import ROOT, CATS, events, splits, baseline, micro, fbeta, caught_all, flags_per_event, per_cat, read_labels


class Data(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ev = events()
        cls.sp = splits()
        cls.raw = [json.loads(l) for l in open(ROOT / "data" / "raw" / "recalls_software.jsonl")]
        cls.meta = json.load(open(ROOT / "data" / "raw" / "meta.json"))

    def test_every_record_downloaded(self):
        self.assertEqual(len(self.raw), self.meta["total_reported"])

    def test_every_record_is_software(self):
        self.assertTrue(all("software" in (r["root_cause_description"] or "").lower() for r in self.raw))

    def test_events_cover_every_record_with_a_reason(self):
        n = sum(e["records"] for e in self.ev.values())
        self.assertLessEqual(n, len(self.raw))
        self.assertGreater(n, len(self.raw) * 0.99)

    def test_event_ids_unique(self):
        self.assertEqual(len(self.ev), len(set(self.ev)))

    def test_split_sizes_match_preregistration(self):
        self.assertEqual({k: len(v) for k, v in self.sp.items()}, {"train": 700, "dev": 175, "test": 309})

    def test_splits_do_not_overlap(self):
        a, b, c = map(set, (self.sp["train"], self.sp["dev"], self.sp["test"]))
        self.assertFalse(a & b or a & c or b & c)

    def test_split_dates(self):
        self.assertTrue(all("2007-01-01" <= self.ev[i]["date"] <= "2021-12-31" for i in self.sp["train"]))
        self.assertTrue(all("2022-01-01" <= self.ev[i]["date"] <= "2023-12-31" for i in self.sp["dev"]))
        self.assertTrue(all(self.ev[i]["date"] >= "2024-01-01" for i in self.sp["test"]))

    def test_test_is_every_event_from_2024(self):
        expect = {k for k, e in self.ev.items() if e["date"] >= "2024-01-01" and len(e["text"]) >= 20}
        self.assertEqual(set(self.sp["test"]), expect)

    def test_train_sample_is_reproducible(self):
        ok = [e for e in sorted(self.ev.values(), key=lambda e: (e["date"], e["event"])) if e["year"] >= 2000 and len(e["text"]) >= 20]
        pool = [e["event"] for e in ok if "2007-01-01" <= e["date"] <= "2021-12-31"]
        self.assertEqual(sorted(random.Random(20261127).sample(pool, 700)), self.sp["train"])

    def test_locked_file_hashes(self):
        pre = open(ROOT / "ml" / "PREREGISTRATION.md").read()
        for path in ["data/raw/recalls_software.jsonl", "data/events.jsonl", "ml/baseline_keywords.json", "ml/CODEBOOK.md", "data/splits.json"]:
            h = hashlib.sha256(open(ROOT / path, "rb").read()).hexdigest()
            self.assertIn(h, pre, f"{path} changed after the pre-registration")

    def test_codebook_lists_every_category(self):
        book = open(ROOT / "ml" / "CODEBOOK.md").read()
        for c in CATS:
            self.assertIn(f"`{c}`", book)

    def test_js_and_python_categories_match(self):
        js = open(ROOT / "src" / "core" / "model.js").read()
        m = re.search(r"CATEGORIES = \[([^\]]+)\]", js)
        self.assertEqual(re.findall(r"'(\w+)'", m.group(1)), CATS)


class Labels(unittest.TestCase):
    def check(self, name, n):
        path = ROOT / "data" / "labels" / name
        lines = [json.loads(l) for l in open(path)]
        self.assertEqual(len(lines), n)
        self.assertEqual(len({l["event"] for l in lines}), n)
        for l in lines:
            self.assertTrue(l["labels"], l)
            if "none" in l["labels"]:
                self.assertEqual(l["labels"], ["none"])
            for c in l["labels"]:
                self.assertIn(c, CATS + ["none"])
        read_labels(path)

    def test_labeler_A(self):
        self.check("A_devtest.jsonl", 484)

    def test_labeler_B(self):
        self.check("B_devtest.jsonl", 484)

    def test_labeler_D(self):
        self.check("D_train.jsonl", 700)

    def test_gold_covers_dev_and_test(self):
        g = read_labels(ROOT / "data" / "labels" / "gold_devtest.jsonl")
        sp = splits()
        self.assertEqual(set(g), set(sp["dev"]) | set(sp["test"]))

    def test_gold_equals_agreement_or_adjudication(self):
        A = read_labels(ROOT / "data" / "labels" / "A_devtest.jsonl")
        B = read_labels(ROOT / "data" / "labels" / "B_devtest.jsonl")
        C = read_labels(ROOT / "data" / "labels" / "C_adjudicated.jsonl")
        G = read_labels(ROOT / "data" / "labels" / "gold_devtest.jsonl")
        for k, v in G.items():
            self.assertEqual(v, A[k] if A[k] == B[k] else C[k], k)


class Baseline(unittest.TestCase):
    def setUp(self):
        self.p = baseline()

    def flags(self, text):
        return [c for c, v in zip(CATS, self.p(text)) if v]

    def test_whole_words(self):
        self.assertEqual(self.flags("The alarm may not sound"), ["alarm"])
        self.assertEqual(self.flags("alarms"), ["alarm"])
        self.assertEqual(self.flags("alarmed"), [])

    def test_phrases(self):
        self.assertIn("stop", self.flags("the system may shut  down"))
        self.assertIn("info", self.flags("an incorrect result is shown"))

    def test_case_insensitive(self):
        self.assertIn("security", self.flags("CYBERSECURITY VULNERABILITY"))

    def test_no_part_words(self):
        self.assertEqual(self.flags("redosing"), [])
        self.assertNotIn("power", self.flags("powerful"))

    def test_empty(self):
        self.assertEqual(self.flags(""), [])

    def test_keyword_file_has_every_category(self):
        kw = json.load(open(ROOT / "ml" / "baseline_keywords.json"))
        self.assertEqual(sorted(k for k in kw if not k.startswith("_")), sorted(CATS))


class Metrics(unittest.TestCase):
    def test_fbeta_known_values(self):
        self.assertAlmostEqual(fbeta(1, 0, 0), 1.0)
        self.assertAlmostEqual(fbeta(0, 1, 1), 0.0)
        self.assertAlmostEqual(fbeta(0, 0, 0), 0.0)
        # precision 0.5, recall 1: F2 = 5*0.5*1/(4*0.5+1) = 0.8333
        self.assertAlmostEqual(fbeta(1, 1, 0), 5 * 0.5 / 3)

    def test_micro_counts(self):
        y = [[1, 0], [1, 1], [0, 0]]
        p = [[1, 1], [0, 1], [0, 0]]
        m = micro(y, p)
        self.assertEqual((m["tp"], m["fp"], m["fn"]), (2, 1, 1))
        self.assertAlmostEqual(m["recall"], 2 / 3)
        self.assertAlmostEqual(m["precision"], 2 / 3)

    def test_caught_all(self):
        y = [[1, 1], [1, 0], [0, 0]]
        p = [[1, 0], [1, 1], [1, 1]]
        self.assertAlmostEqual(caught_all(y, p), 0.5)

    def test_flags_per_event(self):
        self.assertAlmostEqual(flags_per_event([[1, 1], [0, 0]]), 1.0)
        self.assertEqual(flags_per_event([]), 0.0)

    def test_per_category_support(self):
        y = [[1] + [0] * 7, [1] + [0] * 7]
        pc = per_cat(y, [[0] * 8, [1] + [0] * 7])
        self.assertEqual(pc["dose"]["support"], 2)
        self.assertAlmostEqual(pc["dose"]["recall"], 0.5)

    def test_perfect_and_empty_predictions(self):
        y = [[1, 0, 1], [0, 1, 0]]
        self.assertEqual(micro(y, y)["f2"], 1.0)
        self.assertEqual(micro(y, [[0, 0, 0], [0, 0, 0]])["recall"], 0.0)


if __name__ == "__main__":
    unittest.main()
