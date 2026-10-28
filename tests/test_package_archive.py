from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

from src.package_archive import archive_previous_packages


class PackageArchiveTest(unittest.TestCase):
    def test_keeps_current_editions_and_alias_and_archives_legacy_names(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            current = root / "Demo-v1.2.3.mod.zip"
            variants = tuple(root / f"Demo-v1.2.3-{edition}.mod.zip" for edition in ["Visual", "Lite"])
            keep = [current, *variants, root / "Demo.mod.zip", root / "Other-v1.0.0.mod.zip"]
            old = [root / name for name in ["Demo-v1.2.2.mod.zip", "Demo-v1.2.2-Lite.mod.zip", "Demo-v1.2.0-20261011-010101.mod.zip"]]
            for p in [*keep, *old]:
                p.write_bytes(p.name.encode())
            moved = archive_previous_packages({"Demo": current}, variants)
            self.assertEqual(len(moved), len(old))
            self.assertTrue(all(p.exists() for p in keep))
            self.assertTrue(all(not p.exists() for p in old))
            for p in old:
                self.assertEqual((root / "oldversion" / p.name).read_bytes(), p.name.encode())
            self.assertEqual(archive_previous_packages({"Demo": current}, variants), [])

    def test_collision_preserves_both_files(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "oldversion").mkdir()
            old = root / "Demo-v1.0.0.mod.zip"
            previous = root / "oldversion" / old.name
            previous.write_bytes(b"first")
            old.write_bytes(b"second")
            current = root / "Demo-v1.0.1.mod.zip"
            current.write_bytes(b"current")
            moved = archive_previous_packages({"Demo": current})
            self.assertEqual(previous.read_bytes(), b"first")
            self.assertEqual(moved[0].read_bytes(), b"second")
            self.assertNotEqual(previous, moved[0])

    def test_missing_current_edition_does_not_move_anything(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            old = root / "Demo-v1.0.0.mod.zip"
            old.write_bytes(b"old")
            current = root / "Demo-v1.0.1.mod.zip"
            current.write_bytes(b"new")
            with self.assertRaises(FileNotFoundError):
                archive_previous_packages({"Demo": current}, (root / "missing.mod.zip",))
            self.assertTrue(old.exists())
            self.assertFalse((root / "oldversion").exists())

    def test_build_only_archives_after_variants_succeed(self):
        import main

        mod = Mock()
        archives = {"FertilityExpansion": Path("current.mod.zip")}
        mod.package.return_value = archives
        variants = (Path("visual.mod.zip"), Path("lite.mod.zip"))
        with patch.object(main, "check"), patch.object(main, "GameMod", return_value=mod), \
             patch.object(main, "build_fertility_expansion_variants", side_effect=ValueError("failed")), \
             patch.object(main, "archive_previous_packages") as archive:
            with self.assertRaises(ValueError):
                main.build()
            archive.assert_not_called()
        with patch.object(main, "check"), patch.object(main, "GameMod", return_value=mod), \
             patch.object(main, "build_fertility_expansion_variants", return_value=variants), \
             patch.object(main, "archive_previous_packages") as archive:
            main.build()
            archive.assert_called_once_with(archives, variants)
