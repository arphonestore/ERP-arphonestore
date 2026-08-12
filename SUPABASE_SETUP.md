# Setup Ulang Project Supabase

Panduan ini menjelaskan cara membuat project Supabase baru untuk aplikasi **AR Store / Phone Inventory**, membangun skema database, mengatur environment, dan memvalidasi seluruh integrasi.

> Jangan hapus project Supabase lama sebelum project baru berhasil diuji, terutama jika masih ada data yang perlu dipulihkan.

## Daftar Isi

1. [Arsitektur singkat](#1-arsitektur-singkat)
2. [Persiapan](#2-persiapan)
3. [Membuat project Supabase](#3-membuat-project-supabase)
4. [Mengambil URL dan API keys](#4-mengambil-url-dan-api-keys)
5. [Mengatur environment](#5-mengatur-environment)
6. [Membuat struktur database](#6-membuat-struktur-database)
7. [Memverifikasi database](#7-memverifikasi-database)
8. [Mengisi data contoh](#8-mengisi-data-contoh-opsional)
9. [Mengatur Supabase Storage](#9-mengatur-supabase-storage)
10. [Menguji DNS dan Data API](#10-menguji-dns-dan-data-api)
11. [Menjalankan aplikasi](#11-menjalankan-aplikasi)
12. [Menginisialisasi admin](#12-menginisialisasi-admin)
13. [Smoke test](#13-smoke-test)
14. [Troubleshooting](#14-troubleshooting)
15. [Checklist keamanan](#15-checklist-keamanan)

---

## 1. Arsitektur Singkat

Aplikasi menggunakan:

- **Next.js** untuk aplikasi web dan API route;
- **NextAuth** dengan Credentials Provider untuk autentikasi;
- **Supabase PostgreSQL** untuk data stok, transaksi, aktivitas, dan profil;
- **Supabase Storage** untuk avatar;
- secret/service-role key hanya pada server.

Alur data utama:

```text
Browser
  → Next.js API route
  → validasi session NextAuth
  → Supabase admin client
  → Supabase Data API
  → PostgreSQL
```

Aplikasi tidak memerlukan pembuatan user pada Supabase Authentication untuk alur login saat ini. Login dikelola oleh NextAuth dan tabel `admin_profiles`.

---

## 2. Persiapan

### 2.1 Hentikan development server

Jika `npm run dev` masih berjalan, tekan `Ctrl+C`.

### 2.2 Backup konfigurasi lama

Jalankan dari root repository:

```powershell
Copy-Item .env.local .env.local.backup
```

`.env.local.backup` mengandung secret. Jangan mengunggah atau membagikannya.

### 2.3 Backup data lama jika diperlukan

Jika project lama masih dapat dibuka, ekspor tabel berikut melalui Supabase Table Editor:

- `stock`
- `stock_in`
- `stock_out`
- `activity_logs`
- `admin_profiles`

Tahap ini dapat dilewati jika project baru memang akan dimulai tanpa data lama.

---

## 3. Membuat Project Supabase

1. Buka [Supabase Dashboard](https://supabase.com/dashboard/projects).
2. Klik **New project**.
3. Pilih organization.
4. Isi konfigurasi project.

| Pengaturan | Rekomendasi |
|---|---|
| Project name | `ar-store-v2` atau nama lain yang jelas |
| Database password | Password acak minimal 16 karakter |
| Region | Southeast Asia / Singapore |
| Pricing plan | Sesuaikan kebutuhan; Free cukup untuk development |

5. Simpan database password di password manager.
6. Klik **Create new project**.
7. Tunggu sampai project berstatus **Active/Healthy**.

Database password berbeda dari API key. Aplikasi tidak menggunakan database password secara langsung, tetapi password tersebut diperlukan untuk koneksi database atau Supabase CLI.

---

## 4. Mengambil URL dan API Keys

### 4.1 Project URL

Buka:

```text
Settings → Data API
```

Salin **Project URL** menggunakan tombol **Copy**. Formatnya:

```text
https://PROJECT_REFERENCE.supabase.co
```

Jangan mengetik Project ID secara manual.

### 4.2 Publishable/anon key

Buka:

```text
Settings → API Keys
```

Untuk `NEXT_PUBLIC_SUPABASE_ANON_KEY`, gunakan salah satu:

- publishable key dengan awalan `sb_publishable_`; atau
- legacy `anon` key.

### 4.3 Secret/service-role key

Untuk `SUPABASE_SERVICE_ROLE_KEY`, gunakan salah satu:

- secret key dengan awalan `sb_secret_`; atau
- legacy `service_role` key.

> Secret/service-role key memberikan akses administratif. Jangan meletakkannya pada variable dengan prefix `NEXT_PUBLIC_`, jangan menggunakannya di browser, dan jangan memasukkannya ke Git.

URL, publishable/anon key, dan secret/service-role key harus berasal dari project yang sama.

Menu **JWT Keys** tidak perlu dikonfigurasi untuk setup aplikasi ini.

---

## 5. Mengatur Environment

Buat atau perbarui `.env.local` di root repository:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REFERENCE_BARU.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PASTE_PUBLISHABLE_ATAU_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=PASTE_SECRET_ATAU_SERVICE_ROLE_KEY

NEXTAUTH_SECRET=PASTE_RANDOM_SECRET
NEXTAUTH_URL=http://localhost:3000

ADMIN_USERNAME=admin
ADMIN_PASSWORD=GANTI_DENGAN_PASSWORD_ADMIN_YANG_KUAT
```

Pastikan setiap variable hanya dideklarasikan satu kali dan tidak memiliki komentar setelah nilai.

### 5.1 Generate `NEXTAUTH_SECRET`

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Salin hasilnya ke `NEXTAUTH_SECRET`.

Mengganti `NEXTAUTH_SECRET` membuat session login lama tidak berlaku. Hal ini normal untuk setup environment baru.

### 5.2 Admin awal

Gunakan username `admin` untuk login pertama:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=PASSWORD_YANG_KUAT
```

Migration membuat profil awal dengan ID `admin-local` dan username `admin`. Username dan password dapat diperbarui melalui menu Profil setelah aplikasi berjalan.

### 5.3 Keamanan environment

- Jangan membagikan `.env.local`.
- Jangan menampilkan API key dalam screenshot.
- Jangan commit `.env.local` atau `.env.local.backup`.
- Jika key pernah terekspos, lakukan rotasi dari Supabase Dashboard.

Repository mengabaikan file `.env*` melalui `.gitignore`.

---

## 6. Membuat Struktur Database

SQL tersedia di folder `supabase/`.

Karena beberapa file migration saat ini memiliki prefix tanggal yang sama, gunakan **Supabase SQL Editor** untuk setup awal. Jangan menjalankan `supabase db push` sebelum nama/version migration dibuat unik.

### 6.1 Urutan SQL

| Urutan | File | Status |
|---:|---|---|
| 1 | `supabase/migrations/20260416_init_mrk_store.sql` | Wajib |
| 2 | `supabase/migrations/20260416_add_activity_logs.sql` | Wajib |
| 3 | `supabase/migrations/20260416_add_harga_to_stock_in.sql` | Lewati untuk database baru |
| 4 | `supabase/migrations/20260417_add_admin_profiles.sql` | Wajib |
| 5 | `supabase/seed/20260812_seed_demo_web.sql` | Opsional, direkomendasikan untuk demo |

Migration `add_harga_to_stock_in` tidak perlu dijalankan pada database baru karena kolom `harga` sudah dibuat oleh migration utama.

### 6.2 Jalankan migration utama

Salin SQL ke clipboard:

```powershell
Get-Content -Raw .\supabase\migrations\20260416_init_mrk_store.sql | Set-Clipboard
```

Di Supabase Dashboard:

1. Buka **SQL Editor**.
2. Klik **New query**.
3. Paste isi clipboard.
4. Klik **Run**.
5. Pastikan tidak ada error.

Migration ini membuat:

- extension `pgcrypto`;
- tabel `profiles`;
- tabel `stock`;
- tabel `stock_in`;
- tabel `stock_out`;
- index;
- trigger `updated_at`;
- Row Level Security dan policy dasar.

### 6.3 Jalankan migration activity log

```powershell
Get-Content -Raw .\supabase\migrations\20260416_add_activity_logs.sql | Set-Clipboard
```

Paste pada query baru dan klik **Run**. Migration ini membuat tabel `activity_logs`, index, dan RLS policy.

### 6.4 Jalankan migration admin profile

```powershell
Get-Content -Raw .\supabase\migrations\20260417_add_admin_profiles.sql | Set-Clipboard
```

Paste pada query baru dan klik **Run**. Migration ini membuat tabel `admin_profiles` serta profil awal:

```text
id        = admin-local
username  = admin
full_name = Admin AR Store
```

`password_hash` awalnya kosong. Login pertama menggunakan `ADMIN_PASSWORD` dari `.env.local`.

### 6.5 Jangan jalankan cleanup pada database baru

File berikut hanya untuk database lama:

```text
supabase/maintenance/cleanup_legacy_database.sql
```

File tersebut tidak dibutuhkan untuk inisialisasi project baru.

---

## 7. Memverifikasi Database

### 7.1 Verifikasi tabel

Jalankan di SQL Editor:

```sql
select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'stock',
    'stock_in',
    'stock_out',
    'activity_logs',
    'admin_profiles'
  )
order by table_name;
```

Hasil harus memuat:

```text
activity_logs
admin_profiles
profiles
stock
stock_in
stock_out
```

### 7.2 Verifikasi kolom

```sql
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'stock',
    'stock_in',
    'stock_out',
    'activity_logs',
    'admin_profiles'
  )
order by table_name, ordinal_position;
```

### 7.3 Verifikasi admin awal

```sql
select
  id,
  username,
  full_name,
  password_hash,
  updated_at
from public.admin_profiles;
```

Hasil awal harus memiliki profil `admin-local`. Nilai `password_hash = null` masih normal sebelum password disimpan melalui menu Profil.

### 7.4 Verifikasi RLS

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'stock',
    'stock_in',
    'stock_out',
    'activity_logs',
    'admin_profiles'
  )
order by tablename;
```

`rowsecurity` seharusnya bernilai `true`. API server menggunakan secret/service-role key untuk akses administratif dan bypass RLS.

### 7.5 Pastikan Data API mengekspos schema `public`

Buka:

```text
Settings → Data API
```

Pastikan `public` termasuk dalam exposed schemas. Pada project baru, schema ini biasanya sudah aktif secara default.

---

## 8. Mengisi Data Contoh (Opsional)

Lewati tahap ini jika ingin database kosong.

Seed demo membuat:

- 24 data stock dengan tipe dan harga yang bervariasi;
- 24 transaksi stock masuk;
- 14 transaksi stock keluar;
- 10 stock berstatus `available` dan 14 berstatus `sold`;
- 40 activity log untuk aksi `create`, `checkout`, `update`, dan `delete`;
- transaksi bulan berjalan dan bulan sebelumnya untuk grafik serta perbandingan profit dashboard.

Salin seed:

```powershell
Get-Content -Raw .\supabase\seed\20260812_seed_demo_web.sql | Set-Clipboard
```

Paste pada query baru di SQL Editor dan klik **Run**.

> Seed demo aman dijalankan ulang. Seed hanya mereset data dengan IMEI khusus `359990000000001` sampai `359990000000024` serta activity log dengan `actor_id = 'demo-seed'`; data lain tidak dihapus.

Verifikasi jumlah data:

```sql
select 'stock' as table_name, count(*) as total_rows
from public.stock
union all
select 'stock_in', count(*)
from public.stock_in
union all
select 'stock_out', count(*)
from public.stock_out
union all
select 'activity_logs', count(*)
from public.activity_logs;
```

Jika database sebelumnya kosong, jumlah yang diharapkan adalah:

```text
stock          24
stock_in       24
stock_out      14
activity_logs  40
```

Query terakhir di seed juga menampilkan ringkasan khusus data demo:

```text
total_stock_demo = 24
stok_tersedia    = 10
barang_terjual   = 14
activity_demo    = 40
```

---

## 9. Mengatur Supabase Storage

Aplikasi menggunakan bucket:

```text
profile-avatars
```

Bucket dibuat otomatis ketika avatar pertama kali diunggah melalui menu Profil. Konfigurasi aplikasinya:

- public bucket;
- batas file 2 MB;
- aplikasi menerima PNG, JPEG, dan WebP.

### Membuat bucket manual (opsional)

1. Buka **Storage**.
2. Klik **New bucket**.
3. Isi nama `profile-avatars`.
4. Aktifkan **Public bucket**.
5. Atur file size limit menjadi 2 MB.

Nama bucket harus persis `profile-avatars`.

Upload dilakukan server menggunakan secret/service-role key, sehingga storage policy tambahan tidak dibutuhkan untuk alur aplikasi saat ini.

---

## 10. Menguji DNS dan Data API

### 10.1 Uji DNS

Ganti hostname pada command berikut dengan hostname project baru:

```powershell
Resolve-DnsName PROJECT_REFERENCE_BARU.supabase.co -Type A
Resolve-DnsName PROJECT_REFERENCE_BARU.supabase.co -Type A -Server 1.1.1.1
Resolve-DnsName PROJECT_REFERENCE_BARU.supabase.co -Type A -Server 8.8.8.8
```

Jika DNS default gagal tetapi DNS publik berhasil, bersihkan cache DNS:

```powershell
ipconfig /flushdns
```

Jika semua DNS gagal, periksa status project dan Project URL. Jika project baru yang aktif tetap menghasilkan `NXDOMAIN`, periksa DNS router/ISP atau status Supabase.

### 10.2 Uji Data API tanpa key

```powershell
node --env-file=.env.local -e 'const u=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ""); const started=Date.now(); fetch(`${u}/rest/v1/`).then(async r=>console.log("HTTP",r.status,"in",Date.now()-started,"ms",await r.text())).catch(e=>console.error(e.cause ?? e))'
```

Hasil seperti berikut berarti DNS dan koneksi HTTPS berhasil:

```text
HTTP 401 in ... ms
```

`401` normal karena probe tidak mengirim API key. Yang penting tidak ada `ENOTFOUND` atau connect timeout.

### 10.3 Uji dengan Supabase client dan secret key

```powershell
node --env-file=.env.local -e 'const {createClient}=require("@supabase/supabase-js"); const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}); s.from("stock").select("id").limit(0).then(({data,error})=>{if(error){console.error(error);process.exitCode=1}else{console.log("Supabase OK",data)}})'
```

Hasil yang diharapkan:

```text
Supabase OK []
```

`.limit(0)` sengaja tidak mengambil data. Command hanya memverifikasi URL, key, Data API, dan keberadaan tabel.

### Interpretasi error

| Error | Penyebab umum |
|---|---|
| `ENOTFOUND` | DNS gagal atau Project URL salah |
| `Invalid API key` | Key salah atau berasal dari project berbeda |
| `PGRST205` | Tabel belum dibuat atau schema tidak diekspos |
| `permission denied` | Key bukan secret/service-role atau masalah permission |
| `fetch failed` | Masalah jaringan, TLS, proxy, atau project |
| `Supabase OK []` | URL, key, Data API, dan tabel valid |

---

## 11. Menjalankan Aplikasi

Setelah semua probe berhasil:

```powershell
npm run dev
```

Buka:

```text
http://localhost:3000
```

Login menggunakan:

```text
Username: admin
Password: nilai ADMIN_PASSWORD dari .env.local
```

Setiap perubahan `.env.local` membutuhkan restart development server.

---

## 12. Menginisialisasi Admin

Setelah login pertama:

1. Buka menu **Profil**.
2. Pertahankan username `admin` untuk konfigurasi awal, atau ubah sesuai kebutuhan.
3. Isi nama lengkap.
4. Masukkan password baru.
5. Simpan profil.
6. Logout.
7. Login kembali menggunakan username/password baru.

Ketika password disimpan dari menu Profil, aplikasi membuat hash menggunakan `scrypt` dan menyimpannya pada `admin_profiles.password_hash`.

Verifikasi:

```sql
select
  id,
  username,
  full_name,
  password_hash is not null as has_password,
  updated_at
from public.admin_profiles;
```

Hasil yang diharapkan:

```text
has_password = true
```

Jangan membagikan nilai `password_hash`.

---

## 13. Smoke Test

### Dashboard

- [ ] Halaman tampil tanpa error.
- [ ] Statistik stock, omzet, dan profit muncul.
- [ ] Grafik dapat dirender.
- [ ] `/api/dashboard` mengembalikan HTTP 200.

### Activity

- [ ] Daftar aktivitas dapat dimuat.
- [ ] `/api/activity` mengembalikan HTTP 200.

### Stock

- [ ] Daftar stock dapat dimuat.
- [ ] Tambah stock berhasil.
- [ ] Edit stock berhasil.
- [ ] Hapus stock berhasil.
- [ ] IMEI duplikat ditolak.

### Barang Masuk

- [ ] Daftar transaksi masuk tampil.
- [ ] Tambah transaksi masuk berhasil.
- [ ] Stock available terbentuk sesuai transaksi.

### Barang Keluar

- [ ] Stock available tampil pada pilihan.
- [ ] Transaksi keluar berhasil.
- [ ] Status stock berubah menjadi `sold`.
- [ ] Keuntungan dihitung dengan benar.

### Laporan

- [ ] Data laporan tampil.
- [ ] Filter periode bekerja.
- [ ] Ekspor PDF berhasil.

### Profil

- [ ] Profil dapat dimuat.
- [ ] Username dan nama dapat diperbarui.
- [ ] Password dapat disimpan.
- [ ] Avatar maksimal 2 MB dapat diunggah.
- [ ] Bucket `profile-avatars` tersedia.

### Validasi project

```powershell
npm audit
npm run lint
npm run build
```

Target:

- `npm audit` menampilkan `found 0 vulnerabilities`;
- lint selesai tanpa error;
- build menampilkan `Compiled successfully`.

Build tidak menjalankan query runtime ke Supabase, sehingga smoke test menu tetap wajib.

---

## 14. Troubleshooting

### `ENOTFOUND`

```text
getaddrinfo ENOTFOUND PROJECT_REFERENCE.supabase.co
```

Periksa:

- Project URL dari menu Data API;
- status project Active/Healthy;
- DNS Windows, router, atau ISP;
- VPN, proxy, firewall, atau antivirus;
- status layanan Supabase.

### `Invalid API key`

Pastikan URL dan kedua key berasal dari project yang sama. Setelah memperbarui `.env.local`, restart `npm run dev`.

### Tabel tidak ditemukan

Jika `stock`, `stock_in`, atau `stock_out` tidak ditemukan, jalankan:

```text
supabase/migrations/20260416_init_mrk_store.sql
```

Jika `activity_logs` tidak ditemukan, jalankan:

```text
supabase/migrations/20260416_add_activity_logs.sql
```

Jika `admin_profiles` tidak ditemukan, jalankan:

```text
supabase/migrations/20260417_add_admin_profiles.sql
```

### Upload avatar gagal

Pastikan bucket `profile-avatars` tersedia, public, dan project menggunakan secret/service-role key yang benar.

### Login berhasil tetapi semua menu gagal

Login dapat menggunakan fallback `ADMIN_USERNAME` dan `ADMIN_PASSWORD` ketika Supabase gagal. Login berhasil tidak membuktikan koneksi database sehat. Jalankan kembali probe DNS dan Supabase client pada bagian 10.

### Request ganda pada development

React Strict Mode dapat menjalankan effect lebih dari sekali pada `npm run dev`. Hal ini dapat menghasilkan request API atau toast ganda, tetapi bukan penyebab HTTP 500 dari database.

---

## 15. Checklist Keamanan

- [ ] Project URL disalin dari menu Data API.
- [ ] Publishable/anon key berasal dari project baru.
- [ ] Secret/service-role key berasal dari project baru.
- [ ] Secret/service-role key tidak memakai prefix `NEXT_PUBLIC_`.
- [ ] `.env.local` dan backup-nya tidak masuk Git.
- [ ] `NEXTAUTH_SECRET` dibuat secara acak.
- [ ] `ADMIN_PASSWORD` bukan nilai default `admin123`.
- [ ] Database password disimpan di password manager.
- [ ] Tidak ada key pada screenshot, log, atau dokumentasi publik.
- [ ] Project lama belum dihapus sebelum project baru lulus pengujian.
- [ ] Seluruh migration wajib berhasil dijalankan.
- [ ] Probe Supabase menampilkan `Supabase OK []`.
- [ ] Seluruh menu lulus smoke test.
- [ ] Audit, lint, dan build berhasil.

---

## Ringkasan Urutan Setup

```text
Buat project Supabase baru
→ tunggu project Active
→ salin Project URL dan API keys
→ perbarui .env.local
→ jalankan migration utama
→ jalankan migration activity logs
→ jalankan migration admin profiles
→ jalankan seed jika diperlukan
→ uji DNS
→ uji Data API
→ uji Supabase client
→ jalankan aplikasi
→ login admin
→ simpan password melalui menu Profil
→ smoke test seluruh menu
→ jalankan audit, lint, dan build
```
