# ALUR SISTEM SARATRASAA
### Panduan Lengkap untuk Pendaftar & Admin

Dokumen ini adalah satu-satunya referensi alur yang perlu diikuti.
Mencakup pendaftaran, isi data, pembayaran, cek status, dan pengelolaan admin.

---

## PRINSIP DASAR SISTEM

Sebelum membaca alur, pahami prinsip ini:

- **Verifikasi pembayaran sepenuhnya otomatis** via YoBasePay dynamic QRIS. Setiap pendaftar mendapat QR unik dengan nominal bulat. Admin tidak perlu cek manual kecuali ada masalah.
- **Nominal selalu bulat.** Tidak ada kode unik tambahan di belakang angka. `totalBayar = jumlahOrang × hargaPerOrang`.
- **Kode referensi adalah nyawa pendaftaran.** Format `SRT-XXXXXX`. Ini satu-satunya cara pendaftar bisa kembali cek status jika browser ditutup.
- **Selfie dikumpulkan saat isi data**, disimpan lokal dulu, dikirim server setelah pendaftaran berhasil tersimpan.
- **Bukti transfer adalah cadangan darurat**, bukan langkah wajib. Ditampilkan tersembunyi (collapsible) supaya tidak membingungkan.

---

## BAGIAN 1 — ALUR PENDAFTAR

### Gambaran Besar

```
Beranda
  └─ [Daftar Sekarang]
       └─ Step 1: Info Event
       └─ Step 2: Isi Data Peserta + Selfie + OTP
       └─ Step 3: Bayar via QR + Auto-verified
       └─ Tiket muncul otomatis
```

---

### STEP 1 — Info Event

**Tujuan:** Pendaftar tahu persis event apa yang didaftar sebelum isi data apapun.

**Konten yang ditampilkan:**
- Foto cover event
- Judul, tanggal, lokasi
- Deskripsi singkat
- Harga per orang
- Progress bar kuota visual: `"X dari Y slot terisi"`

**Badge sisa slot:**

| Kondisi | Badge |
|---|---|
| Sisa > 5 | 🟢 "Y slot tersisa" |
| Sisa 1–5 | 🟡 "Hampir penuh! Y slot tersisa" |
| Sisa 0 | 🔴 "Kuota Penuh" |

**State halaman yang harus ditangani:**

| Kondisi server | Yang ditampilkan | Tombol |
|---|---|---|
| Ada event aktif, kuota tersedia | Info event normal | "Lanjut Daftar →" aktif |
| Ada event aktif, kuota penuh | Info event + badge merah | "Lanjut Daftar →" disabled |
| Tidak ada event aktif | "Belum ada pendaftaran dibuka — pantau @saratrasaaa" | "Kembali ke Beranda" |
| Loading | Skeleton card | — |
| Gagal fetch (network error) | "Gagal memuat info event." | "Coba Lagi" |

**Saat klik "Lanjut Daftar →":**
- Re-fetch kuota dari server (bukan pakai cache) untuk cek kondisi terbaru
- Jika kuota ternyata habis → toast "Maaf, kuota baru saja habis." → update tampilan → tidak lanjut
- Jika masih ada → lanjut ke Step 2

---

### STEP 2 — Isi Data Peserta

**Tujuan:** Kumpulkan data lengkap semua peserta, foto diri tiap peserta, dan verifikasi nomor WA.

---

#### 2A — Form Data Peserta

**Kontrol jumlah peserta:**
- Default: 1 peserta
- Tombol "+ Tambah Peserta" untuk menambah, max = `min(5, sisaKuota)`
- Tombol "Hapus" per peserta (kecuali peserta pertama)
- Tombol "+ Tambah" auto-disable jika sudah di batas maksimal
- Total harga update real-time di bawah list peserta setiap kali jumlah berubah

**Preview harga (real-time, di bawah semua card peserta):**
```
Total: Rp 150.000
(3 orang × Rp 50.000)
```
Nominal selalu bulat, tidak ada angka tambahan di belakang.

**Field per peserta (tiap peserta punya card sendiri):**

| Field | Tipe Input | Validasi | Catatan |
|---|---|---|---|
| Nama Lengkap | text | Min 2 karakter | Label "sesuai KTP" |
| Nama Panggilan | text | Min 1 karakter | Untuk disapa di grup |
| Umur | number | 5–100 tahun | Stepper atau number input |
| Domisili | text | Min 3 karakter | Kota/kabupaten |
| Instagram | text | text | Auto-strip @ di depan |
| Nomor WhatsApp | text | Format WA Indonesia | Normalize otomatis |
| **Foto Diri** | file picker | JPG/PNG, maks 2MB | **Untuk co-card volunteer** |

**Aturan validasi:**
- Error per field muncul setelah user keluar dari field (blur), bukan saat mengetik
- Tombol lanjut hanya aktif jika semua field wajib valid di semua peserta
- Error ditampilkan jelas di bawah field — jangan sembunyikan atau scroll tersembunyi

---

#### 2B — Foto Diri (Selfie) per Peserta

Foto diri ada di bagian bawah tiap PesertaCard, setelah field Nomor WhatsApp.

**Tampilan di card:**
```
Foto Diri (untuk co-card volunteer)        [Opsional]
┌──────────────────┐
│   [Ikon kamera]  │  ← klik untuk pilih foto
│   atau preview   │  ← jika sudah dipilih
└──────────────────┘
JPG atau PNG, maksimal 2 MB
Bisa dilengkapi nanti via halaman Cek Status
```

**Behaviour:**
- Setelah file dipilih → tampilkan preview gambar di dalam kotak
- Foto disimpan di state React (belum kirim ke server sama sekali)
- Ada tombol "Ganti" / "Hapus" di atas preview jika sudah dipilih
- Jika file terlalu besar atau format salah → toast error, reset picker
- Foto yang belum dipilih tidak memblokir tombol lanjut

**PENTING — Foto BELUM dikirim ke server di titik ini.**
Foto baru dikirim ke server setelah `/api/daftar` berhasil dan `kodeReferensi` ada.
Ini karena endpoint upload butuh `kodeReferensi` yang baru terbentuk saat pendaftaran tersimpan.

---

#### 2C — Verifikasi OTP WhatsApp

Setelah semua data valid, klik "Lanjut ke Verifikasi".

**Alur OTP:**

```
Klik "Lanjut ke Verifikasi"
  ↓
Loading: "Mengirim kode OTP ke [nomor WA peserta pertama]..."
  ↓
┌─ Berhasil ────────────────────────────────────────────┐
│  Tampilkan input 6 digit OTP                          │
│  Sub-teks: "Kode dikirim ke [nomor]. Berlaku 5 menit."│
│  Tombol "Kirim Ulang" dengan countdown 60 detik       │
└───────────────────────────────────────────────────────┘
  ↓
┌─ Gagal kirim ─────────────────────────────────────────┐
│  Toast: "Gagal mengirim OTP. Cek nomor WA dan coba   │
│  lagi."                                               │
│  Tetap di form — jangan ganti tampilan               │
│  Tombol "Kirim OTP" aktif kembali setelah 10 detik   │
└───────────────────────────────────────────────────────┘

User isi 6 digit OTP → klik "Verifikasi"
  ↓
┌─ OTP Benar ───────────────────────────────────────────┐
│  → Proses pendaftaran (POST /api/daftar)              │
└───────────────────────────────────────────────────────┘
  ↓
┌─ OTP Salah/Expired ───────────────────────────────────┐
│  Toast: "Kode OTP salah atau sudah kedaluwarsa."      │
│  Biarkan user coba lagi — jangan reset form           │
└───────────────────────────────────────────────────────┘
```

**Aturan OTP:**
- OTP berlaku 5 menit
- Rate limit: 5 percobaan per IP per menit
- Tombol "Kirim Ulang" aktif setelah 60 detik cooldown
- Jika resend: cooldown reset ke 60 detik lagi

---

#### 2D — Proses Setelah OTP Verified

Setelah OTP benar, sistem melakukan ini secara berurutan:

```
POST /api/daftar
  ↓
┌─ 201 Berhasil ────────────────────────────────────────┐
│  Dapat: { kodeReferensi, trxId, qrImageUrl,           │
│           totalBayar, eventJudul, ... }               │
│                                                       │
│  Simpan semua ke sessionStorage key "srt_payment"    │
│  (untuk recovery jika browser di-refresh)            │
│                                                       │
│  Cek: ada peserta dengan foto diri yang dipilih?     │
│    YA → Upload selfie paralel (semua sekaligus)      │
│          Tampilkan: "Menyimpan foto peserta..."       │
│          Berhasil → lanjut Step 3                    │
│          Gagal → toast warning + tetap lanjut Step 3 │
│    TIDAK → Langsung lanjut ke Step 3                 │
└───────────────────────────────────────────────────────┘
  ↓
┌─ 409 Kuota Habis ─────────────────────────────────────┐
│  Toast: "Kuota tidak mencukupi. Sisa slot: X."        │
│  Kembali ke Step 1 dengan data kuota terbaru          │
│  Data form peserta TETAP ADA — tidak dihapus          │
└───────────────────────────────────────────────────────┘
  ↓
┌─ 502 YoBasePay Error ─────────────────────────────────┐
│  Toast: "Gagal membuat transaksi. Coba beberapa detik │
│  lagi."                                               │
│  Tetap di step OTP — data form TIDAK dihapus          │
│  Tombol "Coba Lagi" muncul                            │
└───────────────────────────────────────────────────────┘
  ↓
┌─ 500 / Network Error ─────────────────────────────────┐
│  Toast: "Terjadi kesalahan. Coba lagi."               │
│  Tetap di step OTP — data form TIDAK dihapus          │
└───────────────────────────────────────────────────────┘
```

---

### STEP 3 — Pembayaran

**Tujuan:** Pendaftar scan QR, bayar, verifikasi otomatis, tiket muncul.

---

#### Layout Step 3

```
┌──────────────────────────────────────────┐
│  ⚠️  SIMPAN KODE INI SEKARANG           │ ← BOX PALING ATAS, PALING MENCOLOK
│                                          │
│   SRT-A3BC7D              [📋 Salin]   │
│                                          │
│  Kamu butuh kode ini untuk cek status   │
│  pembayaran jika menutup halaman ini.   │
├──────────────────────────────────────────┤
│                                          │
│       [Gambar QR dari YoBasePay]        │ ← 240×240px
│              Rp 150.000                 │ ← nominal bulat, mono font besar
│                                          │
│   ● Menunggu pembayaran...  ⏱ 14:22   │ ← dot animasi + countdown
│                                          │
├──────────────────────────────────────────┤
│  Foto diri peserta:                     │ ← section kecil
│  • Budi ✅   • Sari ❌ [Upload]        │
│              • Rani ⬜ [Upload]        │
├──────────────────────────────────────────┤
│  ▼ Sudah transfer tapi QR bermasalah?  │ ← COLLAPSIBLE, default TUTUP
│                                          │
│  [Konten tersembunyi — lihat 3C]        │
└──────────────────────────────────────────┘
```

---

#### 3A — Kode Referensi (Paling Penting)

- **Posisi: paling atas, sebelum QR** — tidak boleh digeser ke bawah
- Background box warna aksen yang mencolok (beda dari background halaman)
- Tombol "Salin" → saat diklik → teks berubah jadi "✓ Tersalin!" selama 2 detik
- Kalimat eksplisit soal fungsinya: "Kamu butuh kode ini untuk cek status jika menutup halaman."
- Ini adalah satu-satunya cara user melanjutkan jika browser ditutup sebelum verifikasi

---

#### 3B — QR dan Polling

**Tampilan QR:**
- Gambar QR dari `qrImageUrl` (response YoBasePay via `/api/daftar`)
- Nominal di bawah QR: `Rp 150.000` — format mono font, besar, tidak ada kode tambahan
- Countdown timer berdasarkan `expiredAt` dari YoBasePay: `⏱ 14:22`

**Instruksi singkat di bawah QR:**
```
Scan QR dengan aplikasi pembayaranmu (GoPay, OVO, DANA, dll).
Nominal sudah otomatis terisi — jangan diubah.
```

**Polling otomatis tiap 4 detik** (browser langsung ke YoBasePay):

```
Polling tiap 4 detik → check_public YoBasePay (trxId)
  ↓
SUCCESS
  → Stop polling
  → POST /api/konfirmasi-pembayaran { trxId, kodeReferensi }
  → Hapus sessionStorage "srt_payment"
  → Tampilkan State SUCCESS (lihat 3D)

PENDING
  → Lanjut poll (tidak ada perubahan UI)

EXPIRED / countdown habis
  → Stop polling
  → Tampilkan State EXPIRED (lihat 3E)

Network error 5× berturut-turut
  → Tampilkan banner kuning kecil:
    "Koneksi terputus. Terus mencoba setiap 10 detik..."
  → Lanjut poll dengan interval 10 detik
  → Hilangkan banner jika koneksi kembali
```

---

#### 3C — Bukti Transfer (Cadangan Darurat)

Disembunyikan dalam accordion/collapsible dengan judul: **"Sudah transfer tapi QR bermasalah?"**

Isi saat dibuka:
```
Upload bukti transfer sebagai cadangan.
Admin akan verifikasi dalam 1×24 jam.

[Pilih File — JPG/PNG/PDF, maksimal 2 MB]
```

Setelah upload berhasil:
```
✅ Bukti tersimpan.
Admin akan memverifikasi. Pantau status dengan kode SRT-A3BC7D.
```

Setelah upload gagal:
- Toast: "Gagal menyimpan. Coba lagi atau DM @saratrasaaa."
- Tidak blokir apapun

---

#### 3D — State SUCCESS (Pembayaran Berhasil)

Tampil setelah polling detect SUCCESS + konfirmasi backend berhasil:

```
┌──────────────────────────────────┐
│  ✅ Pembayaran Diterima!         │
│                                  │
│  [Nama Peserta Utama]            │
│  [Jumlah] orang                  │
│  [Judul Event] — [Tanggal]      │
│                                  │
│  [Lihat Tiket Saya →]           │
│  [Bergabung Grup WA →]          │  ← jika linkGrupWa ada
└──────────────────────────────────┘
```

"Lihat Tiket Saya →" → navigasi ke halaman Cek Status dengan `?ref=SRT-A3BC7D` prefill → tiket langsung muncul.

---

#### 3E — State EXPIRED (QR Kedaluwarsa)

```
┌──────────────────────────────────────────┐
│  ⏰ QR Kedaluwarsa                       │
│                                          │
│  QR sudah tidak bisa digunakan.          │
│  Jika kamu sudah transfer, pembayaran    │
│  akan otomatis terverifikasi.            │
│                                          │
│  Kode referensimu: SRT-A3BC7D           │
│                                          │
│  [Cek Status Pendaftaran →]             │
└──────────────────────────────────────────┘
```

Status di database tetap `pending_payment` — TIDAK otomatis rejected.
Admin bisa verifikasi manual jika user sudah transfer.

---

#### 3F — Recovery Jika Browser Di-refresh di Step 3

Saat browser di-refresh, ambil data dari `sessionStorage["srt_payment"]`:

```json
{
  "kodeReferensi": "SRT-A3BC7D",
  "trxId": "YO-ABC123",
  "qrImageUrl": "https://...",
  "expiredAt": "2025-08-01T10:30:00Z",
  "totalBayar": 150000
}
```

Jika data ada:
- Langsung tampilkan Step 3 (skip Step 1 dan 2)
- Cek apakah `expiredAt` sudah lewat:
  - Belum lewat → tampilkan QR + lanjutkan polling
  - Sudah lewat → langsung tampilkan State EXPIRED

Hapus sessionStorage setelah:
- Status SUCCESS
- User klik "Kembali ke Beranda"
- Atau user klik "Cek Status Pendaftaran" dari State EXPIRED

---

## BAGIAN 2 — ALUR CEK STATUS (Pendaftar)

### Cara Akses

- Lewat navbar: tombol "Cek Status"
- Lewat URL langsung: `/cek-status?ref=SRT-A3BC7D` → prefill otomatis + auto-fetch
- Lewat redirect YoBasePay setelah bayar → `/cek-status` (user input kode sendiri)
- Lewat tombol "Lihat Tiket Saya" setelah SUCCESS di Step 3

---

### Mode Lookup

**Mode 1 — Kode Referensi** (default, selalu tampilkan ini duluan):
- Input field: `SRT-XXXXXX`
- Auto uppercase saat mengetik
- Langsung fetch tanpa OTP tambahan
- Paling cepat, direkomendasikan

**Mode 2 — Nomor WA + OTP** (untuk yang lupa kode):
- Tab terpisah atau tombol "Lupa kode?"
- Input nomor WA → kirim OTP ke WA → input OTP 6 digit → fetch
- Tampilkan pendaftaran terbaru dari nomor tersebut
- Alur OTP sama persis dengan Step 2 (cooldown, error handling, dll)

**URL prefill:**
- Jika ada `?ref=SRT-XXXXXX` di URL → auto-isi field kode → auto-trigger fetch
- Berlaku untuk redirect dari halaman Step 3 setelah SUCCESS

---

### Hasil Lookup

#### Status `pending_payment`

```
┌──────────────────────────────────────────┐
│  🟡 Menunggu Pembayaran                  │
│  SRT-A3BC7D                             │
│                                          │
│  Total yang harus dibayar:              │
│  Rp 150.000                             │
│                                          │
│  Scan QR di halaman pendaftaran dan      │
│  bayar nominal di atas.                  │
│                                          │
│  Verifikasi otomatis beberapa menit      │
│  setelah transfer berhasil.             │
│                                          │
│  Belum upload bukti? [Upload di sini]   │
│                                          │
│  Halaman ini auto-refresh tiap 30 detik │
└──────────────────────────────────────────┘
```

Polling di halaman ini: tiap **30 detik** (bukan 4 detik seperti Step 3 — karena user di sini tidak aktif menunggu di depan layar, lebih hemat resource).

Jika QR belum expired (`expiredAt` masih valid), tampilkan QR lagi dari `qrImageUrl` yang tersimpan + mulai polling 4 detik seperti Step 3.

#### Status `verified`

```
┌──────────────────────────────────────────┐
│  ✅ Terverifikasi                        │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  SARATRASAA       ← header pink   │  │
│  │ ·····perforasi tiket············  │  │
│  │  [QR Code 180×180px]              │  │
│  │                                   │  │
│  │  [Nama Peserta Utama]             │  │
│  │  [Judul Event]                    │  │
│  │  [Tanggal] • [Lokasi]            │  │
│  │  [N] orang                        │  │
│  │  SRT-A3BC7D                       │  │
│  │ ·····perforasi tiket············  │  │
│  │  Tunjukkan ke panitia saat hari-H │  │
│  └────────────────────────────────────┘  │
│                                          │
│  [💾 Simpan Tiket]                      │
└──────────────────────────────────────────┘
```

QR di tiket berisi: `SRT-A3BC7D|NamaPesertaUtama|JudulEvent`

Tombol "Simpan Tiket" → generate gambar dari elemen tiket → download PNG.

**Seksi foto diri (di bawah tiket):**
```
Co-card Volunteer
─────────────────
Lengkapi foto diri kamu untuk co-card:

• Budi Santoso     [✅ Foto tersimpan]
• Sari Dewi        [📷 Upload Foto]
• Rani Pratiwi     [📷 Upload Foto]
```

Tombol "Upload Foto" per peserta → file picker → kirim ke server → update tampilan.
Ini untuk yang melewati atau gagal upload selfie di Step 2/3.

#### Status `rejected`

```
┌──────────────────────────────────────────┐
│  ❌ Ditolak                              │
│  SRT-A3BC7D                             │
│                                          │
│  [Catatan dari admin — jika ada]        │
│                                          │
│  Hubungi panitia untuk bantuan:         │
│  DM Instagram @saratrasaaa              │
└──────────────────────────────────────────┘
```

#### Not Found

```
┌──────────────────────────────────────────┐
│  🔍 Tidak Ditemukan                      │
│                                          │
│  Coba cek:                              │
│  • Format kode: SRT- diikuti 6 karakter │
│  • Pastikan semua huruf besar           │
│  • Cek WA kamu untuk kode aslinya       │
│                                          │
│  [Coba Cari dengan Nomor WA]            │
└──────────────────────────────────────────┘
```

---

## BAGIAN 3 — ALUR ADMIN

### Akses

- URL: `https://saratrasaaa-web.vercel.app/[ADMIN_SECRET_PATH]`
- Tidak ada form login
- Setiap request ke API admin menyertakan header `X-Admin-Token`
- Jika token salah → 401 → tampilkan "Akses ditolak"
- Jangan tautkan URL ini dari halaman manapun, jangan screenshot, simpan di password manager

---

### Struktur Dashboard

```
[Kelola Event]  [Pendaftar]  [Webhook Logs]  [Keuangan]
```

---

### Tab 1 — Kelola Event

**List semua event:**

| Kolom | Isi |
|---|---|
| Judul | Nama event |
| Tanggal | Formatted |
| Status | badge: upcoming / active / closed |
| Kuota | "X / Y terisi" |
| Aksi | [Edit] |

Tombol "Buat Event Baru" di atas list.

**Form buat/edit event:**

| Field | Tipe | Wajib |
|---|---|---|
| Judul | text | ✅ |
| Deskripsi | textarea | ✅ |
| Tanggal | date picker | ✅ |
| Lokasi | text | ✅ |
| Foto Cover | upload gambar | ❌ |
| Harga per Orang | number (Rp) | ✅ |
| Kuota Maksimal | number | ✅ |
| Link Grup WhatsApp | url | ❌ |
| Status | dropdown | ✅ |

**Validasi saat simpan:**

Jika status diset ke `active` dan sudah ada event lain yang `active`:
```
Dialog konfirmasi:
"Event [Nama Event Lama] sedang aktif.
 Mengaktifkan event ini akan menutup pendaftaran sebelumnya.
 Lanjutkan?"
[Batal]  [Ya, Aktifkan]
```
Jika Ya → set event lama ke `upcoming`, set event baru ke `active`.

Jika admin kurangi kuota di bawah jumlah peserta `verified`:
- Validasi server tolak dengan pesan: "Kuota tidak bisa dikurangi di bawah X peserta yang sudah terverifikasi."

---

### Tab 2 — Pendaftar

**Filter:**
- Dropdown pilih event
- Filter status: Semua / Menunggu / Terverifikasi / Ditolak
- Search: by nama atau kode referensi

**Tabel pendaftar:**

| Kolom | Isi |
|---|---|
| Kode | SRT-XXXXXX |
| Nama | Peserta pertama |
| WA | Nomor kontak |
| Orang | Jumlah peserta |
| Total Bayar | Rp xxx.xxx |
| Status | badge |
| Waktu Daftar | tanggal + jam |
| Aksi | [Detail] [Verifikasi] [Tolak] |

**Tombol [Detail]:**
Buka modal/panel samping berisi:
- Data lengkap tiap peserta: nama lengkap, panggilan, umur, domisili, WA, IG
- Foto diri tiap peserta (thumbnail, klik untuk buka full)
- Bukti transfer (link + preview)
- `trxId` YoBasePay (untuk cross-check di dashboard YoBasePay jika perlu)
- Riwayat status: kapan daftar, kapan diverifikasi

**Tombol [Verifikasi]** (hanya muncul jika status `pending_payment`):

```
Dialog: "Verifikasi pembayaran SRT-XXXXXX sebesar Rp 150.000?"
[Batal]  [Ya, Verifikasi]
  ↓
Berhasil → status jadi "verified", badge update di tabel, toast "Berhasil diverifikasi."
Gagal    → toast error, status tidak berubah
```

**Tombol [Tolak]** (hanya muncul jika status `pending_payment`):

```
Dialog dengan textarea:
"Masukkan catatan penolakan (akan dilihat pendaftar):"
[textarea — opsional]
[Batal]  [Ya, Tolak]
  ↓
Berhasil → status jadi "rejected", catatan tersimpan, toast "Pendaftar ditolak."
```

**Export CSV:**
- Tombol di atas tabel
- Download semua pendaftar event yang dipilih
- Kolom: kode, nama, WA, jumlah orang, total bayar, status, waktu daftar, waktu verifikasi

---

### Tab 3 — Webhook Logs

**Tujuan:** Debugging jika ada pembayaran yang tidak auto-verified.

**Tabel log:**

| Kolom | Isi |
|---|---|
| Waktu | timestamp |
| IP | IP pengirim |
| Nominal | Rp yang masuk |
| Signature | ✅ Valid / ❌ Invalid |
| Matched Kode | SRT-XXXXXX atau — |
| Hasil | verified / no\_match / bad\_signature / ip\_denied |

**Cara pakai untuk debugging:**

1. User lapor sudah bayar tapi status masih pending → buka tab ini
2. Cari nominal atau waktu yang sesuai
3. Lihat kolom "Hasil":
   - `verified` → sudah terverifikasi, cek lagi di tab Pendaftar
   - `no_match` → webhook masuk tapi tidak ketemu pendaftar → kemungkinan trxId tidak cocok, cek manual
   - `bad_signature` → request bukan dari YoBasePay atau webhook secret salah
   - Tidak ada log sama sekali → webhook URL belum terhubung, cek dashboard YoBasePay

**Filter:**
- Filter by hasil
- Filter by rentang tanggal

---

### Tab 4 — Keuangan

**Summary per event:**
```
Event: [Nama Event]
Total Pemasukan:      Rp 3.500.000
Jumlah Transaksi:     23
Rata-rata Transaksi:  Rp 152.173
```

**Tabel transaksi:**

| Kolom | Isi |
|---|---|
| Waktu | timestamp |
| Kode | SRT-XXXXXX |
| Keterangan | "Pembayaran Tiket: SRT-XXXXXX" |
| Nominal | Rp xxx.xxx |
| Tipe | IN / OUT |

Tipe OUT untuk pengeluaran operasional — input manual admin.

---

## BAGIAN 4 — SKENARIO ERROR & EDGE CASE

---

### Skenario 1: User tutup browser di Step 3 sebelum bayar

**Yang terjadi:** Pendaftaran sudah tersimpan `pending_payment`, QR mungkin masih valid.

**Solusi:** Buka halaman Cek Status → masukkan kode referensi (dari WA atau catatan).

**Di halaman Cek Status saat status `pending_payment`:**
- Jika `expiredAt` belum lewat → tampilkan QR lagi + mulai polling 4 detik
- Jika `expiredAt` sudah lewat → tampilkan instruksi hubungi admin + upload bukti

---

### Skenario 2: User browser di-refresh saat Step 3

**Yang terjadi:** State React hilang, QR dan data tidak ada.

**Solusi:** Data sudah tersimpan di `sessionStorage["srt_payment"]`.

**Behaviour setelah refresh:**
- Sistem baca sessionStorage → restore Step 3 otomatis
- Jika `expiredAt` belum lewat → tampilkan QR + lanjutkan polling
- Jika `expiredAt` lewat → langsung tampilkan State EXPIRED

---

### Skenario 3: QR expired sebelum user sempat bayar

**Yang terjadi:** Polling detect EXPIRED atau countdown habis.

**Yang ditampilkan:** State EXPIRED (lihat 3E).

**Status di DB:** Tetap `pending_payment` — tidak otomatis rejected.

**Opsi untuk user:**
- Buka Cek Status → status masih pending → ada opsi upload bukti transfer
- Hubungi admin via DM @saratrasaaa

**Opsi untuk admin:**
- Cek webhook log untuk konfirmasi ada/tidaknya pembayaran yang masuk
- Jika ada → verifikasi manual via tombol [Verifikasi]

---

### Skenario 4: Dua orang submit pendaftaran di waktu yang sama, kuota tinggal 1

**Yang terjadi di backend:** `acquireLock` memastikan hanya satu yang masuk critical section.

**Hasilnya:**
- Satu orang dapat 201 → lanjut ke Step 3
- Satu orang dapat 409 → toast "Kuota tidak mencukupi. Sisa slot: 0." → kembali ke Step 1

**Data form yang dapat 409:** Tetap ada, tidak dihapus. User bisa daftar ke event selanjutnya.

---

### Skenario 5: Kuota habis saat user sedang isi form Step 2

**Yang terjadi:** POST /api/daftar return 409.

**Handling:** Sama dengan Skenario 4. Data form tetap ada. Kembali ke Step 1 dengan kuota terbaru.

---

### Skenario 6: Webhook YoBasePay datang duplikat

**Yang terjadi di backend:** Match by `trxId` + status `pending_payment`. Setelah pertama verified, status berubah → webhook kedua tidak ketemu match → return 200 `no_match`. Tidak ada efek samping, tidak ada double-verified.

---

### Skenario 7: Upload selfie gagal (satu atau lebih peserta)

**Yang terjadi:** Upload parallel setelah `/api/daftar` berhasil, salah satu atau lebih gagal.

**Handling:**
- Toast warning: "Beberapa foto gagal disimpan. Lengkapi nanti di halaman Cek Status."
- Lanjut ke Step 3 normal — jangan blokir karena selfie opsional
- Di Step 3, tampilkan status selfie per peserta dengan tombol "Upload" untuk yang gagal
- Di halaman Cek Status (status verified), ada section foto diri per peserta

---

### Skenario 8: OTP tidak terkirim ke WA pendaftar

**Kemungkinan penyebab:** Nomor tidak aktif, layanan OTP down, WA tidak terpasang.

**Handling untuk user:**
- Toast: "Gagal mengirim OTP ke [nomor]. Pastikan nomor aktif."
- Tetap di form — tidak kemana-mana
- Tombol kirim ulang aktif setelah 10 detik (bukan 60 — ini first attempt yang gagal)

**Fallback:** User hubungi admin via DM @saratrasaaa → admin verifikasi manual identity → admin verifikasi pendaftaran manual di tab Pendaftar.

---

### Skenario 9: Admin salah klik Verifikasi atau Tolak

**Verifikasi tidak bisa di-undo via UI.** Jika terlanjur verifikasi padahal belum bayar → admin harus update status manual via database.

**Penolakan** bisa diralat: admin ubah status dari `rejected` ke `pending_payment` via database → user bisa bayar ulang.

**Pencegahan:** Selalu ada dialog konfirmasi sebelum aksi Verifikasi dan Tolak.

---

## RINGKASAN ATURAN UX GLOBAL

| Aturan | Detail |
|---|---|
| **Kode referensi selalu mencolok** | Di Step 3: paling atas, paling besar, dengan tombol salin |
| **Jangan hapus data saat error** | Form yang diisi tidak boleh hilang karena server error |
| **Pesan error harus spesifik** | "Sisa slot: 2" bukan "Kuota tidak cukup" |
| **Selfie tidak boleh blokir alur** | Gagal upload selfie → lanjut terus, bisa upload nanti |
| **Bukti transfer terkesan opsional** | Default tersembunyi, label "darurat", bukan langkah wajib |
| **Nominal selalu bulat** | Tidak ada kode unik. Rp 150.000 bukan Rp 150.127 |
| **Semua state loading harus ada** | Tidak boleh ada layar kosong tanpa indikator |
| **Semua state empty harus ada** | List kosong harus ada penjelasan + call to action |
| **Konfirmasi untuk aksi admin** | Verifikasi, tolak, dan ganti event aktif selalu ada dialog |
| **Polling ada batasnya** | Step 3: berhenti di SUCCESS/EXPIRED. Cek Status: tiap 30 detik |
| **Mobile-first** | Semua alur nyaman di HP — form, QR, tiket, tabel admin |
