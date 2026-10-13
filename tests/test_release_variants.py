import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from src.release_variants import build_fertility_expansion_variants


class ReleaseVariantsTest(unittest.TestCase):
    def test_lite_excludes_large_art_and_switches_to_text_presentation(self):
        with TemporaryDirectory() as directory:
            archive = Path(directory) / "FertilityExpansion-v1.2.3.mod.zip"
            boot = {
                "name": "FertilityExpansion",
                "edition": "visual",
                "imgFileList": [
                    "img/background/eden/hall.png",
                    "img/furniture/eden/rug.png",
                    "img/misc/icon/eden.png",
                ],
            }
            marker = ';window.EdenEdition = Object.freeze({ kind: "visual", usesLargeArtwork: true });'
            with ZipFile(archive, "w") as package:
                package.writestr("boot.json", json.dumps(boot))
                package.writestr("modules/eden-edition.js", marker)
                package.writestr("img/background/eden/hall.png", b"large")
                package.writestr("img/furniture/eden/rug.png", b"large")
                package.writestr("img/misc/icon/eden.png", b"small")

            visual, lite = build_fertility_expansion_variants(archive)
            self.assertEqual(archive.read_bytes(), visual.read_bytes())
            with ZipFile(lite) as package:
                self.assertNotIn("img/background/eden/hall.png", package.namelist())
                self.assertNotIn("img/furniture/eden/rug.png", package.namelist())
                self.assertIn("img/misc/icon/eden.png", package.namelist())
                lite_boot = json.loads(package.read("boot.json"))
                self.assertEqual("lite", lite_boot["edition"])
                self.assertEqual(["img/misc/icon/eden.png"], lite_boot["imgFileList"])
                self.assertIn("usesLargeArtwork: false", package.read("modules/eden-edition.js").decode())


if __name__ == "__main__":
    unittest.main()
