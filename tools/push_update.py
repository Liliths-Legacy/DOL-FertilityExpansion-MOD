#!/usr/bin/env python3
"""Commit and push project changes while excluding README.md files and image assets."""
import argparse
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".avif", ".tif", ".tiff"}

def git(*args, capture=False):
    return subprocess.run(["git", *args], cwd=ROOT, check=True,
                          stdout=subprocess.PIPE if capture else None)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--message-file", required=True, type=Path)
    args = parser.parse_args()
    message = args.message_file.resolve()
    if not message.is_file():
        parser.error("Commit message file does not exist")
    git("add", "-A", "--", ".", ":(exclude,icase)README.md",
        ":(exclude,icase,glob)**/README.md")
    staged = git("diff", "--cached", "--name-only", "-z", capture=True).stdout
    excluded = [p.decode() for p in staged.split(b"\0")
                if p and (Path(p.decode()).name.lower() == "readme.md"
                          or Path(p.decode()).suffix.lower() in IMAGE_SUFFIXES)]
    if excluded:
        git("restore", "--staged", "--", *excluded)
    if git("diff", "--cached", "--name-only", capture=True).stdout.strip():
        git("commit", "--file", str(message))
    git("push", "origin", "main")

if __name__ == "__main__":
    main()
