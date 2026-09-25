#!/bin/zsh
set -e
cd "${0:A:h}"
uv run main.py dev --open
