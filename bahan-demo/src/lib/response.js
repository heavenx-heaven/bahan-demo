import { corsHeaders } from "./cors.js";

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

export function badRequest(code, message, request, env) {
  return json(
    {
      ok: false,
      error: code,
      message
    },
    400,
    corsHeaders(request, env)
  );
}

export function unauthorized(request, env) {
  return json(
    {
      ok: false,
      error: "UNAUTHORIZED",
      message: "Admin token tidak valid atau belum dikirim."
    },
    401,
    corsHeaders(request, env)
  );
}

export function notFound(request, env) {
  return json(
    {
      ok: false,
      error: "NOT_FOUND"
    },
    404,
    corsHeaders(request, env)
  );
}

export function serverError(error, request, env) {
  return json(
    {
      ok: false,
      error: "INTERNAL_ERROR",
      message: error?.message || "Terjadi error internal."
    },
    500,
    corsHeaders(request, env)
  );
}
