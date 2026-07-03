/**
 * Mirrors `app.core.responses.ApiResponse` on the backend exactly — every
 * `/api/v1/*` endpoint returns this shape. Keeping it here means frontend
 * fetch wrappers get one typed envelope instead of guessing per-endpoint.
 */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  errors: string[] | null;
}
