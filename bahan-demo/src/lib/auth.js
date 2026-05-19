import { unauthorized } from "./response.js";

export function requireAdmin(request, env) {
  const token = env.ADMIN_TOKEN;
  if (!token) return unauthorized(request, env);

  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${token}`;

  if (auth !== expected) return unauthorized(request, env);

  return null;
}
