// Shared helpers for route handlers: JSON responses, typed errors, and one wrapper
// that turns thrown errors into consistent { error: { code, message } } bodies.
import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(status, message, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg) => new HttpError(400, msg, 'BAD_REQUEST');
export const notFound = (msg = 'Not found') => new HttpError(404, msg, 'NOT_FOUND');

export function json(data, status = 200, headers) {
  return NextResponse.json(data, { status, headers });
}

export function errorResponse(e) {
  if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status);
  if (e?.name === 'IntegrationError') return json({ error: { code: e.code, message: e.message } }, e.status || 502);
  // Unknown errors: log server-side, return a generic message (no stack traces or internals).
  console.error('[api] unexpected error:', e?.message || e);
  return json({ error: { code: 'INTERNAL', message: 'Something went wrong. Try again.' } }, 500);
}

// Wraps a handler (request, ctx) so thrown HttpErrors become JSON responses.
export const route = (fn) => async (request, ctx) => {
  try {
    return await fn(request, ctx);
  } catch (e) {
    return errorResponse(e);
  }
};

export async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw badRequest('Request body must be a JSON object.');
  }
}

export async function params(ctx) {
  return (await ctx?.params) || {};
}

// Small validators used across routes.
export function str(value, { field, max = 200, required = false, min = 0 } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`${field} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be text.`);
  const v = value.trim();
  if (required && !v) throw badRequest(`${field} is required.`);
  if (v.length < min) throw badRequest(`${field} must be at least ${min} characters.`);
  if (v.length > max) throw badRequest(`${field} must be ${max} characters or fewer.`);
  return v;
}

export function int(value, { field, min, max, fallback }) {
  if (value == null || value === '') {
    if (fallback !== undefined) return fallback;
    throw badRequest(`${field} is required.`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${field} must be a whole number from ${min} to ${max}.`);
  return n;
}

export function oneOf(value, allowed, { field, fallback }) {
  if ((value == null || value === '') && fallback !== undefined) return fallback;
  if (!allowed.includes(value)) throw badRequest(`${field} must be one of: ${allowed.join(', ')}.`);
  return value;
}
