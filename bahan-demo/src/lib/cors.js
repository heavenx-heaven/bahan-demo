export function corsHeaders(request, env) {
  const origin = request?.headers?.get("origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const allowOrigin =
    allowed.includes("*") || !origin
      ? "*"
      : allowed.includes(origin)
        ? origin
        : allowed[0] || "*";

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-API-Key",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

export function handleOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env)
  });
}
