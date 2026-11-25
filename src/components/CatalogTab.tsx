import React, { useMemo, useState } from 'react';
import {
  BookMarked,
  Camera,
  Edit3,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { BookRecord, ExtractedBookData } from '../types/book';
import { BookForm } from './BookForm';

interface CatalogTabProps {
  books: BookRecord[];
  onUpdateBook: (book: BookRecord) => Promise<void>;
  onDeleteBook: (id: string) => Promise<void>;
  onGoToScan: () => void;
}

type SortOption = 'newest' | 'title' | 'ddc';

export const CatalogTab: React.FC<CatalogTabProps> = ({
  books,
  onUpdateBook,
  onDeleteBook,
  onGoToScan,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const [activeBook, setActiveBook] = useState<BookRecord | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) {
      const cat = b.kategori_umum || 'Lainnya';
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return ['Semua', ...Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, 'id'))];
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = books.filter((b) => {
      if (selectedCategory !== 'Semua' && b.kategori_umum !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const haystacks = [
        b.judul_utama,
        b.anak_judul ?? '',
        b.penulis.join(' '),
        b.desain_sampul ?? '',
        b.ilustrator ?? '',
        b.layouter ?? '',
        b.isbn ?? '',
        b.penerbit ?? '',
        b.kode_ddc,
      ];
      return haystacks.some((h) => h.toLowerCase().includes(q));
    });

    if (sortBy === 'title') {
      return [...list].sort((a, b) =>
        a.judul_utama.localeCompare(b.judul_utama, 'id')
      );
    }
    if (sortBy === 'ddc') {
      return [...list].sort((a, b) =>
        a.kode_ddc.localeCompare(b.kode_ddc, 'en', { numeric: true })
      );
    }
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [books, query, selectedCategory, sortBy]);

  const handleOpenDetail = (book: BookRecord) => {
    setActiveBook(book);
    setIsEditing(false);
    setConfirmDelete(false);
  };

  const handleCloseModal = () => {
    setActiveBook(null);
    setIsEditing(false);
    setConfirmDelete(false);
  };

  const handleSaveEdit = async (updatedData: ExtractedBookData) => {
    if (!activeBook) return;
    const updatedRecord: BookRecord = {
      ...activeBook,
      ...updatedData,
      updatedAt: new Date().toISOString(),
    };
    await onUpdateBook(updatedRecord);
    setActiveBook(updatedRecord);
    setIsEditing(false);
  };

  const handleConfirmDelete = async () => {
    if (!activeBook) return;
    try {
      setDeleting(true);
      await onDeleteBook(activeBook.id);
      handleCloseModal();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Search & Sort Controls */}
      <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#161D24] space-y-3.5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari judul, penulis, ISBN, penerbit, atau DDC..."
              aria-label="Cari buku di katalog"
              className="w-full min-h-[44px] rounded-xl border border-stone-300 bg-[#FAF9F6] pl-10 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B4332] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4332]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="sort-catalog" className="sr-only">
              Urutkan katalog
            </label>
            <select
              id="sort-catalog"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="min-h-[44px] rounded-xl border border-stone-300 bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-slate-800 focus:border-[#1B4332] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="newest">Terbaru Ditambahkan</option>
              <option value="title">Judul (A–Z)</option>
              <option value="ddc">Kode DDC</option>
            </select>
          </div>
        </div>

        {/* Category Filter Buttons */}
        {books.length > 0 && (
          <div
            className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
            role="tablist"
            aria-label="Filter kategori buku"
          >
            {categories.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#1B4332] text-white dark:bg-[#2D6A4F]'
                      : 'bg-stone-100 text-slate-700 hover:bg-stone-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Result Count Bar */}
      {books.length > 0 && (
        <div className="flex items-center justify-between px-1 text-xs text-slate-600 dark:text-slate-400">
          <span>
            Menampilkan <strong className="font-mono text-slate-900 dark:text-slate-200">{filteredBooks.length}</strong> dari{' '}
            <strong className="font-mono text-slate-900 dark:text-slate-200">{books.length}</strong> buku
          </span>
          {(query || selectedCategory !== 'Semua') && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedCategory('Semua');
              }}
              className="font-semibold text-[#1B4332] hover:underline dark:text-emerald-400"
            >
              Reset filter
            </button>
          )}
        </div>
      )}

      {/* Catalog Card View or Empty States */}
      {books.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-[#161D24]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1B4332]/10 text-[#1B4332] dark:bg-emerald-500/15 dark:text-emerald-400">
            <BookMarked className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Katalog Perpustakaan Masih Kosong
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Mulai pindai sampul dan barcode buku menggunakan kamera smartphone untuk membangun database koleksi Anda.
          </p>
          <button
            type="button"
            onClick={onGoToScan}
            className="mt-5 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#1B4332] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#143325] dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60]"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            <span>Pindai Buku Pertama</span>
          </button>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="rounded-3xl border border-stone-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-[#161D24]">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Tidak ada buku yang cocok dengan pencarian Anda.
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Coba kata kunci lain atau ubah filter kategori.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBooks.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => handleOpenDetail(book)}
              className="group flex gap-3.5 rounded-2xl border border-stone-200 bg-white p-3.5 text-left shadow-sm transition-all hover:border-[#1B4332]/40 hover:shadow-md active:scale-[0.99] dark:border-slate-800 dark:bg-[#161D24] dark:hover:border-emerald-500/40"
            >
              {/* Cover Thumbnail with Resilient Fallback */}
              {book.coverThumbnail ? (
                <img
                  src={book.coverThumbnail}
                  alt={`Sampul ${book.judul_utama}`}
                  referrerPolicy="no-referrer"
                  className="h-32 w-24 shrink-0 rounded-xl object-cover border border-stone-200 dark:border-slate-700"
                />
              ) : (
                <div className="flex h-32 w-24 shrink-0 flex-col items-center justify-center rounded-xl border border-stone-200 bg-gradient-to-br from-[#1B4332]/10 to-[#1E3A5F]/15 p-2 text-center dark:border-slate-700 dark:from-emerald-950/60 dark:to-slate-800">
                  <BookMarked className="h-6 w-6 text-[#1B4332] dark:text-emerald-400 mb-1.5" />
                  <span className="line-clamp-2 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                    {book.judul_utama}
                  </span>
                </div>
              )}

              {/* Card Bibliographic Content (Zero-Pill Clean Metadata) */}
              <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                <div>
                  <p className="text-xs font-semibold text-[#1B4332] dark:text-emerald-400 truncate">
                    {book.kategori_umum}
                    <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                    <span className="font-mono text-[#1E3A5F] dark:text-sky-400">
                      DDC {book.kode_ddc}
                    </span>
                  </p>
                  <h3 className="mt-1 font-display text-base font-semibold leading-snug text-slate-900 group-hover:text-[#1B4332] line-clamp-2 dark:text-slate-100 dark:group-hover:text-emerald-300">
                    {book.judul_utama}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 truncate">
                    {book.penulis.length > 0
                      ? book.penulis.join(', ')
                      : 'Penulis tidak tercatat'}
                  </p>
                </div>

                <div className="mt-2 pt-2 border-t border-stone-100 dark:border-slate-800/80 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-mono">
                    {book.isbn ? `ISBN ${book.isbn}` : 'Tanpa ISBN'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{book.status_kondisi}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Book Detail / Edit Modal */}
      {activeBook && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-book-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#161D24]">
            {/* Sticky Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/95 backdrop-blur-md px-5 py-4 dark:border-slate-800 dark:bg-[#161D24]/95">
              <h2
                id="detail-book-title"
                className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 truncate"
              >
                {isEditing ? 'Edit Data Buku' : 'Detail Katalog Buku'}
              </h2>
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Tutup detail buku"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6">
              {isEditing ? (
                <BookForm
                  initialData={activeBook}
                  coverThumbnail={activeBook.coverThumbnail}
                  submitLabel="Simpan Perubahan"
                  onSubmit={handleSaveEdit}
                  onCancel={() => setIsEditing(false)}
                />
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row gap-5">
                    {activeBook.coverThumbnail ? (
                      <img
                        src={activeBook.coverThumbnail}
                        alt={`Sampul ${activeBook.judul_utama}`}
                        referrerPolicy="no-referrer"
                        className="w-32 h-44 sm:w-36 sm:h-52 mx-auto sm:mx-0 shrink-0 rounded-2xl object-cover border border-stone-200 shadow-sm dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-32 h-44 sm:w-36 sm:h-52 mx-auto sm:mx-0 shrink-0 rounded-2xl border border-stone-200 bg-gradient-to-br from-[#1B4332]/10 to-[#1E3A5F]/15 flex flex-col items-center justify-center p-4 text-center dark:border-slate-700 dark:from-emerald-950/60 dark:to-slate-800">
                        <BookMarked className="h-8 w-8 text-[#1B4332] dark:text-emerald-400 mb-2" />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          Tidak ada foto sampul
                        </span>
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-xs font-semibold text-[#1B4332] dark:text-emerald-400">
                        {activeBook.kategori_umum}
                        <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                        <span className="font-mono text-[#1E3A5F] dark:text-sky-400">
                          DDC {activeBook.kode_ddc}
                        </span>
                        <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                        <span>{activeBook.status_kondisi}</span>
                      </p>
                      <h3 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                        {activeBook.judul_utama}
                      </h3>
                      {activeBook.anak_judul && (
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {activeBook.anak_judul}
                        </p>
                      )}
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 pt-1">
                        {activeBook.penulis.length > 0
                          ? activeBook.penulis.join(', ')
                          : 'Penulis tidak tercatat'}
                      </p>
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-y border-stone-200 py-4 text-xs dark:border-slate-800">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">ISBN</dt>
                      <dd className="mt-1 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {activeBook.isbn || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Penerbit</dt>
                      <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {activeBook.penerbit || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Kota &amp; Tahun Terbit
                      </dt>
                      <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {[activeBook.kota_terbit, activeBook.tahun_terbit]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Bahasa</dt>
                      <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {activeBook.bahasa || '—'}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-500 dark:text-slate-400">
                        Editor / Penerjemah
                      </dt>
                      <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {activeBook.editor_atau_penerjemah?.join(', ') || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Desain Sampul
                      </dt>
                      <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {activeBook.desain_sampul || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Ilustrator
                      </dt>
                      <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {activeBook.ilustrator || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Layouter
                      </dt>
                      <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {activeBook.layouter || '—'}
                      </dd>
                    </div>
                  </dl>

                  {activeBook.sinopsis_singkat && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Sinopsis Singkat
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {activeBook.sinopsis_singkat}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  {confirmDelete ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/50">
                      <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                        Hapus buku ini dari katalog permanen?
                      </p>
                      <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">
                        Tindakan ini tidak dapat dibatalkan kecuali Anda memiliki file backup JSON.
                      </p>
                      <div className="mt-3 flex gap-2.5">
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={handleConfirmDelete}
                          className="min-h-[44px] rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {deleting ? 'Menghapus...' : 'Ya, Hapus Buku'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="min-h-[44px] rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span>Hapus Buku</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#1B4332] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#143325] dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60]"
                      >
                        <Edit3 className="h-4 w-4" aria-hidden="true" />
                        <span>Edit Data Buku</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
