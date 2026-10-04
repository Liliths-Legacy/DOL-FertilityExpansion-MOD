import html
import json
import os
from pathlib import Path
import re
import unittest

from src.runtime_patches import select_runtime_patches, uses_pregnancy_records

ROOT = Path(__file__).resolve().parents[1]
BOOT = ROOT / "mods/FertilityExpansion/boot.json"


def passages(path):
    text = path.read_text(encoding="utf-8")
    return {html.unescape(name): html.unescape(body) for name, body in re.findall(
        r'<tw-passagedata\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)</tw-passagedata>', text
    )}


class RuntimePassageTest(unittest.TestCase):
    def test_selects_variants_without_mutating_source_or_shipping_build_metadata(self):
        source = json.loads(BOOT.read_text(encoding="utf-8"))
        before = json.dumps(source, ensure_ascii=False)
        old = select_runtime_patches(source, "0.5.11.9")
        new = select_runtime_patches(source, "0.5.12.13")
        self.assertEqual(9, len(old["addonPlugin"][0]["params"]))
        self.assertEqual(7, len(new["addonPlugin"][0]["params"]))
        self.assertNotIn("edenRecords", json.dumps(old))
        self.assertNotIn("edenRecords", json.dumps(new))
        self.assertEqual(before, json.dumps(source, ensure_ascii=False))
        self.assertFalse(uses_pregnancy_records("0.5.11.9"))
        self.assertTrue(uses_pregnancy_records("0.5.12.13"))
        with self.assertRaises(ValueError):
            uses_pregnancy_records("invalid")

    def test_all_selected_anchors_match_actual_html_once_in_both_versions(self):
        source = json.loads(BOOT.read_text(encoding="utf-8"))
        default_roots = {
            "0.5.11.9": ROOT.parent / "DoL-0.5.11.9-Lyra-1.0.0a-goose-0815/Degrees of Lewdity.html",
            "0.5.12.13": ROOT.parent / "DoL-0.5.12.13-Lyra-1.0.1a-goose-1004.1/Degrees of Lewdity.html",
        }
        for version, default in default_roots.items():
            runtime = Path(os.environ.get("DOL_0512_HTML" if version == "0.5.12.13" else "DOL_0511_HTML", default))
            if not runtime.exists():
                self.skipTest(f"Native HTML unavailable for {version}")
            native = passages(runtime)
            compiled = select_runtime_patches(source, version)
            for rule in compiled["addonPlugin"][0]["params"]:
                with self.subTest(version=version, passage=rule["passage"]):
                    self.assertEqual(1, native[rule["passage"]].count(rule["findString"]))
                    patched = native[rule["passage"]].replace(rule["findString"], rule["replace"], 1)
                    self.assertNotEqual(patched, native[rule["passage"]])
                    self.assertIn(rule["replace"], patched)
                    if uses_pregnancy_records(version):
                        self.assertNotIn("$children", rule["replace"])
                        self.assertNotIn("recordSperm", rule["replace"])
                        self.assertNotIn("pregnancyGenerator", rule["replace"])
            if uses_pregnancy_records(version):
                self.assertFalse(any(p["passage"] == "Widgets Orgasm" for p in compiled["addonPlugin"][0]["params"]))
                for genital, widget in [("hand", "takeHandholdingVirginity"), ("kiss", "takeKissVirginity")]:
                    rule = next(p for p in compiled["addonPlugin"][0]["params"] if p["passage"] == "Widgets Combat" and f'"{genital}"' in p["replace"])
                    body = native["Widgets Combat"]
                    start = body.index(f'<<widget "{widget}">>')
                    end = body.index("<</widget>>", start)
                    self.assertIn(rule["findString"], body[start:end])

    def test_remaining_interaction_pages_query_the_current_child_layer(self):
        for name in ["eden-interactions", "eden-bed-visit", "eden-encounter-dialogue"]:
            with self.subTest(page=name):
                content = (ROOT / f"mods/FertilityExpansion/game/{name}.twee").read_text(encoding="utf-8")
                self.assertNotIn("$children", content)
                self.assertIn("window.EdenChildData", content)


if __name__ == "__main__":
    unittest.main()
