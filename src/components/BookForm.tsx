import React, { useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  Save,
  X,
} from 'lucide-react';
import { compressImageFile } from '../lib/imageCompression';
import {
  BOOK_CONDITIONS,
  STANDARD_CATEGORIES,
  type ExtractedBookData,
  type GroundingSource,
  type IsbnLookupResponse,
} from '../types/book';

interface BookFormProps {
  initialData: ExtractedBookData;
  coverThumbnail: string | null;
  sources?: GroundingSource[];
  submitLabel?: string;
  onCoverChange?: (thumbnailDataUrl: string) => void;
  onSubmit: (data: ExtractedBookData) => Promise<void> | void;
  onCancel?: () => void;
}

export const BookForm: React.FC<BookFormProps> = ({
  initialData,
  coverThumbnail,
  sources: initialSources = [],
  submitLabel = 'Simpan ke Katalog',
  onCoverChange,
  onSubmit,
  onCancel,
}) => {
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);

  const [judulUtama, setJudulUtama] = useState(initialData.judul_utama);
  const [anakJudul, setAnakJudul] = useState(initialData.anak_judul ?? '');
  const [penulisList, setPenulisList] = useState<string[]>(initialData.penulis);
  const [penulisInput, setPenulisInput] = useState('');
  const [editorText, setEditorText] = useState(
    initialData.editor_atau_penerjemah?.join(', ') ?? ''
  );
  const [desainSampul, setDesainSampul] = useState(
    initialData.desain_sampul ?? ''
  );
  const [ilustrator, setIlustrator] = useState(initialData.ilustrator ?? '');
  const [layouter, setLayouter] = useState(initialData.layouter ?? '');
  const [penerbit, setPenerbit] = useState(initialData.penerbit ?? '');
  const [kotaTerbit, setKotaTerbit] = useState(initialData.kota_terbit ?? '');
  const [tahunTerbit, setTahunTerbit] = useState(initialData.tahun_terbit ?? '');
  const [isbn, setIsbn] = useState(initialData.isbn ?? '');
  const [bahasa, setBahasa] = useState(initialData.bahasa || 'Indonesia');
  const [kategoriUmum, setKategoriUmum] = useState(
    initialData.kategori_umum || 'Non-Fiksi'
  );
  const [kodeDdc, setKodeDdc] = useState(initialData.kode_ddc || '000');
  const [statusKondisi, setStatusKondisi] = useState(
    initialData.status_kondisi || 'Tersedia'
  );
  const [sinopsisSingkat, setSinopsisSingkat] = useState(
    initialData.sinopsis_singkat ?? ''
  );

  const [sources, setSources] = useState<GroundingSource[]>(initialSources);
  const [lookingUpIsbn, setLookingUpIsbn] = useState(false);
  const [lookupFeedback, setLookupFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(
    new Set()
  );

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const categoryOptions = Array.from(
    new Set([...STANDARD_CATEGORIES, kategoriUmum].filter(Boolean))
  );

  const flashFields = (keys: string[]) => {
    setHighlightedFields(new Set(keys));
    window.setTimeout(() => {
      setHighlightedFields(new Set());
    }, 2400);
  };

  const handleAddPenulis = () => {
    const trimmed = penulisInput.trim();
    if (!trimmed) return;
    if (!penulisList.includes(trimmed)) {
      setPenulisList((prev) => [...prev, trimmed]);
    }
    setPenulisInput('');
  };

  const handleRemovePenulis = (idx: number) => {
    setPenulisList((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onCoverChange) return;
    try {
      const compressed = await compressImageFile(file);
      onCoverChange(compressed.thumbnailDataUrl);
    } catch {
      setErrorMsg('Gagal memproses foto sampul.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSyncPerpusnasFromForm = async () => {
    const cleaned = isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
    if (cleaned.length !== 10 && cleaned.length !== 13) {
      setLookupFeedback({
        type: 'error',
        text: 'Masukkan 10 atau 13 digit angka ISBN yang valid terlebih dahulu.',
      });
      return;
    }
    if (!navigator.onLine) {
      setLookupFeedback({
        type: 'error',
        text: 'Anda sedang offline. Sambungkan ke internet untuk mengambil data Perpusnas.',
      });
      return;
    }

    setLookingUpIsbn(true);
    setLookupFeedback(null);

    try {
      const res = await fetch('/api/lookup-isbn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn: cleaned }),
      });
      const data = (await res.json()) as IsbnLookupResponse & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || 'Gagal mencari ISBN di Perpusnas.');
      }

      if (Array.isArray(data.sources) && data.sources.length > 0) {
        setSources(data.sources);
      }

      if (!data.found || !data.book) {
        setLookupFeedback({
          type: 'info',
          text:
            data.message ||
            `Data untuk ISBN ${cleaned} belum ditemukan di indeks Perpusnas.`,
        });
        return;
      }

      const b = data.book;
      const changed: string[] = [];
      if (b.judul_utama) {
        setJudulUtama(b.judul_utama);
        changed.push('judul_utama');
      }
      if (b.anak_judul !== null) {
        setAnakJudul(b.anak_judul ?? '');
        changed.push('anak_judul');
      }
      if (b.penulis && b.penulis.length > 0) {
        setPenulisList(b.penulis);
        changed.push('penulis');
      }
      if (b.editor_atau_penerjemah && b.editor_atau_penerjemah.length > 0) {
        setEditorText(b.editor_atau_penerjemah.join(', '));
        changed.push('editor_atau_penerjemah');
      }
      if (b.desain_sampul) {
        setDesainSampul(b.desain_sampul);
        changed.push('desain_sampul');
      }
      if (b.ilustrator) {
        setIlustrator(b.ilustrator);
        changed.push('ilustrator');
      }
      if (b.layouter) {
        setLayouter(b.layouter);
        changed.push('layouter');
      }
      if (b.penerbit) {
        setPenerbit(b.penerbit);
        changed.push('penerbit');
      }
      if (b.kota_terbit) {
        setKotaTerbit(b.kota_terbit);
        changed.push('kota_terbit');
      }
      if (b.tahun_terbit) {
        setTahunTerbit(b.tahun_terbit);
        changed.push('tahun_terbit');
      }
      if (b.isbn) setIsbn(b.isbn);
      if (b.bahasa) {
        setBahasa(b.bahasa);
        changed.push('bahasa');
      }
      if (b.kategori_umum) {
        setKategoriUmum(b.kategori_umum);
        changed.push('kategori_umum');
      }
      if (b.kode_ddc) {
        setKodeDdc(b.kode_ddc);
        changed.push('kode_ddc');
      }
      if (b.sinopsis_singkat) {
        setSinopsisSingkat(b.sinopsis_singkat);
        changed.push('sinopsis_singkat');
      }

      flashFields(changed);
      setLookupFeedback({
        type: 'success',
        text: `Data pustaka dari Perpusnas berhasil diisikan ke formulir untuk ISBN ${cleaned}.`,
      });
    } catch (err) {
      setLookupFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal menyesuaikan data ke Perpusnas.',
      });
    } finally {
      setLookingUpIsbn(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!judulUtama.trim()) {
      setErrorMsg('Judul utama buku wajib diisi.');
      return;
    }

    const pendingAuthor = penulisInput.trim();
    const finalPenulis = pendingAuthor
      ? Array.from(new Set([...penulisList, pendingAuthor]))
      : penulisList;

    const parsedEditors = editorText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const cleanedIsbn = isbn.replace(/[^0-9Xx]/g, '').toUpperCase();

    const payload: ExtractedBookData = {
      judul_utama: judulUtama.trim(),
      anak_judul: anakJudul.trim() ? anakJudul.trim() : null,
      penulis: finalPenulis,
      editor_atau_penerjemah: parsedEditors.length > 0 ? parsedEditors : null,
      desain_sampul: desainSampul.trim() ? desainSampul.trim() : null,
      ilustrator: ilustrator.trim() ? ilustrator.trim() : null,
      layouter: layouter.trim() ? layouter.trim() : null,
      penerbit: penerbit.trim() ? penerbit.trim() : null,
      kota_terbit: kotaTerbit.trim() ? kotaTerbit.trim() : null,
      tahun_terbit: tahunTerbit.trim() ? tahunTerbit.trim() : null,
      isbn: cleanedIsbn ? cleanedIsbn : null,
      bahasa: bahasa.trim() || 'Indonesia',
      kategori_umum: kategoriUmum.trim() || 'Lainnya',
      kode_ddc: kodeDdc.trim() || '000',
      sinopsis_singkat: sinopsisSingkat.trim() ? sinopsisSingkat.trim() : null,
      status_kondisi: statusKondisi.trim() || 'Tersedia',
    };

    try {
      setSaving(true);
      await onSubmit(payload);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal menyimpan data buku.'
      );
    } finally {
      setSaving(false);
    }
  };

  const fieldRingClass = (fieldKey: string) =>
    highlightedFields.has(fieldKey)
      ? 'border-emerald-500 ring-2 ring-emerald-500/25 dark:border-emerald-400'
      : 'border-stone-300 dark:border-slate-700';

  const cleanIsbnForBtn = isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
  const isValidIsbn = cleanIsbnForBtn.length === 10 || cleanIsbnForBtn.length === 13;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Thumbnail Cover Card with Optional Quick Cover Capture */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-3.5 dark:border-slate-700/80 dark:bg-slate-800/50">
        <div className="flex items-center gap-3.5 min-w-0">
          {coverThumbnail ? (
            <img
              src={coverThumbnail}
              alt="Sampul depan buku"
              referrerPolicy="no-referrer"
              className="h-20 w-14 rounded-lg object-cover border border-stone-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-900">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#1B4332] dark:text-emerald-400">
              {coverThumbnail
                ? 'Thumbnail Sampul Resmi'
                : 'Belum Ada Foto Sampul Depan'}
            </p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Periksa dan lengkapi data bibliografi sebelum menyimpan ke database.
            </p>
          </div>
        </div>

        {onCoverChange && (
          <>
            <button
              type="button"
              onClick={() => coverFileInputRef.current?.click()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{coverThumbnail ? 'Ganti' : 'Foto Sampul'}</span>
            </button>
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePickCover}
              className="hidden"
            />
          </>
        )}
      </div>

      {/* Grounding Sources from Perpusnas */}
      {sources.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Referensi Penelusuran Perpusnas &amp; Bibliografi
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {sources.map((src) => (
              <a
                key={src.uri}
                href={src.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1E3A5F] hover:underline dark:text-sky-400"
              >
                <span className="max-w-[220px] truncate">{src.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      )}

      {lookupFeedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${
            lookupFeedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200'
              : lookupFeedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-200'
              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200'
          }`}
        >
          {lookupFeedback.text}
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-200"
        >
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* ISBN + Perpusnas Sync */}
        <div className="sm:col-span-2">
          <label
            htmlFor="isbn"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            ISBN (Angka Murni) — Cek Perpusnas
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="isbn"
              type="text"
              inputMode="numeric"
              value={isbn}
              onChange={(e) =>
                setIsbn(e.target.value.replace(/[^0-9Xx]/g, '').toUpperCase())
              }
              placeholder="9786020332956"
              className={`flex-1 min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('isbn')}`}
            />
            <button
              type="button"
              disabled={lookingUpIsbn || !isValidIsbn}
              onClick={handleSyncPerpusnasFromForm}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#162C49] disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#2B5486] dark:hover:bg-[#3566A1] whitespace-nowrap shrink-0"
            >
              {lookingUpIsbn ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{lookingUpIsbn ? 'Mengecek...' : 'Cek Perpusnas'}</span>
            </button>
          </div>
        </div>

        {/* Judul Utama */}
        <div className="sm:col-span-2">
          <label
            htmlFor="judul_utama"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Judul Utama <span className="text-red-600">*</span>
          </label>
          <input
            id="judul_utama"
            type="text"
            required
            value={judulUtama}
            onChange={(e) => setJudulUtama(e.target.value)}
            placeholder="Contoh: Bumi Manusia"
            className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('judul_utama')}`}
          />
        </div>

        {/* Anak Judul */}
        <div className="sm:col-span-2">
          <label
            htmlFor="anak_judul"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Anak Judul / Subjudul
          </label>
          <input
            id="anak_judul"
            type="text"
            value={anakJudul}
            onChange={(e) => setAnakJudul(e.target.value)}
            placeholder="Opsional"
            className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('anak_judul')}`}
          />
        </div>

        {/* Penulis */}
        <div className="sm:col-span-2">
          <label
            htmlFor="penulis_input"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Penulis
          </label>
          {penulisList.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {penulisList.map((author, idx) => (
                <span
                  key={`${author}-${idx}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <span>{author}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePenulis(idx)}
                    aria-label={`Hapus penulis ${author}`}
                    className="rounded p-0.5 text-slate-500 hover:bg-stone-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              id="penulis_input"
              type="text"
              value={penulisInput}
              onChange={(e) => setPenulisInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddPenulis();
                }
              }}
              placeholder="Ketik nama penulis lalu tekan Tambah"
              className={`flex-1 min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('penulis')}`}
            />
            <button
              type="button"
              onClick={handleAddPenulis}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-stone-300 bg-stone-100 px-3.5 text-xs font-semibold text-slate-800 hover:bg-stone-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Tambah</span>
            </button>
          </div>
        </div>

        {/* Editor / Penerjemah */}
        <div className="sm:col-span-2">
          <label
            htmlFor="editor_penerjemah"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Editor atau Penerjemah (pisahkan dengan koma)
          </label>
          <input
            id="editor_penerjemah"
            type="text"
            value={editorText}
            onChange={(e) => setEditorText(e.target.value)}
            placeholder="Opsional, misal: Ahmad Fuadi, Rina Wijaya"
            className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('editor_atau_penerjemah')}`}
          />
        </div>

        {/* Kredit Tambahan (Tidak Wajib Diisi): Desain Sampul, Ilustrator, Layouter */}
        <div className="sm:col-span-2 rounded-2xl border border-stone-200 bg-stone-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Kredit Produksi &amp; Visual
            </p>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Tidak wajib diisi
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="desain_sampul"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Desain Sampul
              </label>
              <input
                id="desain_sampul"
                type="text"
                value={desainSampul}
                onChange={(e) => setDesainSampul(e.target.value)}
                placeholder="Opsional"
                className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('desain_sampul')}`}
              />
            </div>
            <div>
              <label
                htmlFor="ilustrator"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Ilustrator
              </label>
              <input
                id="ilustrator"
                type="text"
                value={ilustrator}
                onChange={(e) => setIlustrator(e.target.value)}
                placeholder="Opsional"
                className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('ilustrator')}`}
              />
            </div>
            <div>
              <label
                htmlFor="layouter"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Layouter
              </label>
              <input
                id="layouter"
                type="text"
                value={layouter}
                onChange={(e) => setLayouter(e.target.value)}
                placeholder="Opsional"
                className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('layouter')}`}
              />
            </div>
          </div>
        </div>

        {/* Penerbit */}
        <div>
          <label
            htmlFor="penerbit"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Penerbit
          </label>
          <input
            id="penerbit"
            type="text"
            value={penerbit}
            onChange={(e) => setPenerbit(e.target.value)}
            placeholder="Contoh: Gramedia Pustaka Utama"
            className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('penerbit')}`}
          />
        </div>

        {/* Kota & Tahun Terbit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="kota_terbit"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 truncate"
            >
              Kota Terbit
            </label>
            <input
              id="kota_terbit"
              type="text"
              value={kotaTerbit}
              onChange={(e) => setKotaTerbit(e.target.value)}
              placeholder="Jakarta"
              className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('kota_terbit')}`}
            />
          </div>
          <div>
            <label
              htmlFor="tahun_terbit"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 truncate"
            >
              Tahun
            </label>
            <input
              id="tahun_terbit"
              type="text"
              inputMode="numeric"
              value={tahunTerbit}
              onChange={(e) => setTahunTerbit(e.target.value)}
              placeholder="2024"
              className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('tahun_terbit')}`}
            />
          </div>
        </div>

        {/* Bahasa */}
        <div>
          <label
            htmlFor="bahasa"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Bahasa
          </label>
          <input
            id="bahasa"
            type="text"
            value={bahasa}
            onChange={(e) => setBahasa(e.target.value)}
            placeholder="Indonesia"
            className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('bahasa')}`}
          />
        </div>

        {/* Kategori Umum */}
        <div>
          <label
            htmlFor="kategori_umum"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Kategori Umum
          </label>
          <select
            id="kategori_umum"
            value={kategoriUmum}
            onChange={(e) => setKategoriUmum(e.target.value)}
            className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('kategori_umum')}`}
          >
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Kode DDC */}
        <div>
          <label
            htmlFor="kode_ddc"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Kode DDC
          </label>
          <input
            id="kode_ddc"
            type="text"
            value={kodeDdc}
            onChange={(e) => setKodeDdc(e.target.value)}
            placeholder="899.221"
            className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('kode_ddc')}`}
          />
        </div>

        {/* Status Kondisi */}
        <div>
          <label
            htmlFor="status_kondisi"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Status Kondisi
          </label>
          <select
            id="status_kondisi"
            value={statusKondisi}
            onChange={(e) => setStatusKondisi(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500"
          >
            {BOOK_CONDITIONS.map((cond) => (
              <option key={cond} value={cond}>
                {cond}
              </option>
            ))}
          </select>
        </div>

        {/* Sinopsis Singkat */}
        <div className="sm:col-span-2">
          <label
            htmlFor="sinopsis_singkat"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Sinopsis Singkat
          </label>
          <textarea
            id="sinopsis_singkat"
            rows={3}
            value={sinopsisSingkat}
            onChange={(e) => setSinopsisSingkat(e.target.value)}
            placeholder="Ringkasan singkat isi buku..."
            className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500 transition-colors ${fieldRingClass('sinopsis_singkat')}`}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Batal
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#1B4332] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#143325] active:scale-[0.99] disabled:opacity-60 dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60]"
        >
          {saving ? (
            <span>Menyimpan...</span>
          ) : (
            <>
              {submitLabel.includes('Simpan') ? (
                <Save className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{submitLabel}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};
