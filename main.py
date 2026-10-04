import argparse
import asyncio
import contextlib
import webbrowser

import httpx

from src.consts import HOST, PORT, GAME_VERSION
from src.core import GameSourceCode, GameMod
from src.exceptions import _BaseHelperException
from src.langs import locale, Langs
from src.log import logger
from src.server import app
from src.validator import validate_all


async def refresh_source():
    async with httpx.AsyncClient() as client:
        game = GameSourceCode(client)
        if not game.FILE_GAME_ZIP.is_file():
            await game.download()
    game.extract()


def build():
    check()
    mod = GameMod(test_flag=False)
    mod.build_boot_json()
    mod.process_results(auto_apply=False)
    mod.package()


def serve(open_browser: bool = False):
    if open_browser:
        webbrowser.open(f"http://{HOST}:{PORT}")
    logger.warning(locale(Langs.WarningWebBrowserInfo, host=HOST, port=PORT))
    app.run(host=HOST, port=PORT, debug=False)


def check():
    errors, warnings = validate_all()
    for warning in warnings:
        logger.warning(warning)
    if errors:
        for error in errors:
            logger.error(error)
        raise SystemExit(1)
    logger.info("Development environment and mod sources are valid.")


def parse_args():
    parser = argparse.ArgumentParser(description=f"DoL {GAME_VERSION} Mod development helper")
    parser.add_argument(
        "command",
        nargs="?",
        choices=("check", "build", "serve", "dev", "source"),
        default="build",
        help="validate, build mods, serve the test game, do both, or refresh the pinned source",
    )
    parser.add_argument("--open", action="store_true", help="open the browser when serving")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    with contextlib.suppress(_BaseHelperException):
        if args.command == "check":
            check()
        elif args.command == "source":
            asyncio.run(refresh_source())
        elif args.command == "serve":
            serve(args.open)
        elif args.command == "dev":
            build()
            serve(args.open)
        else:
            build()
