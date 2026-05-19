const DOMAIN_RE =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeDomain(input) {
  if (!input || typeof input !== "string") return null;

  let value = input.trim().toLowerCase();

  if (!value) return null;

  value = value.replace(/[\u0000-\u001F\u007F]/g, "");

  try {
    if (/^https?:\/\//i.test(value)) {
      const parsed = new URL(value);
      value = parsed.hostname;
    }
  } catch {
    return null;
  }

  value = value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .replace(/\.$/, "");

  if (value.includes(":")) return null;
  if (!DOMAIN_RE.test(value)) return null;

  return value;
}

export function normalizeMany(inputs) {
  const arr = Array.isArray(inputs) ? inputs : [inputs];

  const normalized = arr
    .flatMap((item) => {
      if (typeof item !== "string") return [];
      return item.split(/[\s,\n]+/);
    })
    .map(normalizeDomain)
    .filter(Boolean);

  return [...new Set(normalized)];
}
