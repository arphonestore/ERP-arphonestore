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

## Setup ENV Vercel

Di Vercel, buka Project Settings > Environment Variables, lalu isi variabel berikut untuk scope `Production` (dan `Preview` jika dipakai):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `ADMIN_USERNAME` dan `ADMIN_PASSWORD` hanya untuk bootstrap pertama
- `CRON_SECRET`
- `ACTIVITY_RETENTION_DAYS` (opsional, default `180`)

Contoh nilai `NEXTAUTH_URL`:

- Local: `http://localhost:3000`
- Preview: `https://your-project-git-branch-your-team.vercel.app`
- Production: `https://your-domain.com`

Catatan penting:

- Jangan pakai secret/key dari `.env.local` lama untuk public repository.
- Gunakan nilai berbeda untuk local dan production.
- Pastikan `NEXTAUTH_URL` sesuai domain aktif agar login callback tidak gagal.
- Jalankan migration `supabase/migrations/` secara berurutan sebelum mempromosikan deployment.
- Setelah login pertama berhasil dan hash admin tersimpan, hapus `ADMIN_USERNAME` dan `ADMIN_PASSWORD` dari environment Vercel.

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

---

## Creator

**iam-rmdhn**

Jika README ini masih ingin dibuat versi portfolio (dengan screenshot section dan demo flow), saya bisa lanjutkan ke versi showcase.
