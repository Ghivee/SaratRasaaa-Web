# SaratRasaaa Web

Aplikasi web untuk mengelola kegiatan relawan: pendaftaran publik, pembayaran, check-in dengan selfie, dan panel admin untuk panitia. Aplikasi ini juga menyimpan papan peringkat dan riwayat relawan.

[English](README.md)

## Fungsi

- **Pendaftaran:** event, pendaftar, dan peserta, dengan verifikasi OTP dan halaman cek status.
- **Pembayaran:** unggah bukti bayar, konfirmasi oleh admin, dan webhook pembayaran (YoBasePay) dengan secret dan daftar IP yang diizinkan.
- **Check-in** dengan unggah selfie.
- **Pesan:** notifikasi WhatsApp lewat Fonnte, dan broadcast massal dengan templat nama (`{nama}` memakai nama panggilan).
- **Panel admin:** pengelolaan event, urutan seret-dan-lepas, pilih semua pendaftar, catatan keuangan, dan testimoni.
- **Halaman publik:** papan peringkat, riwayat relawan, galeri event, dan statistik.
- Penanganan yang halus saat database dijeda, serta metadata SEO.

## Teknologi

Next.js, TypeScript, Tailwind CSS, shadcn/ui, Prisma, Supabase Storage untuk unggahan, dideploy di Vercel. Model data: `Event`, `Pendaftar`, `Peserta`, `CheckIn`, `Keuangan`, `Testimoni`, `OtpVerification`, `WebhookLog`.

## Menjalankan

```bash
npm install
cp .env.example .env     # isi nilai di bawah
npm run db:push
npm run dev
```

### Variabel lingkungan

`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN`, `ADMIN_URL_SECRET`, `FONNTE_TOKEN`, `YOBASEPAY_API_KEY`, `WEBHOOK_SECRET`, `WEBHOOK_IP_ALLOWLIST`, `MAX_UPLOAD_BYTES`. Simpan service role key dan token di server. `sync_env.ps1` mengirim isi `.env` ke Vercel lewat Vercel CLI.

## Struktur

```
src/app/        halaman dan rute API (daftar, cek-status, upload-bukti, upload-selfie, otp, webhook, leaderboard, ...)
src/components/ UI
src/lib/        pembantu sisi server
prisma/         skema
```
