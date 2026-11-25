import type { BookRecord } from '../types/book';

const SAFE_IMAGE_DATA_URL_REGEX = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i;

function escapeCsvCell(value: string | null | undefined, protectFormula = true): string {
  const raw = (value ?? '').replace(/\r?\n/g, ' ').trim();
  const safe = protectFormula && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportBooksToCSV(books: BookRecord[]): void {
  const headers = [
    'ID',
    'Judul Utama',
    'Anak Judul',
    'Penulis',
    'Editor / Penerjemah',
    'Desain Sampul',
    'Ilustrator',
    'Layouter',
    'Penerbit',
    'Kota Terbit',
    'Tahun Terbit',
    'ISBN',
    'Bahasa',
    'Kategori',
    'Kode DDC',
    'Status Kondisi',
    'Sinopsis Singkat',
    'Tanggal Ditambahkan',
  ];

  const rows = books.map((b) => [
    escapeCsvCell(b.id),
    escapeCsvCell(b.judul_utama),
    escapeCsvCell(b.anak_judul),
    escapeCsvCell(b.penulis.join('; ')),
    escapeCsvCell(b.editor_atau_penerjemah?.join('; ') ?? ''),
    escapeCsvCell(b.desain_sampul ?? ''),
    escapeCsvCell(b.ilustrator ?? ''),
    escapeCsvCell(b.layouter ?? ''),
    escapeCsvCell(b.penerbit),
    escapeCsvCell(b.kota_terbit),
    escapeCsvCell(b.tahun_terbit),
    // Wrap ISBN in Excel-friendly text formula only when pure digits so Excel won't convert to scientific notation
    b.isbn && /^[0-9Xx]+$/.test(b.isbn) ? `="${b.isbn}"` : escapeCsvCell(b.isbn),
    escapeCsvCell(b.bahasa),
    escapeCsvCell(b.kategori_umum),
    escapeCsvCell(b.kode_ddc),
    escapeCsvCell(b.status_kondisi),
    escapeCsvCell(b.sinopsis_singkat),
    escapeCsvCell(b.createdAt),
  ]);

  const csvContent =
    '\uFEFF' + [headers.map((h) => escapeCsvCell(h, false)).join(','), ...rows.map((r) => r.join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `rakbuku-katalog-${formatDateStamp()}.csv`);
}

export interface RakBukuBackupPayload {
  app: 'RakBuku';
  by: 'RB Elhasan';
  version: number;
  exportedAt: string;
  totalBooks: number;
  books: BookRecord[];
}

export function exportBooksToJSON(books: BookRecord[]): void {
  const payload: RakBukuBackupPayload = {
    app: 'RakBuku',
    by: 'RB Elhasan',
    version: 1,
    exportedAt: new Date().toISOString(),
    totalBooks: books.length,
    books,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  triggerDownload(blob, `rakbuku-backup-${formatDateStamp()}.json`);
}

export function parseAndValidateBackupJSON(rawText: string): BookRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('File bukan format JSON yang valid.');
  }

  let rawList: unknown[];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    'books' in parsed &&
    Array.isArray((parsed as { books: unknown }).books)
  ) {
    rawList = (parsed as { books: unknown[] }).books;
  } else {
    throw new Error('Struktur JSON tidak dikenali sebagai backup RakBuku.');
  }

  const now = new Date().toISOString();
  const validated: BookRecord[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const judul =
      typeof obj.judul_utama === 'string' && obj.judul_utama.trim()
        ? obj.judul_utama.trim()
        : null;
    if (!judul) continue;

    const rawCover = typeof obj.coverThumbnail === 'string' ? obj.coverThumbnail.trim() : null;
    const safeCover = rawCover && SAFE_IMAGE_DATA_URL_REGEX.test(rawCover) ? rawCover : null;

    const rawIsbn = typeof obj.isbn === 'string' ? obj.isbn.replace(/[^0-9Xx]/g, '').toUpperCase() : '';

    validated.push({
      id:
        typeof obj.id === 'string' && obj.id.trim()
          ? obj.id.trim()
          : crypto.randomUUID(),
      judul_utama: judul,
      anak_judul:
        typeof obj.anak_judul === 'string' && obj.anak_judul.trim()
          ? obj.anak_judul.trim()
          : null,
      penulis: Array.isArray(obj.penulis)
        ? obj.penulis.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map((p) => p.trim())
        : [],
      editor_atau_penerjemah: Array.isArray(obj.editor_atau_penerjemah)
        ? obj.editor_atau_penerjemah
            .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
            .map((e) => e.trim())
        : null,
      desain_sampul:
        typeof obj.desain_sampul === 'string' && obj.desain_sampul.trim()
          ? obj.desain_sampul.trim()
          : null,
      ilustrator:
        typeof obj.ilustrator === 'string' && obj.ilustrator.trim()
          ? obj.ilustrator.trim()
          : null,
      layouter:
        typeof obj.layouter === 'string' && obj.layouter.trim()
          ? obj.layouter.trim()
          : null,
      penerbit:
        typeof obj.penerbit === 'string' && obj.penerbit.trim() ? obj.penerbit.trim() : null,
      kota_terbit:
        typeof obj.kota_terbit === 'string' && obj.kota_terbit.trim() ? obj.kota_terbit.trim() : null,
      tahun_terbit:
        typeof obj.tahun_terbit === 'string' && obj.tahun_terbit.trim() ? obj.tahun_terbit.trim() : null,
      isbn: rawIsbn || null,
      bahasa:
        typeof obj.bahasa === 'string' && obj.bahasa.trim() ? obj.bahasa.trim() : 'Indonesia',
      kategori_umum:
        typeof obj.kategori_umum === 'string' && obj.kategori_umum.trim()
          ? obj.kategori_umum.trim()
          : 'Lainnya',
      kode_ddc:
        typeof obj.kode_ddc === 'string' && obj.kode_ddc.trim() ? obj.kode_ddc.trim() : '000',
      sinopsis_singkat:
        typeof obj.sinopsis_singkat === 'string' && obj.sinopsis_singkat.trim()
          ? obj.sinopsis_singkat.trim()
          : null,
      status_kondisi:
        typeof obj.status_kondisi === 'string' && obj.status_kondisi.trim()
          ? obj.status_kondisi.trim()
          : 'Tersedia',
      coverThumbnail: safeCover,
      createdAt:
        typeof obj.createdAt === 'string' && obj.createdAt.trim() ? obj.createdAt.trim() : now,
      updatedAt:
        typeof obj.updatedAt === 'string' && obj.updatedAt.trim() ? obj.updatedAt.trim() : now,
    });
  }

  if (validated.length === 0) {
    throw new Error('Tidak ditemukan data buku yang valid di dalam file JSON ini.');
  }

  return validated;
}

function formatDateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
