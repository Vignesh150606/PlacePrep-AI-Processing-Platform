"""
Standard API response envelope.

Every endpoint in this API returns the same shape:

    {
      "success": bool,
      "message": str,
      "data": <payload | null>,
      "errors": <list[str] | null>
    }

Build these with `ok()` / `fail()` rather than constructing the dict by hand
at each call site, so the shape can never drift between endpoints.
"""
from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    message: str
    data: Optional[T] = None
    errors: Optional[List[str]] = None


def ok(data: Optional[T] = None, message: str = "OK") -> ApiResponse[T]:
    return ApiResponse(success=True, message=message, data=data, errors=None)


def fail(message: str, errors: Optional[List[str]] = None) -> ApiResponse[None]:
    return ApiResponse(success=False, message=message, data=None, errors=errors or [message])
