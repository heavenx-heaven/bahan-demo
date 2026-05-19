import { normalizeMany } from "./domain.js";

function nowIso() {
  return new Date().toISOString();
}

function cacheKey(domain) {
  return `check:v1:${domain}`;
}

async function readCache(domain, env) {
  if (!env.IPOS_CACHE) return null;
  return env.IPOS_CACHE.get(cacheKey(domain), "json");
}

async function writeCache(domain, value, env) {
  if (!env.IPOS_CACHE) return;

  const ttl = Math.max(60, Number(env.CACHE_TTL_SECONDS || 600));

  await env.IPOS_CACHE.put(cacheKey(domain), JSON.stringify(value), {
    expirationTtl: ttl
  });
}

function normalizeProviderItem(domain, raw) {
  if (!raw) {
    return {
      domain,
      blocked: null,
      status: "unknown",
      raw: null
    };
  }

  const rawDomain =
    raw.domain ||
    raw.Domain ||
    raw.url ||
    raw.URL ||
    raw.name ||
    domain;

  const rawBlocked =
    raw.blocked ??
    raw.Blocked ??
    raw.is_blocked ??
    raw.status_blocked ??
    raw.terblokir ??
    raw.block;

  let blocked = null;

  if (typeof rawBlocked === "boolean") {
    blocked = rawBlocked;
  } else if (typeof rawBlocked === "number") {
    blocked = rawBlocked === 1;
  } else if (typeof rawBlocked === "string") {
    const value = rawBlocked.trim().toLowerCase();
    if (["true", "1", "blocked", "ada", "terblokir", "positif"].includes(value)) {
      blocked = true;
    }
    if (["false", "0", "clear", "aman", "tidak", "negatif"].includes(value)) {
      blocked = false;
    }
  }

  const status = blocked === true ? "blocked" : blocked === false ? "clear" : "unknown";

  return {
    domain: String(rawDomain).toLowerCase() || domain,
    blocked,
    status,
    raw
  };
}

function extractProviderResults(data, domains) {
  const candidateArrays = [
    data?.results,
    data?.data?.results,
    data?.data,
    data?.domains,
    data?.result
  ];

  const arr = candidateArrays.find(Array.isArray);

  if (!arr) {
    if (domains.length === 1 && data && typeof data === "object") {
      return [normalizeProviderItem(domains[0], data)];
    }

    return domains.map((domain) => normalizeProviderItem(domain, null));
  }

  return domains.map((domain) => {
    const found =
      arr.find((item) => {
        const itemDomain = String(
          item?.domain ||
            item?.Domain ||
            item?.url ||
            item?.URL ||
            item?.name ||
            ""
        ).toLowerCase();

        return itemDomain === domain;
      }) || null;

    return normalizeProviderItem(domain, found);
  });
}

async function checkMockProvider(domains) {
  return {
    ok: true,
    source: "mock",
    results: domains.map((domain) => ({
      domain,
      blocked: false,
      status: "clear",
      raw: {
        mock: true
      }
    }))
  };
}

async function checkGenericProvider(domains, env) {
  if (!env.PROVIDER_URL) {
    return {
      ok: false,
      source: "unconfigured",
      results: domains.map((domain) => ({
        domain,
        blocked: null,
        status: "unknown",
        raw: {
          error: "PROVIDER_URL_NOT_CONFIGURED"
        }
      }))
    };
  }

  const method = String(env.PROVIDER_METHOD || "POST").toUpperCase();
  const headers = {
    "accept": "application/json",
    "content-type": "application/json"
  };

  if (env.PROVIDER_API_KEY) {
    headers["X-API-Key"] = env.PROVIDER_API_KEY;
    headers["Authorization"] = `Bearer ${env.PROVIDER_API_KEY}`;
  }

  let response;

  if (method === "GET") {
    const url = new URL(env.PROVIDER_URL);
    url.searchParams.set("domains", domains.join(","));
    if (domains.length === 1) url.searchParams.set("domain", domains[0]);

    response = await fetch(url.toString(), {
      method: "GET",
      headers
    });
  } else {
    response = await fetch(env.PROVIDER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        domains,
        domain: domains.length === 1 ? domains[0] : undefined,
        query: domains.join("\n")
      })
    });
  }

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = {
      parseError: true,
      body: text.slice(0, 1000)
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      source: "provider",
      results: domains.map((domain) => ({
        domain,
        blocked: null,
        status: "unknown",
        raw: {
          httpStatus: response.status,
          data
        }
      }))
    };
  }

  return {
    ok: true,
    source: "provider",
    results: extractProviderResults(data, domains)
  };
}

async function checkTrustpositifProvider(domains, env) {
  const base = await checkGenericProvider(domains, env);

  return {
    ...base,
    source: "trustpositif-adapter"
  };
}

async function queryProvider(domains, env) {
  const mode = String(env.PROVIDER_MODE || "generic").toLowerCase();

  if (mode === "mock") return checkMockProvider(domains, env);
  if (mode === "trustpositif") return checkTrustpositifProvider(domains, env);

  return checkGenericProvider(domains, env);
}

export async function checkDomainsWithCache(inputDomains, env) {
  const domains = normalizeMany(inputDomains);
  const cachedResults = [];
  const missing = [];

  for (const domain of domains) {
    const cached = await readCache(domain, env);

    if (cached) {
      cachedResults.push({
        ...cached,
        cache: true
      });
    } else {
      missing.push(domain);
    }
  }

  let providerResults = [];

  if (missing.length) {
    const provider = await queryProvider(missing, env);

    providerResults = provider.results.map((item) => ({
      domain: item.domain,
      blocked: item.blocked,
      status: item.status,
      source: provider.source,
      checkedAt: nowIso(),
      cache: false,
      raw: item.raw
    }));

    await Promise.allSettled(
      providerResults.map((item) =>
        writeCache(item.domain, {
          ...item,
          cache: false
        }, env)
      )
    );
  }

  const merged = [...cachedResults, ...providerResults];

  const ordered = domains.map((domain) => {
    return merged.find((item) => item.domain === domain) || {
      domain,
      blocked: null,
      status: "unknown",
      source: "missing",
      checkedAt: nowIso(),
      cache: false
    };
  });

  return {
    source: missing.length ? "mixed/provider" : "cache",
    results: ordered
  };
}
