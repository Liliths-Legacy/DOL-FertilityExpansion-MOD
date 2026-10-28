import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from src import core
from src.package_archive import archive_previous_packages


class VersionedPackagesTest(unittest.TestCase):
    def test_repeated_builds_increment_patch_and_keep_latest_loader_path(self):
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
            with ZipFile(results / "Demo-v1.2.0-20261011-010101-000000.mod.zip", "w") as archive:
                archive.writestr("boot.json", json.dumps({"name": "Demo", "version": "1.2.0"}))
            with patch.multiple(core, **paths):
                for index, version in enumerate(["1.2.1", "1.2.2"]):
                    mod = core.GameMod()
                    work = results / "Demo"
                    work.mkdir()
                    (work / "boot.json").write_text(json.dumps({"name": "Demo", "version": "1.2.0"}))
                    (work / "payload.txt").write_text(str(index))
                    mod._boot_json = {"Demo": {}}
                    mod.package()
                    self.assertTrue((results / f"Demo-v{version}.mod.zip").exists())
                archives = [results / "Demo-v1.2.1.mod.zip", results / "Demo-v1.2.2.mod.zip"]
                for index, path in enumerate(archives):
                    with ZipFile(path) as archive:
                        self.assertEqual(str(index), archive.read("payload.txt").decode())
                        self.assertEqual(f"1.2.{index + 1}", json.loads(archive.read("boot.json"))["version"])
                latest = results / "Demo.mod.zip"
                self.assertEqual(archives[-1].read_bytes(), latest.read_bytes())
                self.assertEqual(["mods/Demo.mod.zip"], json.loads((paths["DIR_MODLOADER_ROOT"] / "modList.json").read_text()))
                core.GameMod()
                self.assertTrue(all(path.exists() for path in archives))
                self.assertFalse((results / "Demo").exists())

    def test_archived_versions_reserve_numbers_and_survive_worktree_cleanup(self):
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
            oldversion = results / "oldversion"
            oldversion.mkdir()
            old = oldversion / "Demo-v1.2.9-Lite.mod.zip"
            old.write_bytes(b"previous edition")
            with patch.multiple(core, **paths):
                for source, expected in [("1.0.0", "1.2.10"), ("1.0.0", "1.2.11"), ("1.7.0", "1.7.0"), ("1.7.0", "1.7.1")]:
                    mod = core.GameMod()
                    self.assertEqual(old.read_bytes(), b"previous edition")
                    work = results / "Demo"
                    work.mkdir()
                    (work / "boot.json").write_text(json.dumps({"name": "Demo", "version": source}))
                    mod._boot_json = {"Demo": {}}
                    archives = mod.package()
                    self.assertEqual(archives["Demo"].name, f"Demo-v{expected}.mod.zip")
                    archive_previous_packages(archives)
                self.assertTrue((oldversion / "Demo-v1.2.10.mod.zip").is_file())
                self.assertFalse((results / "Demo-v1.2.10.mod.zip").exists())
