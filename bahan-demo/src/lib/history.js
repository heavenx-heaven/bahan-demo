function hasSupabase(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function writeHistory(item, request, env) {
  if (!hasSupabase(env)) return;

  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/ipos_checks`;

  const body = {
    domain: item.domain,
    status: item.status,
    blocked: item.blocked,
    source: item.source || "unknown",
    checked_at: item.checkedAt || new Date().toISOString(),
    cache: Boolean(item.cache),
    raw: item.raw || null,
    client_ip:
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for") ||
      null
  };

  await fetch(url, {
    method: "POST",
    headers: {
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      "prefer": "return=minimal"
    },
    body: JSON.stringify(body)
  });
}

export async function getHistory(domain, env) {
  if (!hasSupabase(env)) return [];

  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}/rest/v1/ipos_checks`);

  url.searchParams.set("domain", `eq.${domain}`);
  url.searchParams.set("select", "domain,status,blocked,source,checked_at,cache");
  url.searchParams.set("order", "checked_at.desc");
  url.searchParams.set("limit", "100");

  const res = await fetch(url.toString(), {
    headers: {
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!res.ok) return [];

  return res.json();
}
