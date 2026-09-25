import json
from pathlib import Path
import locale


""" PATHS """
DIR_ROOT = Path(__file__).parent.parent

DIR_DATA_ROOT = DIR_ROOT / "data"
DIR_CONFIGS_ROOT = DIR_ROOT / "configs"
DIR_LANGS_ROOT = DIR_DATA_ROOT / "langs"
DIR_MODS_ROOT = DIR_ROOT / "mods"
DIR_RESULTS_ROOT = DIR_ROOT / "results"
DIR_TEMP_ROOT = DIR_DATA_ROOT / "tmp"
GAME_VERSION = "0.5.11.9"
DIR_SOURCE_REPO = DIR_ROOT / f"degrees-of-lewdity-{GAME_VERSION}"
DIR_MODLOADER_ROOT = DIR_ROOT / "modloader"
DIR_MODLOADER_MODS = DIR_MODLOADER_ROOT / "mods"
FILE_DEV_CONFIG = DIR_CONFIGS_ROOT / "dev.json"

""" LANGS """
SYS_LANG = (locale.getdefaultlocale()[0]).lower()  # zh_cn
LANG_FILE = DIR_LANGS_ROOT / f"{SYS_LANG}.json"
LANG_FILE = LANG_FILE if LANG_FILE.exists() else DIR_LANGS_ROOT / "en_us.json"
with open(LANG_FILE, "r", encoding="utf-8") as fp:
    LANGS = json.load(fp)
with open(DIR_LANGS_ROOT / "en_us.json", "r", encoding="utf-8") as fp:
    DEFAULT_LANGS = json.load(fp)

""" SERVERS """
HOST = "127.0.0.1"
PORT = 52525

__all__ = [
    "DIR_ROOT",
    "DIR_SOURCE_REPO",
    "DIR_MODS_ROOT",
    "DIR_RESULTS_ROOT",
    "DIR_TEMP_ROOT",
    "DIR_DATA_ROOT",
    "DIR_CONFIGS_ROOT",
    "DIR_LANGS_ROOT",
    "DIR_MODLOADER_ROOT",
    "DIR_MODLOADER_MODS",
    "GAME_VERSION",
    "FILE_DEV_CONFIG",

    "LANGS",
    "DEFAULT_LANGS",

    "HOST",
    "PORT",
]
