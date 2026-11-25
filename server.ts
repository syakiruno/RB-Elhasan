import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const BOOK_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    judul_utama: {
      type: Type.STRING,
      description: 'Judul utama buku dalam format Title Case yang rapi.',
    },
    anak_judul: {
      type: Type.STRING,
      nullable: true,
      description: 'Subjudul atau anak judul buku jika ada, atau null jika tidak ada.',
    },
    penulis: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Daftar nama penulis buku. Gunakan array kosong jika benar-benar tidak diketahui.',
    },
    editor_atau_penerjemah: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.STRING },
      description: 'Daftar nama editor, penyunting, atau penerjemah jika tercantum, atau null jika tidak ada.',
    },
    desain_sampul: {
      type: Type.STRING,
      nullable: true,
      description: 'Nama desainer sampul / cover designer jika tercantum (opsional), atau null jika tidak ada.',
    },
    ilustrator: {
      type: Type.STRING,
      nullable: true,
      description: 'Nama ilustrator buku jika tercantum (opsional), atau null jika tidak ada.',
    },
    layouter: {
      type: Type.STRING,
      nullable: true,
      description: 'Nama penata letak / layouter buku jika tercantum (opsional), atau null jika tidak ada.',
    },
    penerbit: {
      type: Type.STRING,
      nullable: true,
      description: 'Nama penerbit buku, atau null jika tidak tercantum.',
    },
    kota_terbit: {
      type: Type.STRING,
      nullable: true,
      description: 'Kota tempat buku diterbitkan, atau null jika tidak tercantum.',
    },
    tahun_terbit: {
      type: Type.STRING,
      nullable: true,
      description: 'Tahun terbit buku (4 digit angka, misal "2023"), atau null jika tidak tercantum.',
    },
    isbn: {
      type: Type.STRING,
      nullable: true,
      description: 'Nomor ISBN hanya angka murni tanpa strip atau spasi (atau diakhiri X untuk ISBN-10), atau null jika tidak ada.',
    },
    bahasa: {
      type: Type.STRING,
      description: 'Bahasa utama buku, misalnya "Indonesia", "Inggris", "Arab", atau lainnya.',
    },
    kategori_umum: {
      type: Type.STRING,
      description:
        'Kategori umum perpustakaan: pilih satu yang paling sesuai dari daftar berikut: "Fiksi", "Non-Fiksi", "Sastra", "Filsafat & Psikologi", "Agama", "Ilmu Sosial & Politik", "Ekonomi", "Bisnis & Manajemen", "Hukum", "Pendidikan", "Bahasa & Linguistik", "Sains", "Matematika", "Teknologi", "Kedokteran & Kesehatan", "Pertanian & Lingkungan", "Seni & Desain", "Olahraga & Rekreasi", "Sejarah", "Geografi & Pariwisata", "Biografi", "Pengembangan Diri", "Buku Anak & Remaja", "Komik & Novel Grafis", "Kuliner & Gaya Hidup", "Karya Umum & Referensi", "Ensiklopedia & Kamus", atau "Lainnya".',
    },
    kode_ddc: {
      type: Type.STRING,
      description: 'Perkiraan kode klasifikasi Dewey Decimal Classification (DDC), misalnya "899.221" atau "297.12" atau "005.1".',
    },
    sinopsis_singkat: {
      type: Type.STRING,
      nullable: true,
      description: 'Ringkasan atau sinopsis singkat isi buku dalam Bahasa Indonesia (2-3 kalimat), atau null jika tidak cukup informasi.',
    },
    status_kondisi: {
      type: Type.STRING,
      description: 'Status kondisi buku, isi default "Tersedia".',
    },
  },
  required: [
    'judul_utama',
    'penulis',
    'bahasa',
    'kategori_umum',
    'kode_ddc',
    'status_kondisi',
  ],
};

const ISBN_LOOKUP_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    found: {
      type: Type.BOOLEAN,
      description: 'True jika informasi buku yang valid untuk ISBN tersebut ditemukan, false jika tidak ditemukan data yang dapat dipastikan.',
    },
    book: {
      ...BOOK_RESPONSE_SCHEMA,
      nullable: true,
    },
  },
  required: ['found'],
};

interface IncomingImage {
  label?: string;
  dataUrl: string;
}

interface ExtractBookBody {
  images?: IncomingImage[];
  barcode?: string;
}

interface LookupIsbnBody {
  isbn?: string;
}

interface GroundingSource {
  title: string;
  uri: string;
}

const DATA_URL_REGEX = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const STRICT_ISBN_REGEX = /^(?:[0-9]{13}|[0-9]{9}[0-9X])$/;

function sanitizeIsbn(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (cleaned.length === 10 || cleaned.length === 13) {
    return cleaned;
  }
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeBookOutput(
  parsed: Record<string, unknown>,
  fallbackIsbn: string | null
) {
  return {
    judul_utama:
      typeof parsed.judul_utama === 'string' && parsed.judul_utama.trim()
        ? parsed.judul_utama.trim()
        : 'Tanpa Judul',
    anak_judul:
      typeof parsed.anak_judul === 'string' && parsed.anak_judul.trim()
        ? parsed.anak_judul.trim()
        : null,
    penulis: Array.isArray(parsed.penulis)
      ? parsed.penulis
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim())
      : [],
    editor_atau_penerjemah: Array.isArray(parsed.editor_atau_penerjemah)
      ? parsed.editor_atau_penerjemah
          .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
          .map((e) => e.trim())
      : null,
    desain_sampul:
      typeof parsed.desain_sampul === 'string' && parsed.desain_sampul.trim()
        ? parsed.desain_sampul.trim()
        : null,
    ilustrator:
      typeof parsed.ilustrator === 'string' && parsed.ilustrator.trim()
        ? parsed.ilustrator.trim()
        : null,
    layouter:
      typeof parsed.layouter === 'string' && parsed.layouter.trim()
        ? parsed.layouter.trim()
        : null,
    penerbit:
      typeof parsed.penerbit === 'string' && parsed.penerbit.trim()
        ? parsed.penerbit.trim()
        : null,
    kota_terbit:
      typeof parsed.kota_terbit === 'string' && parsed.kota_terbit.trim()
        ? parsed.kota_terbit.trim()
        : null,
    tahun_terbit:
      typeof parsed.tahun_terbit === 'string' && parsed.tahun_terbit.trim()
        ? parsed.tahun_terbit.trim()
        : null,
    isbn: sanitizeIsbn(parsed.isbn) ?? fallbackIsbn ?? null,
    bahasa:
      typeof parsed.bahasa === 'string' && parsed.bahasa.trim()
        ? parsed.bahasa.trim()
        : 'Indonesia',
    kategori_umum:
      typeof parsed.kategori_umum === 'string' && parsed.kategori_umum.trim()
        ? parsed.kategori_umum.trim()
        : 'Lainnya',
    kode_ddc:
      typeof parsed.kode_ddc === 'string' && parsed.kode_ddc.trim()
        ? parsed.kode_ddc.trim()
        : '000',
    sinopsis_singkat:
      typeof parsed.sinopsis_singkat === 'string' && parsed.sinopsis_singkat.trim()
        ? parsed.sinopsis_singkat.trim()
        : null,
    status_kondisi:
      typeof parsed.status_kondisi === 'string' && parsed.status_kondisi.trim()
        ? parsed.status_kondisi.trim()
        : 'Tersedia',
  };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

interface CachedIsbnResult {
  expiresAt: number;
  value: {
    found: boolean;
    book: ReturnType<typeof normalizeBookOutput> | null;
    sources: GroundingSource[];
    message?: string;
  };
}

const isbnLookupCache = new Map<string, CachedIsbnResult>();
const ISBN_CACHE_TTL_MS = 30 * 60 * 1000;

function isQuotaOrRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429');
}

function isModelNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('NOT_FOUND') || msg.includes('404');
}

function isTransientServerError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('503') || msg.includes('UNAVAILABLE');
}

async function generateWithModelFallback<T>(
  fn: (model: string) => Promise<T>
): Promise<T> {
  try {
    return await fn(PRIMARY_MODEL);
  } catch (primaryErr: unknown) {
    if (isTransientServerError(primaryErr)) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      try {
        return await fn(PRIMARY_MODEL);
      } catch (retryErr: unknown) {
        if (!isQuotaOrRateLimitError(retryErr) && !isModelNotFoundError(retryErr)) {
          throw retryErr;
        }
      }
    } else if (
      !isQuotaOrRateLimitError(primaryErr) &&
      !isModelNotFoundError(primaryErr)
    ) {
      throw primaryErr;
    }

    // Fall back once to the free-tier lite model when primary hits 429/404/503
    return await fn(FALLBACK_MODEL);
  }
}

function extractSafeGroundingSources(
  chunks: Array<{ web?: { uri?: string; title?: string } }> | undefined
): GroundingSource[] {
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const results: GroundingSource[] = [];

  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title;
    if (typeof uri !== 'string') continue;
    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
      if (seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      results.push({
        uri: parsed.href,
        title: typeof title === 'string' && title.trim() ? title.trim() : parsed.hostname,
      });
    } catch {
      // Ignore malformed URI
    }
  }
  return results.slice(0, 6);
}

interface OpenLibraryFetchResult {
  summary: string;
  book: ReturnType<typeof normalizeBookOutput>;
}

async function fetchOpenLibraryData(isbn: string): Promise<OpenLibraryFetchResult | null> {
  if (!STRICT_ISBN_REGEX.test(isbn)) return null;
  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const entry = data[`ISBN:${isbn}`];
    if (!entry || typeof entry !== 'object') return null;
    const rec = entry as Record<string, unknown>;
    const summaryParts: string[] = [];

    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const subtitle = typeof rec.subtitle === 'string' ? rec.subtitle.trim() : null;
    if (title) summaryParts.push(`Judul: ${title}`);
    if (subtitle) summaryParts.push(`Subjudul: ${subtitle}`);

    const authors = Array.isArray(rec.authors)
      ? rec.authors
          .map((a) => (a && typeof a === 'object' && typeof (a as { name?: unknown }).name === 'string' ? (a as { name: string }).name.trim() : ''))
          .filter(Boolean)
      : [];
    if (authors.length > 0) summaryParts.push(`Penulis: ${authors.join(', ')}`);

    const publishers = Array.isArray(rec.publishers)
      ? rec.publishers
          .map((p) => (p && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string' ? (p as { name: string }).name.trim() : ''))
          .filter(Boolean)
      : [];
    if (publishers.length > 0) summaryParts.push(`Penerbit: ${publishers.join(', ')}`);

    const places = Array.isArray(rec.publish_places)
      ? rec.publish_places
          .map((p) => (p && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string' ? (p as { name: string }).name.trim() : ''))
          .filter(Boolean)
      : [];
    if (places.length > 0) summaryParts.push(`Kota Terbit: ${places.join(', ')}`);

    const publishDate = typeof rec.publish_date === 'string' ? rec.publish_date.trim() : '';
    const yearMatch = publishDate.match(/\b(19|20)\d{2}\b/);
    if (publishDate) summaryParts.push(`Tahun/Tanggal Terbit: ${publishDate}`);

    const subjects = Array.isArray(rec.subjects)
      ? rec.subjects
          .slice(0, 5)
          .map((s) => (s && typeof s === 'object' && typeof (s as { name?: unknown }).name === 'string' ? (s as { name: string }).name.trim() : ''))
          .filter(Boolean)
      : [];
    if (subjects.length > 0) summaryParts.push(`Subjek: ${subjects.join(', ')}`);

    if (!title || summaryParts.length === 0) return null;

    return {
      summary: summaryParts.join('\n'),
      book: normalizeBookOutput(
        {
          judul_utama: title,
          anak_judul: subtitle,
          penulis: authors,
          penerbit: publishers[0] ?? null,
          kota_terbit: places[0] ?? null,
          tahun_terbit: yearMatch ? yearMatch[0] : publishDate || null,
          isbn,
          bahasa: 'Indonesia',
          kategori_umum: 'Non-Fiksi',
          kode_ddc: '000',
          status_kondisi: 'Tersedia',
        },
        isbn
      ),
    };
  } catch {
    return null;
  }
}

async function tryDirectPerpusnasAdvSearch(isbn: string): Promise<string | null> {
  if (!STRICT_ISBN_REGEX.test(isbn)) return null;
  try {
    const searchUrl = `https://isbn.perpusnas.go.id/landing_page/search?adv_isbn=${encodeURIComponent(isbn)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Detect Cloudflare challenge / block page
    if (
      html.includes('Attention Required! | Cloudflare') ||
      html.includes('cf-error-details') ||
      html.includes('Just a moment...')
    ) {
      return null;
    }

    // Extract DataTables sorting_1 cells & surrounding row cells if HTML table is returned
    const sortingMatches = Array.from(
      html.matchAll(/<td[^>]*class=["'][^"']*sorting_1[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)
    ).map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

    const rowMatches = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))
      .map((m) => m[1])
      .filter((rowHtml) => rowHtml.includes('sorting_1') || rowHtml.includes(isbn))
      .slice(0, 3)
      .map((rowHtml) =>
        Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
          .map((cell) => cell[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join(' | ')
      )
      .filter(Boolean);

    if (rowMatches.length > 0) {
      return `Tabel Perpusnas (sorting_1):\n${rowMatches.join('\n')}`;
    }
    if (sortingMatches.length > 0) {
      return `Sel sorting_1 Perpusnas:\n${sortingMatches.join(' | ')}`;
    }
    return null;
  } catch {
    return null;
  }
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim()) as Record<string, unknown>;
      } catch {
        // Fall through to brace scan
      }
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function lookupPerpusnasByIsbn(ai: GoogleGenAI, isbn: string) {
  const cached = isbnLookupCache.get(isbn);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const hyphenated13 =
    isbn.length === 13
      ? `${isbn.slice(0, 3)}-${isbn.slice(3, 6)}-${isbn.slice(6, 10)}-${isbn.slice(10, 12)}-${isbn.slice(12)}`
      : isbn;

  // Gather free, non-Gemini bibliographic context in parallel first
  const [directPerpusnasText, openLibData] = await Promise.all([
    tryDirectPerpusnasAdvSearch(isbn),
    fetchOpenLibraryData(isbn),
  ]);

  const sources: GroundingSource[] = [];
  if (directPerpusnasText) {
    sources.push({
      title: 'Perpusnas ISBN (landing_page/search)',
      uri: 'https://isbn.perpusnas.go.id/landing_page/search',
    });
  }
  if (openLibData) {
    sources.push({
      title: 'Open Library Bibliographic API',
      uri: `https://openlibrary.org/isbn/${isbn}`,
    });
  }

  const extraContext = [
    directPerpusnasText ? `=== HASIL LANGSUNG PERPUSNAS ===\n${directPerpusnasText}` : '',
    openLibData ? `=== DATA OPEN LIBRARY ===\n${openLibData.summary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const promptText = [
    `Cari data bibliografi resmi dari layanan ISBN Perpustakaan Nasional RI (https://isbn.perpusnas.go.id/landing_page/search, opac.perpusnas.go.id, onesearch.id) atau katalog resmi penerbit untuk nomor ISBN ${isbn} (atau ${hyphenated13}).`,
    extraContext ? `\nData referensi tambahan yang sudah ditemukan:\n${extraContext}\n` : '',
    'Kembalikan HANYA objek JSON terstruktur sesuai skema { "found": boolean, "book": { ... } | null }.',
    'Aturan ketat:',
    '1. Jika buku ditemukan, set found=true dan isi lengkap: judul_utama (Title Case rapi), anak_judul, penulis (array), editor_atau_penerjemah, desain_sampul (opsional jika tercatat), ilustrator (opsional jika tercatat), layouter (opsional jika tercatat), penerbit, kota_terbit, tahun_terbit (4 digit), isbn (angka murni tanpa strip), bahasa, kategori_umum, kode_ddc (Dewey Decimal Classification), sinopsis_singkat (2-3 kalimat), status_kondisi ("Tersedia").',
    '2. Jika tidak ada data buku yang valid untuk ISBN tersebut, set found=false dan book=null (jangan pernah mengarang judul fiktif).',
  ]
    .filter(Boolean)
    .join('\n');

  let searchResponse;
  try {
    searchResponse = await generateWithModelFallback(async (model) => {
      try {
        return await ai.models.generateContent({
          model,
          contents: promptText,
          config: {
            systemInstruction:
              'Anda adalah pustakawan katalogisasi Perpustakaan Nasional Indonesia. Gunakan Google Search untuk mencari metadata bibliografi resmi berdasarkan ISBN dan kembalikan JSON terstruktur tanpa mengarang data fiktif.',
            tools: [{ googleSearch: {} }],
            responseMimeType: 'application/json',
            responseSchema: ISBN_LOOKUP_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
      } catch (innerErr: unknown) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        // Fallback if a specific model does not support responseSchema combined with googleSearch
        if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
          return await ai.models.generateContent({
            model,
            contents: promptText,
            config: {
              systemInstruction:
                'Anda adalah pustakawan katalogisasi Perpustakaan Nasional Indonesia. Cari data ISBN menggunakan Google Search lalu keluarkan JSON valid sesuai format { "found": boolean, "book": { ... } | null }.',
              tools: [{ googleSearch: {} }],
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
        }
        throw innerErr;
      }
    });
  } catch (err: unknown) {
    // If Gemini hits rate/quota limit, still serve real Open Library data if available
    if (openLibData) {
      const fallbackVal = {
        found: true,
        book: openLibData.book,
        sources,
      };
      return fallbackVal;
    }
    throw err;
  }

  const groundingSources = extractSafeGroundingSources(
    searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks as
      | Array<{ web?: { uri?: string; title?: string } }>
      | undefined
  );
  const allSources = [...sources];
  for (const s of groundingSources) {
    if (!allSources.some((existing) => existing.uri === s.uri)) {
      allSources.push(s);
    }
  }

  const parsed = extractJsonObject(searchResponse.text ?? '') as {
    found?: boolean;
    book?: Record<string, unknown> | null;
  } | null;

  if (
    !parsed ||
    !parsed.found ||
    !parsed.book ||
    typeof parsed.book.judul_utama !== 'string' ||
    !parsed.book.judul_utama.trim()
  ) {
    if (openLibData) {
      const val = {
        found: true,
        book: openLibData.book,
        sources: allSources.slice(0, 6),
      };
      isbnLookupCache.set(isbn, { expiresAt: Date.now() + ISBN_CACHE_TTL_MS, value: val });
      return val;
    }

    const notFoundVal = {
      found: false,
      book: null,
      sources: allSources.slice(0, 6),
      message: `Data buku untuk ISBN ${isbn} belum tercatat atau tidak ditemukan di pencarian web Perpusnas.`,
    };
    return notFoundVal;
  }

  const finalResult = {
    found: true,
    book: normalizeBookOutput(parsed.book, isbn),
    sources: allSources.slice(0, 6),
  };

  if (isbnLookupCache.size > 200) {
    const oldestKey = isbnLookupCache.keys().next().value;
    if (oldestKey) isbnLookupCache.delete(oldestKey);
  }
  isbnLookupCache.set(isbn, {
    expiresAt: Date.now() + ISBN_CACHE_TTL_MS,
    value: finalResult,
  });

  return finalResult;
}

function handleGeminiError(res: Response, err: unknown, fallbackMessage: string) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('Gemini API Error:', msg);

  if (
    msg.includes('API_KEY_INVALID') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('403') ||
    msg.includes('401')
  ) {
    res.status(403).json({
      error:
        'Kunci API Gemini tidak valid atau belum memiliki izin. Periksa GEMINI_API_KEY di panel Settings > Secrets.',
    });
    return;
  }

  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    res.status(429).json({
      error:
        'Kuota permintaan Gemini API sedang mencapai batas (429 RESOURCE_EXHAUSTED). Tunggu beberapa saat, periksa kuota atau pilih API key berbayar di Settings > Secrets, atau isi formulir secara manual.',
    });
    return;
  }

  res.status(500).json({ error: fallbackMessage });
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'RakBuku API' });
  });

  app.post('/api/lookup-isbn', async (req: Request, res: Response) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Kunci API Gemini belum dikonfigurasi pada server. Silakan atur GEMINI_API_KEY di panel Settings > Secrets.',
        });
        return;
      }

      const body = (req.body || {}) as LookupIsbnBody;
      const cleanIsbn = sanitizeIsbn(body.isbn);
      if (!cleanIsbn || !STRICT_ISBN_REGEX.test(cleanIsbn)) {
        res.status(400).json({
          error: 'Masukkan nomor ISBN-10 atau ISBN-13 yang valid (10 atau 13 digit).',
        });
        return;
      }

      const result = await lookupPerpusnasByIsbn(ai, cleanIsbn);
      res.json(result);
    } catch (err: unknown) {
      handleGeminiError(
        res,
        err,
        'Gagal menelusuri data buku di Perpusnas. Pastikan koneksi internet stabil lalu coba lagi.'
      );
    }
  });



  app.post('/api/extract-book', async (req: Request, res: Response) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Kunci API Gemini belum dikonfigurasi pada server. Silakan atur GEMINI_API_KEY di panel Settings > Secrets.',
        });
        return;
      }

      const body = (req.body || {}) as ExtractBookBody;
      const rawImages = Array.isArray(body.images) ? body.images : [];
      const rawBarcode = typeof body.barcode === 'string' ? body.barcode.trim() : '';
      const cleanBarcode = sanitizeIsbn(rawBarcode);

      if (rawImages.length === 0 && !cleanBarcode) {
        res.status(400).json({
          error: 'Kirimkan minimal 1 foto buku atau kode barcode ISBN untuk dianalisis.',
        });
        return;
      }

      if (rawImages.length > 5) {
        res.status(400).json({
          error: 'Maksimal 5 foto yang dapat dikirim dalam satu kali analisis.',
        });
        return;
      }

      const parts: Array<
        | { inlineData: { mimeType: string; data: string } }
        | { text: string }
      > = [];

      for (let i = 0; i < rawImages.length; i++) {
        const img = rawImages[i];
        if (!img || typeof img.dataUrl !== 'string') {
          res.status(400).json({ error: 'Format gambar tidak valid.' });
          return;
        }
        const normalizedUrl = img.dataUrl.replace(/^data:image\/jpg;/i, 'data:image/jpeg;');
        const match = DATA_URL_REGEX.exec(normalizedUrl);
        if (!match) {
          res.status(400).json({
            error: 'Format gambar harus JPEG, PNG, atau WebP dalam bentuk data URL valid.',
          });
          return;
        }
        const mimeType = match[1];
        const base64Data = match[2];
        if (base64Data.length > 5_500_000) {
          res.status(413).json({
            error: 'Ukuran salah satu foto terlalu besar. Mohon gunakan kompresi otomatis.',
          });
          return;
        }
        const label =
          typeof img.label === 'string' && img.label.trim()
            ? img.label.trim().slice(0, 120)
            : `Foto ${i + 1}`;
        parts.push({ text: `[${label}]` });
        parts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }

      // If user only sent a barcode (no photos), enrich via lookupPerpusnasByIsbn (1 call)
      let perpusnasContext = '';
      let sources: GroundingSource[] = [];
      if (cleanBarcode && STRICT_ISBN_REGEX.test(cleanBarcode) && rawImages.length === 0) {
        try {
          const perpusnasLookup = await lookupPerpusnasByIsbn(ai, cleanBarcode);
          sources = perpusnasLookup.sources;
          if (perpusnasLookup.found && perpusnasLookup.book) {
            res.json({
              book: perpusnasLookup.book,
              sources,
            });
            return;
          }
        } catch {
          // Proceed gracefully to Gemini extraction if lookup fails
        }
      }

      const instructionLines = [
        'Analisis foto-foto buku di atas sebagai pustakawan profesional untuk keperluan katalogisasi perpustakaan.',
        'Foto dapat berupa sampul depan, sampul belakang/barcode, atau halaman hak cipta (KDT / info penerbit) dengan tata letak yang bervariasi.',
      ];
      if (cleanBarcode) {
        instructionLines.push(
          `Barcode ISBN yang terdeteksi pemindai kamera: ${cleanBarcode}. Prioritaskan angka ini untuk kolom isbn (tanpa strip) kecuali jelas berbeda pada halaman hak cipta.`
        );
      }
      if (perpusnasContext) {
        instructionLines.push(
          perpusnasContext,
          'Gabungkan informasi visual dari foto dengan data referensi Perpusnas di atas (gunakan foto fisik sebagai verifikasi utama jika ada perbedaan edisi/cetakan, dan lengkapi field yang tidak terlihat di foto dari data Perpusnas).'
        );
      }
      instructionLines.push(
        'Ekstrak seluruh informasi bibliografi ke dalam JSON sesuai skema (termasuk desain_sampul, ilustrator, dan layouter jika tercantum pada halaman hak cipta; isi null jika tidak terlihat). Pastikan judul_utama menggunakan Title Case yang rapi, isbn hanya angka murni tanpa strip, kode_ddc akurat sesuai sistem Dewey Decimal Classification, dan status_kondisi bernilai "Tersedia".'
      );

      parts.push({ text: instructionLines.join('\n') });

      const response = await generateWithModelFallback((model) =>
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            systemInstruction:
              'Anda adalah pustakawan dan ahli katalogisasi profesional (menguasai AACR2, RDA, KDT Perpusnas RI, dan Dewey Decimal Classification / DDC). Ekstrak metadata bibliografi secara teliti dari foto sampul depan, sampul belakang, dan halaman hak cipta buku. Jika suatu field benar-benar tidak terlihat, isi dengan null (jangan mengarang). Untuk kode_ddc dan kategori_umum, berikan klasifikasi perpustakaan yang paling tepat berdasarkan topik buku.',
            responseMimeType: 'application/json',
            responseSchema: BOOK_RESPONSE_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );

      const jsonText = (response.text ?? '').trim();
      if (!jsonText) {
        res.status(502).json({
          error:
            'AI tidak mengembalikan hasil ekstraksi. Silakan coba ambil ulang foto yang lebih jelas.',
        });
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(jsonText) as Record<string, unknown>;
      } catch {
        res.status(502).json({
          error: 'Format respons AI tidak valid. Silakan coba analisis ulang.',
        });
        return;
      }

      res.json({
        book: normalizeBookOutput(parsed, cleanBarcode),
        sources,
      });
    } catch (err: unknown) {
      handleGeminiError(
        res,
        err,
        'Gagal menganalisis foto buku dengan AI. Pastikan koneksi internet stabil dan foto cukup jelas.'
      );
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response, next) => {
        if (req.path.startsWith('/api/')) {
          next();
          return;
        }
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RakBuku server berjalan pada http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan server RakBuku:', err);
  process.exit(1);
});
