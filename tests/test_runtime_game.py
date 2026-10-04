import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from src.consts import DIR_ROOT
from src.runtime_game import game_passages, game_version, runtime_directory
from src.validator import validate_environment, validate_mods


class RuntimeGameTest(unittest.TestCase):
    def test_relative_runtime_is_independent_of_working_directory(self):
        previous = Path.cwd()
        try:
            with tempfile.TemporaryDirectory() as directory:
                os.chdir(directory)
                self.assertEqual((DIR_ROOT / '../game').resolve(), runtime_directory({'runtime_dir': '../game'}))
        finally:
            os.chdir(previous)

    def test_html_passages_are_decoded_and_version_is_the_native_game_version(self):
        text = '<script>const loader = {version: "2.101.1"}; const StartConfig = {version: "0.5.12.13"};</script><tw-passagedata name="Test &amp; Page">&lt;&lt;set $n to 0&gt;&gt;</tw-passagedata>'
        self.assertEqual('0.5.12.13', game_version(text))
        self.assertEqual({'Test & Page': '<<set $n to 0>>'}, game_passages(text))
        self.assertIsNone(game_version('const loader = {version: "2.101.1"};'))

    def test_wrong_runtime_version_blocks_a_build(self):
        with patch('src.validator.game_version', return_value='0.5.11.9'):
            errors, _ = validate_environment()
        self.assertTrue(any('differs from development target' in error for error in errors))

    def test_ambiguous_replacement_anchor_blocks_a_build(self):
        from src.validator import _source_passages
        native = _source_passages()
        native['StoryCaption'] *= 2
        with patch('src.validator._source_passages', return_value=native):
            errors, _ = validate_mods()
        self.assertTrue(any('StoryCaption, found 2' in error for error in errors))


if __name__ == '__main__':
    unittest.main()
