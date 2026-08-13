# Perbandingan Implementasi Hasil Audit

Tanggal implementasi: 13 Agustus 2026

## Status

| Tahap | Status |
|---|---|
| Sebelum perubahan | **NO-GO production** |
| Setelah perubahan source | **Siap Preview/Staging** |
| Production | **Bersyarat**: migration, environment Vercel, backup, dan smoke test production wajib diselesaikan |

> Migration belum dijalankan ke project Supabase remote oleh coding agent. Jangan mempromosikan deployment Vercel sebelum seluruh migration baru berhasil diterapkan.

## Ringkasan Sebelum dan Sesudah

| Area audit | Sebelum | Sesudah |
|---|---|---|
| Autentikasi | Memiliki fallback `NEXTAUTH_SECRET`, username, dan password default | Fail-closed; secret wajib minimal 32 karakter dan tidak ada credential default |
| Gangguan Supabase saat login | Error database dapat tetap menghasilkan session fallback | Error database selalu menggagalkan login |
| Bootstrap admin | Credential environment dapat terus menjadi jalur login | Credential env hanya dipakai satu kali saat `password_hash` masih kosong; setelah login pertama hash disimpan |
| Brute force | Tidak ada pembatasan login | Persistent rate limit: 5 kegagalan/15 menit, identifier dan IP di-HMAC sebelum dikirim ke DB |
| Password | Scrypt sinkron, minimum 6 karakter | Scrypt async dengan format versioned; format legacy tetap dapat diverifikasi; password baru minimum 12 karakter |
| Ganti password | Tidak meminta password lama dan session lama tetap aktif | Wajib current password; `session_version` naik dan seluruh session lama menjadi tidak valid |
| Masa session | Mengikuti default NextAuth | JWT/session maksimum 8 jam |
| Klaim session | `session.update()` dapat mempercayai nama/username/image dari client | Identitas selalu dimuat ulang dari profil DB berdasarkan immutable user ID |
| Checkout satu item | Read → insert `stock_out` → update stock, tidak atomik | RPC PostgreSQL transaksional dengan row lock, state transition, unique active sale, dan idempotency key |
| Checkout paralel | IMEI yang sama dapat terjual dua kali | Hanya satu active sale per `stock_id`; request bersamaan diserialisasi/ditolak |
| Batch checkout | Loop HTTP; sebagian item dapat berhasil | Satu RPC batch atomik; semua item commit atau seluruh batch rollback |
| Barang masuk | Beberapa query dan compensating delete best-effort | Create/update/void melalui RPC transaksional dengan activity log dalam transaction yang sama |
| Delete histori | Hard delete dan dapat meninggalkan orphan | Soft lifecycle memakai `voided_at` dan `archived_at` |
| Relasi inventory | Hanya mengandalkan IMEI text | `stock_in.stock_id` dan `stock_out.stock_id` dengan foreign key serta index |
| Halaman Stock | Dapat membuat/edit/hapus master stock di luar histori | Read-only; perubahan hanya melalui Barang Masuk/Keluar |
| IMEI | Tidak dinormalisasi konsisten | Dinormalisasi dan divalidasi menjadi tepat 15 digit pada API dan RPC |
| Validasi API | Sebagian besar memakai `body.*` langsung | Shared strict Zod schemas, safe JSON parsing, batas body, validasi tanggal/harga/UUID/query |
| Error database | Pesan Supabase/Postgres dikirim ke client | Pesan publik generik, SQLSTATE dipetakan, correlation ID tersedia, detail hanya di server log |
| RLS/grants | Role Supabase `authenticated` mempunyai policy luas | Policy operasional dihapus, grants `anon/authenticated` dicabut, hanya service role server yang mengakses |
| Activity log | Penulisan best-effort; GET menghapus log >2 bulan | Mutasi inventory/profile menulis log transaksional; GET benar-benar read-only |
| Retensi log | Berjalan sebagai efek samping GET | Vercel Cron harian, default 180 hari, dilindungi `CRON_SECRET` |
| Update profil | DB/file Storage mudah menjadi tidak sinkron | Upload baru → commit DB → cleanup lama; upload baru dihapus kembali jika commit gagal |
| Validasi avatar | Mempercayai MIME client | Memeriksa MIME, ukuran, dan magic bytes PNG/JPEG/WebP |
| Resolusi profil | Dapat fallback berdasarkan username | Hanya immutable `session.user.id`; profil yang hilang dianggap kesalahan konfigurasi |
| Query data | Banyak endpoint mengambil seluruh tabel sekali request | Filter DB, pagination opsional, internal paging untuk mencegah silent truncation, dan batas eksplisit |
| Laporan | Mengambil seluruh histori ke browser; snapshot dapat stale | Query mengikuti periode aktif; refresh wajib sebelum PDF; timestamp WIB dan stale indicator |
| Dashboard filter | Auto-refresh dapat kembali ke periode terbaru tanpa mengubah dropdown | Active range tetap dipakai saat auto-refresh; request lama dibatalkan/diabaikan |
| KPI finansial | “Profit Bersih”, KPI duplikat omzet, baseline nol menjadi 100% | Label “Laba Kotor” dan “Modal Terjual”; KPI duplikat dihapus; baseline nol menjadi tidak tersedia |
| Grafik | Omzet dan profit ditumpuk sehingga melebihkan nilai | Bar omzet dan laba ditampilkan berdampingan |
| Timezone | Date-only memakai UTC di beberapa alur | Tanggal bisnis menggunakan date-only lokal dan kebijakan `Asia/Jakarta` |
| Network failure | Beberapa form dapat terkunci; hasil checkout ambigu | `try/catch/finally`, timeout, retry aman, idempotency, reconciliation, dan data lama dipertahankan |
| Draft checkout | Hanya React state | Disimpan di `sessionStorage` dengan idempotency key stabil |
| Aksesibilitas | Dialog/select/sidebar minim focus management | Focus trap/restore, Escape, body lock, ARIA IDs, keyboard select, dan modal mobile diperbaiki |
| Login performance | Dua WebGL renderer dapat aktif | Satu renderer, pause saat tersembunyi, reduced-motion/static fallback |
| PDF | `jsPDF` dimuat pada initial bundle | Dynamic import saat export dan page breaking diperkuat |
| Security headers | Tidak dikonfigurasi | CSP, frame protection, nosniff, referrer policy, permissions policy, dan API no-store |
| Next.js 16 | Masih memakai `middleware.ts` | Menggunakan `proxy.ts` dengan matcher halaman yang lebih sempit |
| Vercel runtime | Node/region tidak dipin | Node `22.x`, region `sin1`, health endpoint, dan cron config |
| Health/observability | Tidak ada readiness check/correlation ID | `/api/health`, structured safe logging, dan `X-Correlation-ID` pada endpoint operasional |
| Asset/PWA | Logo tidak ditemukan dan manifest placeholder | Referensi `logo-fix.svg`, manifest AR Store, dan metadata `noindex` |
| Environment | README menunjuk `.env.example` yang tidak ada dan menampilkan default lemah | `.env.example` tersedia tanpa nilai default rahasia; anon key tidak lagi diperlukan |
| Dependency | Direct Supabase browser helpers dan beberapa dependency tidak dipakai | Direct browser Supabase path serta dependency/form helper legacy dihapus |
| Migration | Version tidak unik dan activity schema berada di seed | Timestamp unik; activity schema dipindahkan ke migration; hardening dan transaction RPC ditambahkan |

## File Utama yang Berubah

### Keamanan dan autentikasi

- `src/lib/auth-options.ts`
- `src/lib/auth-secret.ts`
- `src/lib/password.ts`
- `src/lib/api-auth.ts`
- `src/types/next-auth.d.ts`
- `proxy.ts`

### API dan transaksi inventory

- `src/app/api/stock/**`
- `src/app/api/stock-in/**`
- `src/app/api/stock-out/**`
- `src/app/api/dashboard/route.ts`
- `src/app/api/activity/route.ts`
- `src/lib/api/contracts.ts`
- `src/lib/api/database.ts`
- `src/lib/api/http.ts`
- `src/lib/api/jakarta-time.ts`

### Profil dan operasional

- `src/app/api/profile/**`
- `src/app/api/health/route.ts`
- `src/app/api/cron/activity-retention/route.ts`
- `src/lib/observability/logger.ts`
- `vercel.json`

### Database

- `supabase/migrations/202608130001_database_hardening.sql`
- `supabase/migrations/202608130002_operational_transactions.sql`
- Seluruh migration lama telah dinormalisasi menjadi timestamp unik.

### Frontend

- `src/components/features/DashboardLive.tsx`
- `src/components/features/StockCrud.tsx`
- `src/components/features/StockInCrud.tsx`
- `src/components/features/StockOutCrud.tsx`
- `src/components/features/LaporanDashboard.tsx`
- `src/components/features/ActivityDashboard.tsx`
- `src/components/features/ProfileSettings.tsx`
- `src/components/laporan-export.tsx`
- Komponen dialog/select/sidebar/login terkait aksesibilitas dan resilience.

## Urutan Migration Baru

1. `202604160001_init_mrk_store.sql`
2. `202604160002_add_activity_logs.sql`
3. `202604160003_add_harga_to_stock_in.sql`
4. `202604170001_add_admin_profiles.sql`
5. `202608120001_normalize_admin_store_name.sql`
6. `202608130001_database_hardening.sql`
7. `202608130002_operational_transactions.sql`

Untuk database lama yang sudah mencatat nama migration sebelumnya, gunakan `supabase migration repair` sebelum `supabase db push`. Jangan menjalankan rename migration secara buta terhadap production history.

## Environment Vercel Wajib

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXTAUTH_SECRET
NEXTAUTH_URL
CRON_SECRET
ACTIVITY_RETENTION_DAYS
```

`ADMIN_USERNAME` dan `ADMIN_PASSWORD` hanya dibutuhkan untuk bootstrap pertama saat `admin_profiles.password_hash` masih kosong. Setelah login pertama berhasil, hapus keduanya dari Vercel Environment Variables.

## Langkah Wajib Sebelum Production

1. Backup database dan bucket `profile-avatars`.
2. Terapkan seluruh migration ke Supabase staging/production.
3. Verifikasi policy/grants aktual: `anon` dan `authenticated` tidak boleh mengakses tabel operasional.
4. Atur environment Vercel tanpa menggunakan nilai development.
5. Deploy ke Vercel Preview.
6. Pastikan `GET /api/health` mengembalikan `200`.
7. Jalankan smoke test:
   - login valid/invalid dan rate limit;
   - CRUD Barang Masuk melalui RPC;
   - dua checkout paralel untuk IMEI sama;
   - batch checkout all-or-nothing;
   - void barang masuk/keluar;
   - perubahan password memaksa login ulang;
   - filter dashboard tetap konsisten setelah 30 detik;
   - laporan/PDF sesuai periode dan WIB;
   - upload serta cleanup avatar.
8. Setelah bootstrap admin berhasil, hapus `ADMIN_USERNAME` dan `ADMIN_PASSWORD` dari Vercel.
9. Promote Preview ke Production hanya setelah semua smoke test lulus.

## Validasi Source yang Sudah Dilakukan

```text
npm run build          LULUS
npm run typecheck      LULUS
npm run lint           LULUS
npm audit --omit=dev   LULUS — 0 vulnerability
Project diagnostics    0 error; 5 warning parser CSS untuk directive Tailwind 4 (build/lint tetap lulus)
```

## Verifikasi Eksternal yang Tetap Diperlukan

Hal berikut tidak dapat diselesaikan hanya melalui source code:

- Menjalankan migration pada Supabase remote.
- Memastikan Supabase Auth self-signup/provider yang tidak digunakan telah dinonaktifkan.
- Mengaktifkan backup/PITR sesuai plan Supabase dan melakukan restore drill.
- Backup terpisah untuk objek Supabase Storage.
- Memasang alert Vercel untuk API `5xx`, latency, dan cron failure.
- Memverifikasi domain production, HTTPS, `NEXTAUTH_URL`, dan header aktual deployment.
- MFA/WebAuthn admin jika tingkat keamanan toko memerlukannya.

## Kesimpulan

Blocker kode utama dari audit—fail-open auth, double-sale, mutasi non-atomik, RLS permisif, validasi lemah, session tidak dapat dicabut, query tidak terkontrol, dan frontend yang tidak tahan error—telah diperbaiki. Status production tetap bersyarat sampai migration remote, environment, backup, dan smoke test Vercel Preview selesai.
