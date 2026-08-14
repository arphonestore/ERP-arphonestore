# AR Store Inventory Dashboard

<p align="center">
	<img src="public/assets/logo-fix.svg" alt="AR Store Logo" width="150" />
</p>

<p align="center">
	<strong>Modern Phone Inventory Management System</strong><br />
	Kelola stok, transaksi masuk/keluar, laporan, dan aktivitas operasional dalam satu dashboard.
</p>

<p align="center">
	<img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
	<img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react" />
	<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white" />
	<img alt="Tailwind" src="https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwind-css&logoColor=white" />
	<img alt="Supabase" src="https://img.shields.io/badge/Supabase-2-3ecf8e?logo=supabase&logoColor=white" />
</p>

---

## Tentang Proyek

AR Store Inventory Dashboard adalah aplikasi manajemen inventory handphone yang dirancang untuk mempercepat proses operasional toko sehari-hari.

Fokus utama proyek ini:

- pencatatan data yang cepat dan rapi,
- pelacakan transaksi yang akurat,
- pelaporan yang siap export,
- tampilan dashboard yang responsif di desktop, tablet, dan mobile.

## Fitur Unggulan

### 1) Dashboard Monitoring

- Ringkasan KPI transaksi dan performa inventory.
- Grafik visual untuk membantu analisis cepat.

### 2) Manajemen Inventory

- CRUD data stock barang.
- Status stok tersedia dan terjual.

### 3) Transaksi Barang Masuk

- Input data pemasok dan harga modal.
- KPI barang masuk per periode.

### 4) Transaksi Barang Keluar

- Alur draft checkout multi-item.
- Perhitungan keuntungan otomatis.

### 5) Laporan Periode

- Filter laporan: hari ini, bulan ini, custom range.
- Export laporan transaksi ke PDF.

### 6) Activity Log

- Riwayat aktivitas sistem bersifat read-only.
- Transparansi perubahan data.

### 7) Profil Admin

- Update data profil dan foto.
- Update password dengan toggle show/hide.

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, shadcn/ui, Lucide |
| Language | TypeScript |
| Auth | NextAuth.js |
| Database & Backend | Supabase |
| Chart | Recharts |
| Date Handling | react-day-picker, date-fns |
| Export | jsPDF |

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Setup environment

Buat file `.env.local` dari `.env.example`, lalu isi nilainya:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
ADMIN_USERNAME=
ADMIN_PASSWORD=
CRON_SECRET=
ACTIVITY_RETENTION_DAYS=180
```

Atau langsung copy:

```bash
cp .env.example .env.local
```

### 3. Run development server

```bash
npm run dev
```

App akan berjalan di `http://localhost:3000`.

### 4. Build & run production

```bash
npm run build
npm run start
```

---

## Deployment Vercel

Project menggunakan Vercel sebagai target deployment dan menyediakan `vercel.json` untuk menjalankan activity-retention cron setiap hari pukul 02:00 UTC.

Di **Vercel > Project Settings > Environment Variables**, isi untuk scope `Production`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `CRON_SECRET`
- `ACTIVITY_RETENTION_DAYS` (opsional, default `180`)
- `ADMIN_USERNAME` dan `ADMIN_PASSWORD` hanya jika bootstrap admin belum selesai

Gunakan `NEXTAUTH_URL` yang sama persis dengan origin production final, misalnya `https://inventory.example.com`. Setelah bootstrap berhasil dan hash password tersimpan di Supabase, hapus kredensial bootstrap dari Vercel.

Panduan import project, pemindahan custom domain dari Netlify, cron, validasi, dan rollback tersedia di [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md).

---

## Struktur Singkat

```text
src/
	app/                  # Routing dan halaman
	components/features/  # Fitur utama (dashboard, stock, laporan, dst.)
	components/ui/        # Komponen UI reusable
	lib/                  # Utility, auth, format, helper
	types/                # Tipe data aplikasi
```
