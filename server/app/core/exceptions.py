"""
Centralized exception handling.

`AppException` (and its subclasses below) is what business logic should
raise deliberately -- e.g. `raise NotFoundError("Question not found.")`.
The handlers registered in `register_exception_handlers()` make sure those,
FastAPI's own validation errors, and anything truly unexpected all come
back through the same `ApiResponse` envelope instead of FastAPI's default
error shape, so the frontend only ever has to handle one response format.
"""
import logging
from typing import Optional

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.responses import fail

logger = logging.getLogger(__name__)


class AppException(Exception):
    """Base class for deliberate, typed application errors."""

    status_code = status.HTTP_400_BAD_REQUEST
    message = "Something went wrong."

    def __init__(self, message: Optional[str] = None, status_code: Optional[int] = None):
        self.message = message or self.message
        self.status_code = status_code or self.status_code
        super().__init__(self.message)


class NotFoundError(AppException):
    status_code = status.HTTP_404_NOT_FOUND
    message = "Resource not found."


class UnauthorizedError(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    message = "Authentication required."


class ForbiddenError(AppException):
    status_code = status.HTTP_403_FORBIDDEN
    message = "You do not have permission to perform this action."


class RateLimitedError(AppException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    message = "Too many requests. Please slow down and try again shortly."


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def handle_app_exception(request: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=fail(exc.message).model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=fail("Request validation failed.", errors).model_dump(),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=fail(str(exc.detail)).model_dump(),
        )

    @app.exception_handler(Exception)
    async def handle_unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
        # Last-resort fallback only: FastAPI wires this specific handler
        # into Starlette's `ServerErrorMiddleware`, which sits OUTSIDE
        # every `app.add_middleware(...)`-registered middleware --
        # including CORSMiddleware. A response built here never passes
        # back out through CORSMiddleware, so it never gets
        # Access-Control-Allow-Origin, and the browser reports a
        # misleading CORS error for what's actually a server bug. The
        # `catch_unhandled_exceptions` middleware in `main.py` is
        # registered specifically to catch this first, one layer inside
        # CORS, so this handler should rarely fire in practice -- it's
        # kept only for the edge case of an exception raised mid-response
        # (after headers were already sent), which no middleware can
        # recover from anyway.
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=fail("Internal server error.").model_dump(),
        )
