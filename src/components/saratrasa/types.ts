/**
 * Shared types for Saratrasaa frontend components.
 * All client components import from here to ensure contract consistency.
 */

export type View = "beranda" | "daftar" | "cek-status" | "galeri";

/** Active event summary returned by GET /api/event/active */
export interface ActiveEventSummary {
  id: string;
  judul: string;
  deskripsi: string;
  tanggal: string; // YYYY-MM-DD
  lokasi: string;
  fotoCover: string | null;
  harga: number;
  kuotaMax: number;
  terpakai: number;
  sisaKuota: number;
}

export interface Testimoni {
  id: string;
  nama: string;
  peran: string;
  pesan: string;
  rating: number;
  createdAt: string;
}

/** History event returned by GET /api/event/history */
export interface HistoryEvent {
  id: string;
  judul: string;
  deskripsi: string;
  tanggal: string;
  lokasi: string;
  fotoCover: string | null;
  harga: number;
  kuotaMax: number;
  recap: string | null;
  fotoDok: string[];
  linkGmaps: string | null;
}

/** Pendaftar + event returned by GET /api/cek-status */
export interface PendaftarResult {
  kodeReferensi: string;
  nama: string;
  kontak: string;
  jumlahOrang: number;
  totalBayar: number;
  kodeUnik: number;
  hargaDasar: number;
  status: "pending_payment" | "verified" | "rejected";
  verifiedAt: string | null;
  createdAt: string;
  buktiTransfer: string | null;
  catatanAdmin: string | null;
  event: {
    judul: string;
    tanggal: string;
    lokasi: string;
  };
  peserta?: {
    id: string;
    namaLengkap: string;
    fotoDiriUrl: string | null;
  }[];
}

/** Response from POST /api/daftar */
export interface DaftarResponse {
  kodeReferensi: string;
  totalBayar: number;
  hargaDasar: number;
  kodeUnik: number;
  jumlahOrang: number;
  eventJudul: string;
  eventTanggal: string;
  eventLokasi: string;
  linkGrupWa: string | null;
  trxId: string | null;
  qrImageUrl: string | null;
  expiredAt: string | null;
}

/** Event list item for admin */
export interface AdminEventItem {
  id: string;
  judul: string;
  deskripsi: string;
  tanggal: string;
  waktuMulai: string | null;
  lokasi: string;
  linkGmaps: string | null;
  fotoCover: string | null;
  harga: number;
  kuotaMax: number;
  status: "upcoming" | "active" | "closed";
  recap: string | null;
  fotoDok: string[];
  linkGrupWa: string | null;
  createdAt: string;
}

/** Item returned by GET /api/gallery */
export interface GalleryItem {
  id: string;
  judul: string;
  tanggal: string; // YYYY-MM-DD
  lokasi: string;
  linkGmaps: string | null;
  recap: string | null;
  fotoDok: string[];
  fotoCover: string | null;
}
