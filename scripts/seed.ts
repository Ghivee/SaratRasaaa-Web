/**
 * Seed script for Saratrasaa demo data.
 * Run with: bun run scripts/seed.ts
 */
import { db } from "../src/lib/db";

async function main() {
  console.log("Seeding Saratrasaa demo data...");

  // Clean up
  await db.pendaftar.deleteMany({});
  await db.event.deleteMany({});

  // Active event — "Bersih Bersih Pantai Pangandaran"
  const activeEvent = await db.event.create({
    data: {
      judul: "Bersih Pantai Pangandaran #3",
      deskripsi:
        "Aksi relawan Saratrasaa membersihkan garis pantai Pangandaran sambil edukasi pengunjung tentang pengurangan plastik sekali pakai. Dihadiri komunitas lokal, ditemani musik akustik sore hari.",
      tanggal: "2025-07-19",
      lokasi: "Pantai Pangandaran, Jawa Barat",
      harga: 50000,
      kuotaMax: 30,
      status: "active",
    },
  });
  console.log("Active event:", activeEvent.id, activeEvent.judul);

  // A couple of pending pendaftar for the active event (so quota bar isn't 0)
  await db.pendaftar.create({
    data: {
      kodeReferensi: "SRT-DEMO01",
      idEvent: activeEvent.id,
      nama: "Rani Pramesti",
      kontak: "081200001111",
      jumlahOrang: 2,
      hargaDasar: 100000,
      kodeUnik: 412,
      totalBayar: 100412,
      status: "pending_payment",
    },
  });
  await db.pendaftar.create({
    data: {
      kodeReferensi: "SRT-DEMO02",
      idEvent: activeEvent.id,
      nama: "Bagas Wirawan",
      kontak: "081200002222",
      jumlahOrang: 1,
      hargaDasar: 50000,
      kodeUnik: 783,
      totalBayar: 50783,
      status: "verified",
      verifiedAt: new Date(),
    },
  });

  // Closed event — history 1
  await db.event.create({
    data: {
      judul: "Sungai Bersih Cikapundung #2",
      deskripsi:
        "Relawan Saratrasaa turun ke Sungai Cikapundung bersama komunitas Bank Sampah Dago. Hasilnya: 24 karung plastik ditarik dari sungai dalam satu pagi.",
      tanggal: "2025-04-12",
      lokasi: "Sungai Cikapundung, Bandung",
      harga: 35000,
      kuotaMax: 25,
      status: "closed",
      recap:
        "Pagi itu, 25 relawan berkumpul di Tegallega sebelum fajar. Kita belayar menyusuri Cikapundung dengan perahu karet, menarik plastik-plastik yang nyangkut di akar bambu. Yang paling berkesan: anak SD kelas 6 yang ikut, dia bawa plastik kresek sendiri dari rumah. 24 karung berhasil kita angkat. Terima kasih untuk semua — see you di pantai.",
      fotoDok: "",
    },
  });

  // Closed event — history 2
  await db.event.create({
    data: {
      judul: "Donor Darah Merah Muda",
      deskripsi:
        "Kolaborasi Saratrasaa x PMI cabang Bandung. 80 kantong darah terkumpul dalam 4 jam.",
      tanggal: "2025-02-08",
      lokasi: "Gedung Serba Guna, Bandung",
      harga: 0,
      kuotaMax: 80,
      status: "closed",
      recap:
        "Senang banget lihat antusiasme donor. Dari anak kos, mahasiswa, sampai bapak-bapak yang sempat pulang kerja dulu. 80 kantong darah untuk PMI — rekor Saratrasaa sampai sekarang. Foto-foto dokumentasi ada di galeri.",
      fotoDok: "",
    },
  });

  // Upcoming event
  await db.event.create({
    data: {
      judul: "Lindungi Hutan Mangrove Bali",
      deskripsi:
        "Penanaman 500 bibit mangrove + edukasi ekosistem pesisir untuk anak-anak desa Benoa. Coming soon.",
      tanggal: "2025-09-20",
      lokasi: "Benoa, Bali",
      harga: 75000,
      kuotaMax: 40,
      status: "upcoming",
    },
  });

  console.log("Seed complete. Events:", await db.event.count(), "Pendaftar:", await db.pendaftar.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
