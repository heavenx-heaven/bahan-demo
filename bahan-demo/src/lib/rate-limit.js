async function getCounter(key, env) {
  if (!env.IPOS_RATE_LIMIT) return null;
  return env.IPOS_RATE_LIMIT.get(key, "json");
}

async function setCounter(key, value, ttl, env) {
  if (!env.IPOS_RATE_LIMIT) return;
  await env.IPOS_RATE_LIMIT.put(key, JSON.stringify(value), {
    expirationTtl: ttl
  });
}

export async function enforceRateLimit(clientIp, env) {
  if (!env.IPOS_RATE_LIMIT) return { ok: true };

  const max = Number(env.RATE_LIMIT_MAX || 60);
  const windowSeconds = Number(env.RATE_LIMIT_WINDOW_SECONDS || 60);
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rate:v1:${clientIp}:${bucket}`;

  const current = (await getCounter(key, env)) || {
    count: 0,
    bucket
  };

  current.count += 1;

  await setCounter(key, current, windowSeconds + 5, env);

  if (current.count > max) {
    const retryAfterSeconds =
      windowSeconds - Math.floor((Date.now() / 1000) % windowSeconds);

    return {
      ok: false,
      retryAfterSeconds
    };
  }

  return { ok: true };
}
