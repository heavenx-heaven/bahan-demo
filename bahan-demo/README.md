# Internet Positive Compliance API — Final

API ini dibuat sebagai **Domain Health & Compliance Monitoring**, bukan alat bypass pemblokiran.

Fungsi utama:

- Cek status domain tunggal atau batch.
- Cache hasil pengecekan agar hemat kuota provider.
- Rate limit per IP.
- Monitor domain otomatis setiap 10 menit via Cloudflare Cron.
- Simpan histori opsional ke Supabase.
- Kirim alert opsional ke webhook saat status berubah.
- Provider adapter bisa diganti lewat environment variable.

---

## 1. Struktur

```txt
internet-positive-api-final/
├─ src/
│  ├─ index.js
│  └─ lib/
│     ├─ auth.js
│     ├─ cors.js
│     ├─ domain.js
│     ├─ history.js
│     ├─ monitor.js
│     ├─ provider.js
│     ├─ rate-limit.js
│     └─ response.js
├─ supabase/
│  └─ schema.sql
├─ public/
│  └─ demo.html
├─ wrangler.toml
└─ package.json
```

---

## 2. Endpoint

### Public

```txt
GET  /api/health
GET  /api/provider/status
GET  /api/check?domain=example.com
POST /api/check
POST /api/batch
```

### Admin

Butuh header:

```txt
Authorization: Bearer YOUR_ADMIN_TOKEN
```

Endpoint:

```txt
GET  /api/monitor/list
POST /api/monitor/add
POST /api/monitor/remove
GET  /api/history?domain=example.com
POST /api/alert/test
```

---

## 3. Deploy Cloudflare Worker

Install:

```bash
npm install
```

Login:

```bash
npx wrangler login
```

Buat KV:

```bash
npx wrangler kv namespace create IPOS_CACHE
npx wrangler kv namespace create IPOS_RATE_LIMIT
npx wrangler kv namespace create IPOS_MONITOR
```

Salin `id` KV ke `wrangler.toml`.

Set secret:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put PROVIDER_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ALERT_WEBHOOK_URL
```

Deploy:

```bash
npm run deploy
```

---

## 4. Test

```bash
curl "https://YOUR-WORKER.workers.dev/api/health"
```

```bash
curl "https://YOUR-WORKER.workers.dev/api/check?domain=example.com"
```

```bash
curl -X POST "https://YOUR-WORKER.workers.dev/api/batch" \
  -H "Content-Type: application/json" \
  -d '{"domains":["example.com","google.com"]}'
```

Tambah monitor:

```bash
curl -X POST "https://YOUR-WORKER.workers.dev/api/monitor/add" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"domain":"example.com","label":"Main domain"}'
```

---

## 5. Environment Variable

| Nama | Wajib | Fungsi |
|---|---:|---|
| `ADMIN_TOKEN` | Ya untuk admin | Proteksi endpoint admin |
| `PROVIDER_URL` | Ya | Endpoint provider cek domain |
| `PROVIDER_API_KEY` | Opsional | API key provider |
| `PROVIDER_MODE` | Opsional | `generic`, `trustpositif`, atau `mock` |
| `PROVIDER_METHOD` | Opsional | `POST` atau `GET` |
| `CACHE_TTL_SECONDS` | Opsional | Default 600 detik |
| `RATE_LIMIT_MAX` | Opsional | Default 60 request |
| `RATE_LIMIT_WINDOW_SECONDS` | Opsional | Default 60 detik |
| `ALLOWED_ORIGINS` | Opsional | `*` atau daftar origin dipisah koma |
| `SUPABASE_URL` | Opsional | Simpan histori |
| `SUPABASE_SERVICE_ROLE_KEY` | Opsional | Insert histori Supabase |
| `ALERT_WEBHOOK_URL` | Opsional | Kirim notifikasi status berubah |

---

## 6. Supabase

Jalankan file:

```txt
supabase/schema.sql
```

di Supabase SQL Editor.

Gunakan service role key hanya sebagai Worker secret. Jangan taruh di frontend.

---

## 7. Catatan legal dan teknis

- API ini tidak melakukan bypass, rotasi domain, atau penyamaran trafik.
- API ini hanya melakukan monitoring, logging, alert, dan compliance review.
- Jika provider gagal, status dikembalikan sebagai `unknown`, bukan diasumsikan aman atau terblokir.
- Untuk produksi, gunakan provider resmi/berizin atau adapter internal yang kamu punya izin untuk akses.
