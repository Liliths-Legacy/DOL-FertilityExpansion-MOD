"""Choose build-time passage replacements for the target game schema."""
import copy
import re


def uses_pregnancy_records(version):
    parts = tuple(int(part) for part in re.findall(r"\d+", str(version))[:3])
    if len(parts) < 3:
        raise ValueError(f"Invalid game version: {version}")
    return parts >= (0, 5, 12)


def select_runtime_patches(boot, game_version):
    result = copy.deepcopy(boot)
    records = uses_pregnancy_records(game_version)
    for addon in result.get("addonPlugin", []):
        if addon.get("modName") != "TweeReplacer":
            continue
        selected = []
        for parameter in addon.get("params", []):
            if "edenRecords" in parameter:
                variant = parameter.pop("edenRecords")
                if records:
                    if variant is None:
                        continue
                    parameter.update(variant)
            selected.append(parameter)
        addon["params"] = selected
    return result
