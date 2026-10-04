"""Read the exact local game used by the development server and build checks."""
import html
import json
import re
from pathlib import Path

from .consts import DIR_ROOT, FILE_DEV_CONFIG


def development_config():
    return json.loads(FILE_DEV_CONFIG.read_text(encoding="utf-8"))


def runtime_directory(config):
    path = Path(config["runtime_dir"]).expanduser()
    return (path if path.is_absolute() else DIR_ROOT / path).resolve()


def runtime_html(config):
    return runtime_directory(config) / config.get("html", "Degrees of Lewdity.html")


def game_version(text):
    match = re.search(r'const StartConfig\s*=\s*\{[\s\S]*?\bversion:\s*"([^"]+)"', text)
    return match.group(1) if match else None


def game_passages(text):
    return {
        html.unescape(name): html.unescape(body)
        for name, body in re.findall(
            r'<tw-passagedata\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)</tw-passagedata>', text
        )
    }
