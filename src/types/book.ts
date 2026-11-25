export type TabId = 'scan' | 'catalog' | 'export';

export type BookCondition =
  | 'Tersedia'
  | 'Dipinjam'
  | 'Rusak Ringan'
  | 'Dalam Perbaikan'
  | 'Hilang';

export const BOOK_CONDITIONS: BookCondition[] = [
  'Tersedia',
  'Dipinjam',
  'Rusak Ringan',
  'Dalam Perbaikan',
  'Hilang',
];

export const STANDARD_CATEGORIES: string[] = [
  'Fiksi',
  'Non-Fiksi',
  'Sastra',
  'Filsafat & Psikologi',
  'Agama',
  'Ilmu Sosial & Politik',
  'Ekonomi',
  'Bisnis & Manajemen',
  'Hukum',
  'Pendidikan',
  'Bahasa & Linguistik',
  'Sains',
  'Matematika',
  'Teknologi',
  'Kedokteran & Kesehatan',
  'Pertanian & Lingkungan',
  'Seni & Desain',
  'Olahraga & Rekreasi',
  'Sejarah',
  'Geografi & Pariwisata',
  'Biografi',
  'Pengembangan Diri',
  'Buku Anak & Remaja',
  'Komik & Novel Grafis',
  'Kuliner & Gaya Hidup',
  'Karya Umum & Referensi',
  'Ensiklopedia & Kamus',
  'Lainnya',
];

export interface ExtractedBookData {
  judul_utama: string;
  anak_judul: string | null;
  penulis: string[];
  editor_atau_penerjemah: string[] | null;
  desain_sampul?: string | null;
  ilustrator?: string | null;
  layouter?: string | null;
  penerbit: string | null;
  kota_terbit: string | null;
  tahun_terbit: string | null;
  isbn: string | null;
  bahasa: string;
  kategori_umum: string;
  kode_ddc: string;
  sinopsis_singkat: string | null;
  status_kondisi: string;
}

export interface BookRecord extends ExtractedBookData {
  id: string;
  coverThumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapturedSlotPhoto {
  slotIndex: 0 | 1 | 2;
  label: string;
  aiDataUrl: string;
  thumbnailDataUrl: string;
  sizeKB: number;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface IsbnLookupResponse {
  found: boolean;
  book: ExtractedBookData | null;
  sources: GroundingSource[];
  message?: string;
}

export interface SpreadsheetConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  sheetName: string;
  autoSyncOnSave: boolean;
}
