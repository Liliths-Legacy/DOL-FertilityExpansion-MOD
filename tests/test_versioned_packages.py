import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from src import core


class VersionedPackagesTest(unittest.TestCase):
    def test_repeated_builds_preserve_archives_and_latest_loader_path(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            paths = {key: root / key for key in [
                "DIR_RESULTS_ROOT", "DIR_MODS_ROOT", "DIR_TEMP_ROOT",
                "DIR_MODLOADER_ROOT", "DIR_MODLOADER_MODS",
            ]}
            for path in paths.values():
                path.mkdir()
            (paths["DIR_MODS_ROOT"] / "Demo").mkdir()
            results = paths["DIR_RESULTS_ROOT"]
            legacy = results / "Demo.mod.zip"
            with ZipFile(legacy, "w") as archive:
                archive.writestr("boot.json", json.dumps({"name": "Demo", "version": "1.0.0"}))
            original = legacy.read_bytes()
            with patch.multiple(core, **paths):
                for index in range(2):
                    mod = core.GameMod()
                    work = results / "Demo"
                    work.mkdir()
                    (work / "boot.json").write_text(json.dumps({"name": "Demo", "version": "1.2.0"}))
                    (work / "payload.txt").write_text(str(index))
                    mod._boot_json = {"Demo": {}}
                    mod.package()
                archives = sorted(results.glob("Demo-v1.2.0-*.mod.zip"))
                self.assertEqual(2, len(archives))
                self.assertEqual(original, next(results.glob("*-legacy.mod.zip")).read_bytes())
                for index, path in enumerate(archives):
                    with ZipFile(path) as archive:
                        self.assertEqual(str(index), archive.read("payload.txt").decode())
                self.assertEqual(archives[-1].read_bytes(), legacy.read_bytes())
                self.assertEqual(["mods/Demo.mod.zip"], json.loads((paths["DIR_MODLOADER_ROOT"] / "modList.json").read_text()))
                core.GameMod()
                self.assertTrue(all(path.exists() for path in archives))
                self.assertFalse((results / "Demo").exists())
