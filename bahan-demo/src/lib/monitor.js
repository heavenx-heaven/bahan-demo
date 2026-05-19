import { checkDomainsWithCache } from "./provider.js";

function monitorKey(domain) {
  return `monitor:v1:${domain}`;
}

function lastKey(domain) {
  return `monitor:last:v1:${domain}`;
}

export async function addMonitor(item, env) {
  if (!env.IPOS_MONITOR) {
    throw new Error("IPOS_MONITOR KV belum dikonfigurasi.");
  }

  await env.IPOS_MONITOR.put(monitorKey(item.domain), JSON.stringify(item));
  return item;
}

export async function removeMonitor(domain, env) {
  if (!env.IPOS_MONITOR) {
    throw new Error("IPOS_MONITOR KV belum dikonfigurasi.");
  }

  await env.IPOS_MONITOR.delete(monitorKey(domain));
  await env.IPOS_MONITOR.delete(lastKey(domain));
}

export async function listMonitors(env) {
  if (!env.IPOS_MONITOR) return [];

  const list = await env.IPOS_MONITOR.list({
    prefix: "monitor:v1:"
  });

  const items = await Promise.all(
    list.keys.map((key) => env.IPOS_MONITOR.get(key.name, "json"))
  );

  return items.filter(Boolean);
}

async function getLastStatus(domain, env) {
  if (!env.IPOS_MONITOR) return null;
  return env.IPOS_MONITOR.get(lastKey(domain), "json");
}

async function setLastStatus(domain, value, env) {
  if (!env.IPOS_MONITOR) return;
  await env.IPOS_MONITOR.put(lastKey(domain), JSON.stringify(value));
}

async function sendAlert(payload, env) {
  if (!env.ALERT_WEBHOOK_URL) return;

  await fetch(env.ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function runScheduledMonitor(env) {
  const monitors = await listMonitors(env);
  const active = monitors.filter((item) => item.active !== false);

  if (!active.length) return {
    ok: true,
    checked: 0
  };

  const domains = active.map((item) => item.domain);
  const result = await checkDomainsWithCache(domains, env);

  for (const item of result.results) {
    const previous = await getLastStatus(item.domain, env);

    const snapshot = {
      domain: item.domain,
      status: item.status,
      blocked: item.blocked,
      checkedAt: item.checkedAt || new Date().toISOString()
    };

    await setLastStatus(item.domain, snapshot, env);

    if (previous && previous.status !== item.status) {
      await sendAlert(
        {
          type: "domain_status_changed",
          domain: item.domain,
          previous,
          current: snapshot,
          time: new Date().toISOString()
        },
        env
      );
    }
  }

  return {
    ok: true,
    checked: result.results.length
  };
}
