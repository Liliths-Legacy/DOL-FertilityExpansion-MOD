import json
import re
from pathlib import Path

from .runtime_patches import select_runtime_patches
from .consts import DIR_MODS_ROOT, FILE_DEV_CONFIG, GAME_VERSION
from .runtime_game import development_config, runtime_directory, runtime_html, game_version, game_passages


PASSAGE_PATTERN = re.compile(r"^::\s*([^\[\r\n]+?)(?:\s+\[[^\]]*\])?\s*$", re.MULTILINE)


def _source_passages():
    return game_passages(runtime_html(development_config()).read_text(encoding="utf-8"))


def validate_environment():
    errors = []
    warnings = []

    if not FILE_DEV_CONFIG.is_file():
        return [f"Missing development config: {FILE_DEV_CONFIG}"], warnings

    config = development_config()
    runtime_dir = runtime_directory(config)
    game_html = runtime_html(config)

    if not game_html.is_file():
        errors.append(f"Game HTML not found: {game_html}")
    else:
        actual_version = game_version(game_html.read_text(encoding="utf-8"))
        if actual_version != config.get("game_version"):
            errors.append(f"Game HTML version {actual_version!r} differs from development target {config.get('game_version')!r}")
    if config.get("game_version") != GAME_VERSION:
        errors.append(f"Development target differs from pinned source version {GAME_VERSION}")
    if not (runtime_dir / "img").is_dir():
        errors.append(f"Image directory not found: {runtime_dir / 'img'}")
    if not DIR_MODS_ROOT.is_dir():
        errors.append(f"Mods directory not found: {DIR_MODS_ROOT}")

    return errors, warnings


def validate_mods():
    errors = []
    warnings = []
    passages = _source_passages()

    for mod_dir in sorted(path for path in DIR_MODS_ROOT.iterdir() if path.is_dir()):
        boot_path = mod_dir / "boot.json"
        if not boot_path.is_file():
            errors.append(f"{mod_dir.name}: missing boot.json")
            continue
        try:
            boot = json.loads(boot_path.read_text(encoding="utf-8"))
            config = json.loads(FILE_DEV_CONFIG.read_text(encoding="utf-8"))
            boot = select_runtime_patches(boot, config["game_version"])
        except json.JSONDecodeError as error:
            errors.append(f"{mod_dir.name}: invalid boot.json: {error}")
            continue

        if not boot.get("name"):
            errors.append(f"{mod_dir.name}: boot.json has no name")
        if not boot.get("version"):
            errors.append(f"{mod_dir.name}: boot.json has no version")

        declared_paths = {
            item
            for key in (
                "styleFileList", "scriptFileList", "tweeFileList", "imgFileList",
                "scriptFileList_inject_early", "scriptFileList_earlyload",
                "scriptFileList_preload", "additionFile",
            )
            for item in boot.get(key, [])
        }
        for relative in sorted(declared_paths):
            candidate = Path(relative)
            if candidate.is_absolute() or ".." in candidate.parts:
                errors.append(f"{mod_dir.name}: unsafe path in boot.json: {relative}")
            elif not (mod_dir / candidate).is_file():
                errors.append(f"{mod_dir.name}: declared file not found: {relative}")

        for addon in boot.get("addonPlugin", []):
            if addon.get("modName") != "TweeReplacer":
                continue
            for parameter in addon.get("params", []):
                passage_name = parameter.get("passage")
                source = passages.get(passage_name)
                if source is None:
                    errors.append(f"{mod_dir.name}: source passage not found: {passage_name}")
                    continue
                find_string = parameter.get("findString")
                if find_string and source.count(find_string) != 1:
                    errors.append(
                        f"{mod_dir.name}: expected one findString match in passage {passage_name}, found {source.count(find_string)}: {find_string}"
                    )
                replace_file = parameter.get("replaceFile")
                if replace_file and not (mod_dir / replace_file).is_file():
                    errors.append(f"{mod_dir.name}: replaceFile not found: {replace_file}")

        mod_passages = {}
        for twee_file in mod_dir.rglob("*.twee"):
            text = twee_file.read_text(encoding="utf-8", errors="replace")
            for name in PASSAGE_PATTERN.findall(text):
                name = name.strip()
                if name in mod_passages:
                    errors.append(
                        f"{mod_dir.name}: duplicate passage {name} in {mod_passages[name]} and {twee_file}"
                    )
                mod_passages[name] = twee_file

    return errors, warnings


def validate_all():
    environment_errors, environment_warnings = validate_environment()
    if environment_errors:
        return environment_errors, environment_warnings
    mod_errors, mod_warnings = validate_mods()
    return environment_errors + mod_errors, environment_warnings + mod_warnings
