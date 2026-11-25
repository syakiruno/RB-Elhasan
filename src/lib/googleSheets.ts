import type { BookRecord, SpreadsheetConfig } from '../types/book';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const SHEET_HEADERS = [
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
  'Kategori Umum',
  'Kode DDC',
  'Status Kondisi',
  'Sinopsis Singkat',
  'Tanggal Ditambahkan',
];

export class GoogleSheetsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSheetsAuthError';
  }
}

export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function bookToSheetRow(book: BookRecord): string[] {
  return [
    book.id,
    book.judul_utama,
    book.anak_judul ?? '',
    book.penulis.join('; '),
    book.editor_atau_penerjemah?.join('; ') ?? '',
    book.desain_sampul ?? '',
    book.ilustrator ?? '',
    book.layouter ?? '',
    book.penerbit ?? '',
    book.kota_terbit ?? '',
    book.tahun_terbit ?? '',
    book.isbn ?? '',
    book.bahasa || 'Indonesia',
    book.kategori_umum || 'Lainnya',
    book.kode_ddc || '000',
    book.status_kondisi || 'Tersedia',
    book.sinopsis_singkat ?? '',
    book.createdAt,
  ];
}

async function sheetsFetch<T>(
  url: string,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    throw new GoogleSheetsAuthError(
      'Sesi izin Google Sheets telah berakhir. Silakan masuk ulang dengan Google.'
    );
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
  } & T;

  if (!res.ok) {
    const msg =
      data.error?.message || `Permintaan Google Sheets gagal (${res.status}).`;
    if (res.status === 403) {
      throw new Error(
        `Akses ditolak Google Sheets: ${msg}. Pastikan akun Anda memiliki akses edit pada spreadsheet tersebut.`
      );
    }
    throw new Error(msg);
  }

  return data;
}

interface SpreadsheetMetadataApiResponse {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: { title?: string };
  sheets?: Array<{ properties?: { title?: string } }>;
}

export interface SpreadsheetMetadataResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  availableTabs: string[];
}

export async function fetchSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadataResult> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(
    spreadsheetId
  )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`;
  const data = await sheetsFetch<SpreadsheetMetadataApiResponse>(
    url,
    accessToken
  );

  const availableTabs = (data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

  if (availableTabs.length === 0) {
    throw new Error('Spreadsheet tidak memiliki tab lembar kerja yang valid.');
  }

  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    spreadsheetTitle: data.properties?.title || 'Spreadsheet Tanpa Judul',
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    availableTabs,
  };
}

export async function createCatalogSpreadsheet(
  accessToken: string,
  title = 'Katalog Perpustakaan RakBuku'
): Promise<{
  config: SpreadsheetConfig;
  availableTabs: string[];
}> {
  const initialTabName = 'Katalog RakBuku';
  const created = await sheetsFetch<SpreadsheetMetadataApiResponse>(
    SHEETS_API_BASE,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: [{ properties: { title: initialTabName } }],
      }),
    }
  );

  const spreadsheetId = created.spreadsheetId;
  const actualTabs = (created.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  const sheetName = actualTabs[0] || initialTabName;

  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A1:R1`);
  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(
      spreadsheetId
    )}/values/${range}?valueInputOption=RAW`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({ values: [SHEET_HEADERS] }),
    }
  );

  return {
    config: {
      spreadsheetId,
      spreadsheetTitle: created.properties?.title || title,
      spreadsheetUrl:
        created.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      sheetName,
      autoSyncOnSave: true,
    },
    availableTabs: actualTabs.length > 0 ? actualTabs : [sheetName],
  };
}

interface ValuesResponse {
  values?: string[][];
}

export async function ensureHeadersOnTab(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  const headerRange = encodeURIComponent(`${quoteSheetName(sheetName)}!A1:R1`);
  const existing = await sheetsFetch<ValuesResponse>(
    `${SHEETS_API_BASE}/${encodeURIComponent(
      spreadsheetId
    )}/values/${headerRange}`,
    accessToken
  );

  const firstRow = existing.values?.[0] ?? [];
  const hasAnyContent = firstRow.some((cell) => String(cell ?? '').trim() !== '');
  if (!hasAnyContent) {
    await sheetsFetch(
      `${SHEETS_API_BASE}/${encodeURIComponent(
        spreadsheetId
      )}/values/${headerRange}?valueInputOption=RAW`,
      accessToken,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [SHEET_HEADERS] }),
      }
    );
  }
}

async function readExistingIds(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<Set<string>> {
  const idRange = encodeURIComponent(`${quoteSheetName(sheetName)}!A2:A`);
  const res = await sheetsFetch<ValuesResponse>(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${idRange}`,
    accessToken
  );
  const ids = new Set<string>();
  for (const row of res.values ?? []) {
    const val = String(row?.[0] ?? '').trim();
    if (val) ids.add(val);
  }
  return ids;
}

export async function appendBookToSheet(
  accessToken: string,
  config: SpreadsheetConfig,
  book: BookRecord
): Promise<{ appended: boolean }> {
  await ensureHeadersOnTab(accessToken, config.spreadsheetId, config.sheetName);
  const existingIds = await readExistingIds(
    accessToken,
    config.spreadsheetId,
    config.sheetName
  );

  if (existingIds.has(book.id)) {
    return { appended: false };
  }

  const appendRange = encodeURIComponent(`${quoteSheetName(config.sheetName)}!A1`);
  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(
      config.spreadsheetId
    )}/values/${appendRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ values: [bookToSheetRow(book)] }),
    }
  );

  return { appended: true };
}

export async function appendMissingBooksToSheet(
  accessToken: string,
  config: SpreadsheetConfig,
  books: BookRecord[]
): Promise<{ addedCount: number; skippedCount: number }> {
  await ensureHeadersOnTab(accessToken, config.spreadsheetId, config.sheetName);
  const existingIds = await readExistingIds(
    accessToken,
    config.spreadsheetId,
    config.sheetName
  );

  const missing = books.filter((b) => !existingIds.has(b.id));
  if (missing.length === 0) {
    return { addedCount: 0, skippedCount: books.length };
  }

  const appendRange = encodeURIComponent(`${quoteSheetName(config.sheetName)}!A1`);
  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(
      config.spreadsheetId
    )}/values/${appendRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ values: missing.map(bookToSheetRow) }),
    }
  );

  return {
    addedCount: missing.length,
    skippedCount: books.length - missing.length,
  };
}

export async function syncAllBooksToSheet(
  accessToken: string,
  config: SpreadsheetConfig,
  books: BookRecord[]
): Promise<void> {
  const clearRange = encodeURIComponent(`${quoteSheetName(config.sheetName)}!A:R`);
  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(
      config.spreadsheetId
    )}/values/${clearRange}:clear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  );

  const writeRange = encodeURIComponent(`${quoteSheetName(config.sheetName)}!A1`);
  const allRows = [SHEET_HEADERS, ...books.map(bookToSheetRow)];
  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(
      config.spreadsheetId
    )}/values/${writeRange}?valueInputOption=RAW`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({ values: allRows }),
    }
  );
}

export async function importBooksFromSheet(
  accessToken: string,
  config: SpreadsheetConfig
): Promise<BookRecord[]> {
  const readRange = encodeURIComponent(`${quoteSheetName(config.sheetName)}!A1:R`);
  const res = await sheetsFetch<ValuesResponse>(
    `${SHEETS_API_BASE}/${encodeURIComponent(
      config.spreadsheetId
    )}/values/${readRange}`,
    accessToken
  );

  const rows = res.values ?? [];
  if (rows.length <= 1) {
    return [];
  }

  const headerRow = rows[0].map((h) => String(h ?? '').trim().toLowerCase());
  const findCol = (keywords: string[], fallbackIdx: number) => {
    const idx = headerRow.findIndex((h) => keywords.some((k) => h === k || h.includes(k)));
    return idx >= 0 ? idx : fallbackIdx;
  };

  const colId = findCol(['id'], 0);
  const colJudul = findCol(['judul utama', 'judul'], 1);
  const colAnakJudul = findCol(['anak judul', 'subjudul'], 2);
  const colPenulis = findCol(['penulis', 'pengarang'], 3);
  const colEditor = findCol(['editor', 'penerjemah'], 4);
  const colDesain = findCol(['desain sampul'], 5);
  const colIlustrator = findCol(['ilustrator'], 6);
  const colLayouter = findCol(['layouter', 'tata letak'], 7);
  const colPenerbit = findCol(['penerbit'], 8);
  const colKota = findCol(['kota'], 9);
  const colTahun = findCol(['tahun'], 10);
  const colIsbn = findCol(['isbn'], 11);
  const colBahasa = findCol(['bahasa'], 12);
  const colKategori = findCol(['kategori'], 13);
  const colDdc = findCol(['ddc'], 14);
  const colStatus = findCol(['status', 'kondisi'], 15);
  const colSinopsis = findCol(['sinopsis'], 16);
  const colCreated = findCol(['tanggal'], 17);

  const now = new Date().toISOString();
  const books: BookRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const getCell = (idx: number) => String(row[idx] ?? '').trim();
    const judul = getCell(colJudul);
    if (!judul) continue;

    const splitList = (val: string) =>
      val
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);

    const rawIsbn = getCell(colIsbn).replace(/[^0-9Xx]/g, '').toUpperCase();
    const editors = splitList(getCell(colEditor));
    const createdAt = getCell(colCreated) || now;

    books.push({
      id: getCell(colId) || crypto.randomUUID(),
      judul_utama: judul,
      anak_judul: getCell(colAnakJudul) || null,
      penulis: splitList(getCell(colPenulis)),
      editor_atau_penerjemah: editors.length > 0 ? editors : null,
      desain_sampul: getCell(colDesain) || null,
      ilustrator: getCell(colIlustrator) || null,
      layouter: getCell(colLayouter) || null,
      penerbit: getCell(colPenerbit) || null,
      kota_terbit: getCell(colKota) || null,
      tahun_terbit: getCell(colTahun) || null,
      isbn: rawIsbn || null,
      bahasa: getCell(colBahasa) || 'Indonesia',
      kategori_umum: getCell(colKategori) || 'Lainnya',
      kode_ddc: getCell(colDdc) || '000',
      status_kondisi: getCell(colStatus) || 'Tersedia',
      sinopsis_singkat: getCell(colSinopsis) || null,
      coverThumbnail: null,
      createdAt,
      updatedAt: now,
    });
  }

  return books;
}
