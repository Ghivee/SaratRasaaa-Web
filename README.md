# SaratRasaaa Web

A web app for running volunteer events: public registration, payment, check-in with a selfie, and an admin panel for the organisers. It also keeps a volunteer leaderboard and history.

[Bahasa Indonesia](README.id.md)

## What it does

- **Registration:** events, registrants and participants, with OTP verification and a status check page.
- **Payment:** upload of payment proof, confirmation by an admin, and a payment webhook (YoBasePay) with a secret and an IP allowlist.
- **Check-in** with a selfie upload.
- **Messaging:** WhatsApp notifications through Fonnte, and a mass broadcast with name templates (`{nama}` uses the short name).
- **Admin panel:** event management, drag-and-drop ordering, select-all on registrants, finance records and testimonials.
- **Public pages:** leaderboard, volunteer history, event gallery and statistics.
- Graceful handling when the database is paused, and SEO metadata.

## Tech stack

Next.js, TypeScript, Tailwind CSS, shadcn/ui, Prisma, Supabase Storage for uploads, deployed on Vercel. Data models: `Event`, `Pendaftar`, `Peserta`, `CheckIn`, `Keuangan`, `Testimoni`, `OtpVerification`, `WebhookLog`.

## Getting started

```bash
npm install
cp .env.example .env     # fill in the values below
npm run db:push
npm run dev
```

### Environment variables

`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN`, `ADMIN_URL_SECRET`, `FONNTE_TOKEN`, `YOBASEPAY_API_KEY`, `WEBHOOK_SECRET`, `WEBHOOK_IP_ALLOWLIST`, `MAX_UPLOAD_BYTES`. Keep the service role key and tokens on the server. `sync_env.ps1` pushes the values of `.env` to Vercel with the Vercel CLI.

## Project structure

```
src/app/        pages and API routes (daftar, cek-status, upload-bukti, upload-selfie, otp, webhook, leaderboard, ...)
src/components/ UI
src/lib/        server helpers
prisma/         schema
```
