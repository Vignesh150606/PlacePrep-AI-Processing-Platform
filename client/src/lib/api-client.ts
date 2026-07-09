import type { ApiResponse } from "@placeprep/shared";
import { supabase } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
  status: number;
  errors: string[] | null;

  constructor(message: string, status: number, errors: string[] | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("You need to be signed in.", 401);
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError("Unexpected response from server.", res.status);
  }
  if (!res.ok || !body.success) {
    throw new ApiError(body.message || "Request failed.", res.status, body.errors);
  }
  return body.data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, { headers });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, json?: unknown): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: json !== undefined ? { ...headers, "Content-Type": "application/json" } : headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(path: string, json: unknown): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers,
  });
  return handleResponse<T>(res);
}

/** Multipart upload — no Content-Type header, the browser sets the boundary. */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });
  return handleResponse<T>(res);
}
