"""Create the mutually exclusive visual and lightweight FertilityExpansion packages."""

import json
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from .log import logger


LARGE_ART_PREFIXES = ("img/background/eden/", "img/furniture/eden/")
EDITION_MODULE = "modules/eden-edition.js"


def _variant_path(archive: Path, label: str) -> Path:
    stem = archive.name.removesuffix(".mod.zip")
    return archive.with_name(f"{stem}-{label}.mod.zip")


def build_fertility_expansion_variants(archive: Path | None) -> tuple[Path, Path] | None:
    if archive is None or not archive.is_file():
        return None

    visual = _variant_path(archive, "Visual")
    lite = _variant_path(archive, "Lite")
    shutil.copyfile(archive, visual)

    with ZipFile(archive) as source, ZipFile(lite, "w", compression=ZIP_DEFLATED, compresslevel=5) as target:
        for info in source.infolist():
            name = info.filename
            if name.startswith(LARGE_ART_PREFIXES):
                continue
            data = source.read(name)
            if name == "boot.json":
                boot = json.loads(data.decode("utf-8"))
                boot["edition"] = "lite"
                boot["imgFileList"] = [item for item in boot.get("imgFileList", []) if not item.startswith(LARGE_ART_PREFIXES)]
                data = json.dumps(boot, ensure_ascii=False, indent=2).encode("utf-8")
            elif name == EDITION_MODULE:
                text = data.decode("utf-8")
                expected = 'kind: "visual", usesLargeArtwork: true'
                if text.count(expected) != 1:
                    raise ValueError("FertilityExpansion edition marker is missing or ambiguous")
                data = text.replace(expected, 'kind: "lite", usesLargeArtwork: false').encode("utf-8")
            target.writestr(info, data)

    logger.info(f"Visual package: {visual.name}")
    logger.info(f"Lite package: {lite.name}")
    return visual, lite
