"""Archive older release packages after every edition has built successfully."""

import re
import shutil
from pathlib import Path

from .log import logger


def archive_previous_packages(
    archives: dict[str, Path], variants: tuple[Path, ...] = ()
) -> list[Path]:
    """Keep this build and the stable loader alias; never overwrite an older backup."""
    current = {*archives.values(), *variants}
    for package in current:
        if not package.is_file():
            raise FileNotFoundError(f"Current package is missing: {package}")

    moved = []
    for name, archive in archives.items():
        pattern = re.compile(rf"{re.escape(name)}-v\d+\.\d+\.\d+(?:-.*)?\.mod\.zip")
        oldversion = archive.parent / "oldversion"
        for package in sorted(archive.parent.glob("*.mod.zip")):
            if package in current or not package.is_file() or not pattern.fullmatch(package.name):
                continue
            oldversion.mkdir(exist_ok=True)
            destination = oldversion / package.name
            suffix = 1
            while destination.exists():
                destination = oldversion / f"{package.name.removesuffix('.mod.zip')}-archived-{suffix}.mod.zip"
                suffix += 1
            shutil.move(str(package), str(destination))
            moved.append(destination)

    if moved:
        logger.info(f"Archived {len(moved)} previous packages into oldversion/")
    return moved
