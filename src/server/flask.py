import json
from pathlib import Path

from flask import Flask, jsonify, send_file, send_from_directory

from ..consts import DIR_MODLOADER_ROOT, DIR_MODLOADER_MODS, FILE_DEV_CONFIG


with FILE_DEV_CONFIG.open("r", encoding="utf-8") as fp:
    DEV_CONFIG = json.load(fp)

RUNTIME_DIR = Path(DEV_CONFIG["runtime_dir"]).expanduser().resolve()
GAME_HTML = RUNTIME_DIR / DEV_CONFIG.get("html", "Degrees of Lewdity.html")
IMAGE_DIR = RUNTIME_DIR / "img"

app = Flask("test-modloader", root_path=DIR_MODLOADER_ROOT, static_folder=None)


@app.route("/")
def main():
    return send_file(GAME_HTML)


@app.route("/modList.json")
def mod_list():
    response = send_file(DIR_MODLOADER_ROOT / "modList.json")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/mods/<path:filename>")
def mods(filename):
    response = send_from_directory(DIR_MODLOADER_MODS, filename)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/img/<path:filename>")
def images(filename):
    return send_from_directory(IMAGE_DIR, filename)


@app.route("/health")
def health():
    return jsonify({
        "ok": GAME_HTML.is_file(),
        "game": str(GAME_HTML),
        "version": DEV_CONFIG.get("game_version"),
    })


@app.route("/<path:filename>")
def runtime_file(filename):
    return send_from_directory(RUNTIME_DIR, filename)
