import { corsHeaders, handleOptions } from "./lib/cors.js";
import { json, notFound, badRequest, serverError } from "./lib/response.js";
import { normalizeMany, normalizeDomain } from "./lib/domain.js";
import { checkDomainsWithCache } from "./lib/provider.js";
import { enforceRateLimit } from "./lib/rate-limit.js";
import { requireAdmin } from "./lib/auth.js";
import {
  addMonitor,
  removeMonitor,
  listMonitors,
  runScheduledMonitor
} from "./lib/monitor.js";
import { getHistory, writeHistory } from "./lib/history.js";

async function readBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return request.json().catch(() => null);
}

function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown"
  );
}

async function parseDomains(request) {
  const url = new URL(request.url);

  if (request.method === "GET") {
    return normalizeMany([
      url.searchParams.get("domain"),
      url.searchParams.get("url")
    ]);
  }

  const body = await readBody(request);

  if (!body) return [];

  if (Array.isArray(body.domains)) return normalizeMany(body.domains);
  if (typeof body.domains === "string") return normalizeMany(body.domains.split(/[\s,\n]+/));
  if (typeof body.domain === "string") return normalizeMany([body.domain]);
  if (typeof body.url === "string") return normalizeMany([body.url]);

  return [];
}

async function handleHealth(request, env) {
  return json(
    {
      ok: true,
      service: env.APP_NAME || "Internet Positive Compliance API",
      version: "1.0.0",
      time: new Date().toISOString()
    },
    200,
    corsHeaders(request, env)
  );
}

async function handleProviderStatus(request, env) {
  return json(
    {
      ok: true,
      provider: {
        mode: env.PROVIDER_MODE || "generic",
        method: env.PROVIDER_METHOD || "POST",
        configured: Boolean(env.PROVIDER_URL),
        hasApiKey: Boolean(env.PROVIDER_API_KEY)
      },
      cache: {
        enabled: Boolean(env.IPOS_CACHE),
        ttlSeconds: Number(env.CACHE_TTL_SECONDS || 600)
      },
      monitor: {
        enabled: Boolean(env.IPOS_MONITOR),
        cron: "*/10 * * * *"
      }
    },
    200,
    corsHeaders(request, env)
  );
}

async function handleCheck(request, env) {
  const publicEnabled = String(env.PUBLIC_CHECK_ENABLED ?? "true") === "true";

  if (!publicEnabled) {
    const denied = requireAdmin(request, env);
    if (denied) return denied;
  }

  const clientIp = getClientIp(request);
  const rate = await enforceRateLimit(clientIp, env);
  if (!rate.ok) {
    return json(
      {
        ok: false,
        error: "RATE_LIMITED",
        message: "Terlalu banyak request. Coba lagi setelah window rate limit selesai.",
        retryAfterSeconds: rate.retryAfterSeconds
      },
      429,
      {
        ...corsHeaders(request, env),
        "retry-after": String(rate.retryAfterSeconds)
      }
    );
  }

  const domains = await parseDomains(request);

  if (!domains.length) {
    return badRequest(
      "INVALID_DOMAIN",
      "Masukkan domain valid. Contoh: example.com",
      request,
      env
    );
  }

  if (domains.length > 100) {
    return badRequest(
      "TOO_MANY_DOMAINS",
      "Maksimal 100 domain per request.",
      request,
      env
    );
  }

  const result = await checkDomainsWithCache(domains, env);

  await Promise.allSettled(
    result.results.map((item) => writeHistory(item, request, env))
  );

  return json(
    {
      ok: true,
      checkedAt: new Date().toISOString(),
      count: result.results.length,
      source: result.source,
      results: result.results
    },
    200,
    corsHeaders(request, env)
  );
}

async function handleAddMonitor(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readBody(request);
  const domain = normalizeDomain(body?.domain || body?.url);

  if (!domain) {
    return badRequest("INVALID_DOMAIN", "Domain monitor tidak valid.", request, env);
  }

  const item = await addMonitor(
    {
      domain,
      label: String(body?.label || ""),
      active: body?.active !== false,
      createdAt: new Date().toISOString()
    },
    env
  );

  return json({ ok: true, item }, 200, corsHeaders(request, env));
}

async function handleRemoveMonitor(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readBody(request);
  const domain = normalizeDomain(body?.domain || body?.url);

  if (!domain) {
    return badRequest("INVALID_DOMAIN", "Domain monitor tidak valid.", request, env);
  }

  await removeMonitor(domain, env);
  return json({ ok: true, removed: domain }, 200, corsHeaders(request, env));
}

async function handleListMonitors(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const items = await listMonitors(env);
  return json({ ok: true, count: items.length, items }, 200, corsHeaders(request, env));
}

async function handleHistory(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const url = new URL(request.url);
  const domain = normalizeDomain(url.searchParams.get("domain"));

  if (!domain) {
    return badRequest("INVALID_DOMAIN", "Query domain wajib valid.", request, env);
  }

  const rows = await getHistory(domain, env);
  return json({ ok: true, domain, rows }, 200, corsHeaders(request, env));
}

async function handleAlertTest(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  if (!env.ALERT_WEBHOOK_URL) {
    return badRequest(
      "WEBHOOK_NOT_CONFIGURED",
      "ALERT_WEBHOOK_URL belum diset.",
      request,
      env
    );
  }

  const payload = {
    type: "test",
    message: "Internet Positive Compliance API alert test",
    time: new Date().toISOString()
  };

  const res = await fetch(env.ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  return json(
    {
      ok: res.ok,
      status: res.status
    },
    res.ok ? 200 : 502,
    corsHeaders(request, env)
  );
}

async function route(request, env) {
  if (request.method === "OPTIONS") return handleOptions(request, env);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/" || path === "/api/health") return handleHealth(request, env);
  if (path === "/api/provider/status") return handleProviderStatus(request, env);

  if (
    (path === "/api/check" || path === "/api/batch") &&
    ["GET", "POST"].includes(request.method)
  ) {
    return handleCheck(request, env);
  }

  if (path === "/api/monitor/add" && request.method === "POST") {
    return handleAddMonitor(request, env);
  }

  if (path === "/api/monitor/remove" && request.method === "POST") {
    return handleRemoveMonitor(request, env);
  }

  if (path === "/api/monitor/list" && request.method === "GET") {
    return handleListMonitors(request, env);
  }

  if (path === "/api/history" && request.method === "GET") {
    return handleHistory(request, env);
  }

  if (path === "/api/alert/test" && request.method === "POST") {
    return handleAlertTest(request, env);
  }

  return notFound(request, env);
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      return serverError(error, request, env);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledMonitor(env));
  }
};
