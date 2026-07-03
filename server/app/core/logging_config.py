"""
Centralized logging configuration.

Call `configure_logging()` once, at startup (see `app.main`). Every other
module should just do `logger = logging.getLogger(__name__)` and use it —
no module should configure its own handlers.
"""
import logging
import sys

from app.core.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    level = logging.DEBUG if settings.ENVIRONMENT == "development" else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    # Quiet down noisy third-party access logs without losing our own.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
