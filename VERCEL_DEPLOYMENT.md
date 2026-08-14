# Migrasi Deployment ke Vercel

Panduan ini berlaku untuk **AR Store Inventory Dashboard** yang menggunakan Next.js 16 App Router, NextAuth.js, Supabase, Route Handlers, dan runtime Node.js 22.

> Aplikasi ini bukan static export. Jangan mengatur Output Directory ke `out`. Vercel harus menjalankan aplikasi sebagai project Next.js.

## Ringkasan migrasi

Migrasi tidak memindahkan data. Vercel akan menggunakan project Supabase production yang sama. Urutan aman:

1. Import repository ke Vercel tanpa mematikan deployment Netlify.
2. Tambahkan environment variables production.
3. Deploy dan uji melalui domain sementara `*.vercel.app`.
4. Pindahkan custom domain setelah seluruh pengujian lulus.
5. Pastikan cron Vercel aktif dan hentikan scheduler retention lama.
6. Pertahankan deployment Netlify selama masa rollback singkat, lalu nonaktifkan.

## 1. Validasi repository

Jalankan sebelum push:

```bash
npm ci
npm run check
npm run build
```

Repository menggunakan Node.js 22 melalui `package.json`:

```json
{
  "engines": {
    "node": "22.x"
  }
}
```

Konfigurasi `vercel.json` mendaftarkan cron harian:

```json
{
  "crons": [
    {
      "path": "/api/cron/activity-retention",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Jadwal tersebut berjalan setiap hari pukul **02:00 UTC**. Periksa batas dan ketersediaan Cron Jobs pada paket Vercel yang digunakan sebelum production.

## 2. Import project ke Vercel

1. Buka Vercel Dashboard dan pilih **Add New > Project**.
2. Import repository Git project ini.
3. Pastikan **Framework Preset** terdeteksi sebagai `Next.js`.
4. Gunakan directory repository yang berisi `package.json` sebagai **Root Directory**.
5. Biarkan Build Command menggunakan `npm run build` dan jangan isi Output Directory secara manual.
6. Pastikan versi Node.js project adalah 22.x jika dashboard meminta pilihan runtime.

## 3. Environment variables

Tambahkan variabel berikut pada **Project Settings > Environment Variables** untuk scope `Production`:

| Variable | Wajib | Rahasia | Keterangan |
|---|---:|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Ya | Tidak | URL HTTPS project Supabase production. |
| `SUPABASE_SERVICE_ROLE_KEY` | Ya | Ya | Service role key Supabase; jangan gunakan prefix `NEXT_PUBLIC_`. |
| `NEXTAUTH_SECRET` | Ya | Ya | Secret minimal 32 karakter. Gunakan nilai production lama agar sesi pada custom domain tetap kompatibel. |
| `NEXTAUTH_URL` | Ya | Tidak | Origin canonical aplikasi production, tanpa path. |
| `CRON_SECRET` | Ya | Ya | Secret yang dikirim Vercel sebagai Bearer token ke cron endpoint. |
| `ACTIVITY_RETENTION_DAYS` | Tidak | Tidak | Default `180`; nilai yang valid `1` sampai `36500`. |
| `ADMIN_USERNAME` | Kondisional | Ya | Hanya dibutuhkan untuk bootstrap admin jika hash password belum tersimpan. |
| `ADMIN_PASSWORD` | Kondisional | Ya | Hanya dibutuhkan untuk bootstrap pertama; minimal 12 karakter. |

Contoh tanpa nilai rahasia:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXTAUTH_SECRET=YOUR_EXISTING_PRODUCTION_SECRET
NEXTAUTH_URL=https://inventory.example.com
CRON_SECRET=YOUR_CRON_SECRET
ACTIVITY_RETENTION_DAYS=180
```

### Aturan penting

- Jangan menyalin `.env` ke repository atau Build Logs.
- Untuk migrasi dengan custom domain yang sama, pertahankan `NEXTAUTH_SECRET` lama agar cookie sesi tidak langsung invalid.
- Jika domain berubah dari `*.netlify.app` menjadi `*.vercel.app`, pengguna tetap perlu login ulang karena cookie terikat pada domain.
- `NEXTAUTH_URL` harus sama persis dengan origin yang digunakan pengguna, memakai HTTPS dan tanpa trailing path.
- Environment Preview harus menggunakan URL yang sesuai dengan deployment preview. Jika tidak dikonfigurasi, prioritaskan pengujian autentikasi pada Production Deployment.
- Setelah bootstrap admin berhasil dan `password_hash` tersimpan di Supabase, hapus `ADMIN_USERNAME` serta `ADMIN_PASSWORD` dari Vercel.

## 4. Deploy pertama

Deploy project setelah environment variables tersedia. Kemudian periksa:

- `/api/health` mengembalikan respons sukses;
- `/auth/login` dapat dibuka;
- login dan opsi **Ingat saya** bekerja;
- `/dashboard` terlindungi ketika belum login;
- data stock, barang masuk, barang keluar, laporan, dan activity dapat dibaca;
- upload avatar tersimpan ke Supabase Storage;
- logout menghapus sesi;
- header keamanan dari `next.config.ts` tetap muncul.

Untuk deployment sementara `*.vercel.app`, set `NEXTAUTH_URL` ke domain production Vercel tersebut dan lakukan redeploy sebelum menguji login.

## 5. Cron activity retention

Vercel membaca jadwal dari `vercel.json` dan memanggil:

```text
GET /api/cron/activity-retention
Authorization: Bearer <CRON_SECRET>
```

Endpoint memvalidasi secret dengan perbandingan timing-safe lalu menghapus activity log yang lebih lama dari `ACTIVITY_RETENTION_DAYS`.

Setelah Vercel Cron terbukti berjalan:

1. nonaktifkan scheduler eksternal atau scheduled function lama yang memanggil endpoint yang sama;
2. periksa Cron Jobs dan Function Logs di Vercel Dashboard;
3. pastikan hanya ada satu eksekusi terjadwal per hari.

Penghapusan bersifat idempoten, tetapi dua scheduler tetap memboroskan invocation dan menyulitkan observability.

## 6. Pindahkan custom domain

Jika menggunakan custom domain yang saat ini mengarah ke Netlify:

1. Tambahkan domain ke project Vercel.
2. Ikuti record DNS yang diberikan Vercel.
3. Jangan hapus domain dari Netlify sebelum Vercel menyatakan konfigurasi domain valid.
4. Ubah DNS dengan TTL rendah jika memungkinkan.
5. Pastikan sertifikat HTTPS Vercel sudah aktif.
6. Set `NEXTAUTH_URL` ke custom domain final dan redeploy.
7. Uji login, callback, cookie, API, dan upload avatar melalui domain final.

Jika custom domain tidak berubah dan `NEXTAUTH_SECRET` dipertahankan, sesi pengguna berpotensi tetap valid. Tetap siapkan kemungkinan login ulang saat cutover DNS.

## 7. Observability dan rollback

Pantau selama masa cutover:

- Vercel Deployment Logs;
- Function Logs untuk `/api/auth`, `/api/profile`, dan endpoint transaksi;
- hasil `/api/health`;
- Supabase Logs dan jumlah koneksi;
- status Cron Jobs.

Rollback aman:

1. pertahankan deployment Netlify lama untuk sementara;
2. jika terjadi kegagalan kritis, arahkan DNS kembali ke target lama;
3. kembalikan `NEXTAUTH_URL` ke origin yang kembali aktif;
4. jangan menjalankan cron retention dari dua platform secara bersamaan.

Setelah Vercel stabil dan masa rollback selesai, hapus custom domain, environment variables, build hook, serta scheduler dari Netlify sebelum menutup project lama.

## Checklist production

- [ ] `npm run check` lulus.
- [ ] `npm run build` lulus.
- [ ] Semua migration Supabase production sudah diterapkan.
- [ ] Secret tidak masuk repository.
- [ ] `NEXTAUTH_URL` memakai domain production final.
- [ ] `NEXTAUTH_SECRET` production sudah benar.
- [ ] `/api/health` sukses.
- [ ] Login, remember me, logout, dan proteksi dashboard teruji.
- [ ] CRUD serta laporan teruji.
- [ ] Upload avatar teruji.
- [ ] Vercel Cron aktif.
- [ ] Scheduler retention lama dinonaktifkan.
- [ ] Custom domain dan HTTPS aktif.
- [ ] Rollback window selesai sebelum Netlify ditutup.
