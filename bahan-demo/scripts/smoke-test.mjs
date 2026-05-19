const base = process.env.API_URL || "http://localhost:8787";

const endpoints = [
  "/api/health",
  "/api/provider/status",
  "/api/check?domain=example.com"
];

for (const endpoint of endpoints) {
  const url = `${base}${endpoint}`;
  const res = await fetch(url);
  const body = await res.text();

  console.log("----");
  console.log(res.status, url);
  console.log(body.slice(0, 1000));
}
