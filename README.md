# SaratRasaaa Web

SaratRasaaa Web runs the operational side of a volunteer event end to end, from the moment someone registers to the moment they are checked in on the day. Volunteer coordination usually ends up scattered across a registration form, a spreadsheet, a separate payment process and a WhatsApp group; this app keeps registration, payment, check-in and volunteer recognition in one place, with an admin panel for the organizers running it.

[Baca dalam Bahasa Indonesia di bawah](#bahasa-indonesia)

## What it does

- **Registration**: public sign-up for an event, with OTP (one-time password) verification so a registration is tied to a real, reachable phone number, and a status check page so a registrant can look up where their own registration stands without asking an organizer.
- **Payment**: a registrant uploads proof of payment, an admin confirms it, and a payment webhook (integrated with YoBasePay) can also confirm it automatically; the webhook is protected by a shared secret and an IP allowlist, so only requests that are genuinely from YoBasePay are trusted.
- **Check-in**: on event day, check-in includes a selfie upload, which gives organizers a simple way to confirm the person checking in is the person who registered.
- **Messaging**: WhatsApp notifications sent through Fonnte, including a mass broadcast feature with name templates, where `{nama}` in a message is replaced with each recipient's short/nickname rather than their full registered name, because that is how a message actually reads naturally in Indonesian.
- **Admin panel**: event management, drag-and-drop reordering (for example, reordering event sessions or registrant priority), a select-all action on the registrant list for bulk operations, finance records, and testimonials collected from past volunteers.
- **Public pages**: a volunteer leaderboard, volunteer history, an event photo gallery, and public statistics.
- **Resilience and SEO**: the app degrades gracefully instead of showing a raw error when the database is paused (which Supabase does automatically on free-tier projects after a period of inactivity), and pages carry SEO metadata so shared links preview properly.

## Tech stack

Next.js, TypeScript, Tailwind CSS, shadcn/ui, Prisma, Supabase Storage for file uploads (payment proofs, selfies, gallery photos), deployed on Vercel. The data models are `Event`, `Pendaftar` (registrant), `Peserta` (participant), `CheckIn`, `Keuangan` (finance), `Testimoni`, `OtpVerification` and `WebhookLog`.

## Getting started

```bash
npm install
cp .env.example .env     # fill in the values below
npm run db:push
npm run dev
```

### Environment variables

`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN`, `ADMIN_URL_SECRET`, `FONNTE_TOKEN`, `YOBASEPAY_API_KEY`, `WEBHOOK_SECRET`, `WEBHOOK_IP_ALLOWLIST`, `MAX_UPLOAD_BYTES`. Keep the service role key and every token on the server side only; none of them should ever be exposed to a page running in the browser. `sync_env.ps1` is a convenience script that pushes the values from a local `.env` up to Vercel's environment variable settings using the Vercel CLI, for when a value changes locally and needs to be mirrored to production.

## Project structure

```
src/app/        pages and API routes (daftar, cek-status, upload-bukti, upload-selfie, otp, webhook, leaderboard, ...)
src/components/ UI
src/lib/        server-side helpers
prisma/         the database schema
```

---

## Bahasa Indonesia

SaratRasaaa Web menjalankan sisi operasional sebuah kegiatan relawan dari ujung ke ujung, sejak seseorang mendaftar sampai dia check-in pada hari acara. Koordinasi relawan biasanya berakhir tersebar di formulir pendaftaran, spreadsheet, proses pembayaran terpisah, dan grup WhatsApp; aplikasi ini menyatukan pendaftaran, pembayaran, check-in, dan pengakuan relawan di satu tempat, dengan panel admin untuk panitia yang menjalankannya.

### Fungsi

- **Pendaftaran**: pendaftaran publik untuk sebuah event, dengan verifikasi OTP (kata sandi sekali pakai) sehingga pendaftaran terkait ke nomor telepon yang nyata dan bisa dihubungi, serta halaman cek status sehingga pendaftar bisa melihat posisi pendaftarannya sendiri tanpa harus bertanya ke panitia.
- **Pembayaran**: pendaftar mengunggah bukti bayar, admin mengonfirmasinya, dan webhook pembayaran (terintegrasi dengan YoBasePay) juga bisa mengonfirmasinya secara otomatis; webhook ini dilindungi secret bersama dan daftar IP yang diizinkan, sehingga hanya permintaan yang benar-benar dari YoBasePay yang dipercaya.
- **Check-in**: pada hari acara, check-in mencakup unggah selfie, yang memberi panitia cara sederhana memastikan orang yang check-in adalah orang yang mendaftar.
- **Pesan**: notifikasi WhatsApp lewat Fonnte, termasuk fitur broadcast massal dengan templat nama, di mana `{nama}` dalam pesan diganti dengan nama panggilan/pendek setiap penerima, bukan nama lengkap yang terdaftar, karena begitulah sebuah pesan terasa alami dalam bahasa Indonesia.
- **Panel admin**: pengelolaan event, pengurutan seret-dan-lepas (misalnya mengurutkan ulang sesi event atau prioritas pendaftar), aksi pilih semua di daftar pendaftar untuk operasi massal, catatan keuangan, dan testimoni yang dikumpulkan dari relawan sebelumnya.
- **Halaman publik**: papan peringkat relawan, riwayat relawan, galeri foto event, dan statistik publik.
- **Ketahanan dan SEO**: aplikasi tetap berjalan dengan baik, bukan menampilkan galat mentah, saat database dijeda (yang dilakukan Supabase secara otomatis pada proyek tingkat gratis setelah periode tidak aktif), dan halaman membawa metadata SEO sehingga tautan yang dibagikan menampilkan pratinjau yang baik.

### Teknologi

Next.js, TypeScript, Tailwind CSS, shadcn/ui, Prisma, Supabase Storage untuk unggahan berkas (bukti bayar, selfie, foto galeri), dideploy di Vercel. Model data: `Event`, `Pendaftar`, `Peserta`, `CheckIn`, `Keuangan`, `Testimoni`, `OtpVerification`, dan `WebhookLog`.

### Menjalankan

```bash
npm install
cp .env.example .env     # isi nilai di bawah
npm run db:push
npm run dev
```

### Variabel lingkungan

`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN`, `ADMIN_URL_SECRET`, `FONNTE_TOKEN`, `YOBASEPAY_API_KEY`, `WEBHOOK_SECRET`, `WEBHOOK_IP_ALLOWLIST`, `MAX_UPLOAD_BYTES`. Simpan service role key dan setiap token hanya di sisi server; tidak satu pun boleh sampai terekspos ke halaman yang berjalan di peramban. `sync_env.ps1` adalah skrip bantu yang mengirim nilai dari `.env` lokal ke pengaturan variabel lingkungan Vercel lewat Vercel CLI, untuk saat sebuah nilai berubah secara lokal dan perlu dicerminkan ke produksi.

### Struktur

```
src/app/        halaman dan rute API-nya (daftar, cek-status, upload-bukti, upload-selfie, otp, webhook, leaderboard, ...)
src/components/ UI
src/lib/        pembantu sisi server
prisma/         skema database
```
