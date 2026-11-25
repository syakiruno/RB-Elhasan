import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderUp,
  HardDrive,
  Link2,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Sheet,
  Unlink,
} from 'lucide-react';
import type { useGoogleSheets } from '../hooks/useGoogleSheets';
import { getStorageEstimateMB } from '../lib/db';
import {
  exportBooksToCSV,
  exportBooksToJSON,
  parseAndValidateBackupJSON,
} from '../lib/exportUtils';
import type { BookRecord } from '../types/book';
import { GoogleSignInButton } from './GoogleSignInButton';

interface ExportTabProps {
  books: BookRecord[];
  googleSheets: ReturnType<typeof useGoogleSheets>;
  onRestoreMerge: (books: BookRecord[]) => Promise<void>;
  onRestoreReplace: (books: BookRecord[]) => Promise<void>;
}

export const ExportTab: React.FC<ExportTabProps> = ({
  books,
  googleSheets,
  onRestoreMerge,
  onRestoreReplace,
}) => {
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [storageText, setStorageText] = useState<string>('Menghitung...');
  const [pendingRestore, setPendingRestore] = useState<BookRecord[] | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [processingRestore, setProcessingRestore] = useState(false);

  // Google Sheets UI state
  const [newSheetTitle, setNewSheetTitle] = useState('Katalog Perpustakaan RakBuku');
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [pendingSheetsMutation, setPendingSheetsMutation] = useState<
    'appendMissing' | 'replaceAll' | null
  >(null);
  const [pendingSheetImport, setPendingSheetImport] = useState<BookRecord[] | null>(
    null
  );

  useEffect(() => {
    getStorageEstimateMB().then(setStorageText);
  }, [books.length]);

  const stats = useMemo(() => {
    const categoryCounts = new Map<string, number>();
    let availableCount = 0;

    for (const b of books) {
      const cat = b.kategori_umum || 'Lainnya';
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
      if (b.status_kondisi === 'Tersedia') {
        availableCount++;
      }
    }

    const sortedCategories = Array.from(categoryCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    );

    return {
      totalBooks: books.length,
      totalCategories: categoryCounts.size,
      availableCount,
      sortedCategories,
    };
  }, [books]);

  const handleExportCSV = () => {
    setStatusMessage(null);
    if (books.length === 0) return;
    exportBooksToCSV(books);
    setStatusMessage(
      `Berhasil mengunduh ${books.length} data buku ke format CSV/Excel.`
    );
  };

  const handleExportJSON = () => {
    setStatusMessage(null);
    if (books.length === 0) return;
    exportBooksToJSON(books);
    setStatusMessage(
      `Backup JSON (${books.length} buku beserta thumbnail sampul) berhasil diunduh.`
    );
  };

  const handleSelectRestoreFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreError(null);
    setStatusMessage(null);
    setPendingRestore(null);

    try {
      const text = await file.text();
      const validated = parseAndValidateBackupJSON(text);
      setPendingRestore(validated);
    } catch (err) {
      setRestoreError(
        err instanceof Error ? err.message : 'Gagal membaca file backup JSON.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const executeRestore = async (mode: 'merge' | 'replace') => {
    if (!pendingRestore) return;
    try {
      setProcessingRestore(true);
      setRestoreError(null);
      if (mode === 'merge') {
        await onRestoreMerge(pendingRestore);
        setStatusMessage(
          `Berhasil menggabungkan ${pendingRestore.length} buku dari file backup ke katalog lokal.`
        );
      } else {
        await onRestoreReplace(pendingRestore);
        setStatusMessage(
          `Database berhasil dipulihkan dengan ${pendingRestore.length} buku dari file backup.`
        );
      }
      setPendingRestore(null);
    } catch (err) {
      setRestoreError(
        err instanceof Error ? err.message : 'Gagal memulihkan database.'
      );
    } finally {
      setProcessingRestore(false);
    }
  };

  const handleConfirmSheetsMutation = async () => {
    if (!pendingSheetsMutation) return;
    const action = pendingSheetsMutation;
    setPendingSheetsMutation(null);
    if (action === 'appendMissing') {
      await googleSheets.syncMissingBooks(books);
    } else if (action === 'replaceAll') {
      await googleSheets.replaceSheetWithCatalog(books);
    }
  };

  const handleStartImportFromSheet = async () => {
    setPendingSheetsMutation(null);
    setPendingSheetImport(null);
    const imported = await googleSheets.importFromSheet();
    if (imported && imported.length > 0) {
      setPendingSheetImport(imported);
    }
  };

  const handleConfirmSheetImport = async (mode: 'merge' | 'replace') => {
    if (!pendingSheetImport) return;
    try {
      setProcessingRestore(true);
      setRestoreError(null);
      if (mode === 'merge') {
        await onRestoreMerge(pendingSheetImport);
        googleSheets.setSheetsSuccess(
          `Berhasil menggabungkan ${pendingSheetImport.length} buku dari Google Sheets ke katalog lokal.`
        );
      } else {
        await onRestoreReplace(pendingSheetImport);
        googleSheets.setSheetsSuccess(
          `Katalog lokal berhasil diganti dengan ${pendingSheetImport.length} buku dari Google Sheets.`
        );
      }
      setPendingSheetImport(null);
    } catch (err) {
      googleSheets.setSheetsError(
        err instanceof Error ? err.message : 'Gagal mengimpor dari Google Sheets.'
      );
    } finally {
      setProcessingRestore(false);
    }
  };

  const {
    user,
    needsAuth,
    isLoggingIn,
    config,
    availableTabs,
    syncing,
    sheetsError,
    sheetsSuccess,
  } = googleSheets;

  return (
    <div className="space-y-6">
      {/* Library Summary Metrics */}
      <section aria-label="Statistik ringkas perpustakaan">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#161D24]">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Koleksi
            </p>
            <p className="mt-1.5 font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
              {stats.totalBooks}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Judul terdaftar lokal
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#161D24]">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Jumlah Kategori
            </p>
            <p className="mt-1.5 font-mono text-2xl sm:text-3xl font-bold text-[#1B4332] dark:text-emerald-400">
              {stats.totalCategories}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Klasifikasi aktif
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#161D24]">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Status Tersedia
            </p>
            <p className="mt-1.5 font-mono text-2xl sm:text-3xl font-bold text-[#1E3A5F] dark:text-sky-400">
              {stats.availableCount}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Siap dibaca / dipinjam
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#161D24]">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Penyimpanan Browser
            </p>
            <p className="mt-1.5 font-mono text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
              {storageText}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              IndexedDB Offline-First
            </p>
          </div>
        </div>
      </section>

      {/* Google Sheets Integration Card */}
      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#161D24] space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-[#1B4332] dark:bg-emerald-500/15 dark:text-emerald-400">
              <Sheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Integrasi Google Sheets
              </h2>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Hubungkan ke Google Spreadsheet Anda untuk menyimpan data katalog secara langsung dan otomatis saat buku baru dicatat.
              </p>
            </div>
          </div>

          {!needsAuth && user && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                {user.email || user.displayName}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPendingSheetsMutation(null);
                  setPendingSheetImport(null);
                  googleSheets.logout();
                }}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Keluar</span>
              </button>
            </div>
          )}
        </div>

        {sheetsSuccess && (
          <div
            role="status"
            className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1B4332] dark:text-emerald-400" />
            <span>{sheetsSuccess}</span>
          </div>
        )}

        {sheetsError && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>{sheetsError}</span>
          </div>
        )}

        {needsAuth ? (
          <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 dark:border-slate-800 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {config
                  ? `Sesi Google perlu dihubungkan ulang untuk "${config.spreadsheetTitle}"`
                  : 'Masuk dengan Akun Google Anda'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Izin hanya digunakan untuk membaca dan menulis Google Spreadsheet katalog Anda.
              </p>
            </div>
            <div className="shrink-0">
              <GoogleSignInButton
                onClick={googleSheets.login}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Menghubungkan...' : 'Masuk dengan Google'}
              />
            </div>
          </div>
        ) : !config ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Create new spreadsheet */}
            <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Buat Spreadsheet Baru
                </h3>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  Otomatis membuat file Google Sheets baru beserta header kolom katalog RakBuku.
                </p>
              </div>
              <input
                type="text"
                value={newSheetTitle}
                onChange={(e) => setNewSheetTitle(e.target.value)}
                placeholder="Nama spreadsheet baru..."
                aria-label="Nama spreadsheet baru"
                className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#1B4332] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={syncing}
                onClick={() =>
                  googleSheets.createNewSheet(
                    newSheetTitle.trim() || 'Katalog Perpustakaan RakBuku'
                  )
                }
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4332] px-4 py-2 text-xs font-semibold text-white hover:bg-[#143325] disabled:opacity-60 dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60]"
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                <span>Buat &amp; Hubungkan Spreadsheet</span>
              </button>
            </div>

            {/* Connect existing spreadsheet */}
            <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Hubungkan Spreadsheet yang Ada
                </h3>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  Tempel tautan URL atau ID Google Spreadsheet milik Anda.
                </p>
              </div>
              <input
                type="text"
                value={sheetUrlInput}
                onChange={(e) => setSheetUrlInput(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                aria-label="Tautan atau ID Google Spreadsheet"
                className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:font-sans focus:border-[#1E3A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={syncing || !sheetUrlInput.trim()}
                onClick={async () => {
                  const connected = await googleSheets.connectExistingSheet(sheetUrlInput);
                  if (connected) setSheetUrlInput('');
                }}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 dark:bg-[#2B5486] dark:hover:bg-[#3566A1]"
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                )}
                <span>Hubungkan Spreadsheet</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connected Spreadsheet Header */}
            <div className="rounded-2xl border border-emerald-200/80 bg-[#FAF9F6] p-4 dark:border-emerald-800/40 dark:bg-slate-900/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1B4332] dark:text-emerald-400">
                    Spreadsheet Terhubung
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {config.spreadsheetTitle}
                    </h3>
                    <a
                      href={config.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A5F] hover:underline dark:text-sky-400"
                    >
                      <span>Buka di Google Sheets</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPendingSheetsMutation(null);
                    setPendingSheetImport(null);
                    googleSheets.disconnectSheet();
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Ganti / Putuskan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="sheets-tab-select"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Tab Lembar Kerja (Sheet)
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="sheets-tab-select"
                      value={config.sheetName}
                      onChange={(e) => googleSheets.selectTab(e.target.value)}
                      className="flex-1 min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-[#1B4332] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {Array.from(
                        new Set([config.sheetName, ...availableTabs])
                      ).map((tab) => (
                        <option key={tab} value={tab}>
                          {tab}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={syncing}
                      onClick={googleSheets.refreshTabs}
                      title="Muat ulang daftar tab"
                      aria-label="Muat ulang daftar tab"
                      className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border border-stone-300 bg-white text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex items-end">
                  <label className="flex w-full min-h-[42px] items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={config.autoSyncOnSave}
                      onChange={(e) => googleSheets.setAutoSync(e.target.checked)}
                      className="h-4 w-4 rounded border-stone-300 text-[#1B4332] focus:ring-[#1B4332]"
                    />
                    <span>Otomatis kirim ke Spreadsheet saat menyimpan buku baru</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={syncing || books.length === 0}
                onClick={() => {
                  setPendingSheetImport(null);
                  setPendingSheetsMutation('appendMissing');
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1B4332] px-4 py-2 text-xs font-semibold text-white hover:bg-[#143325] disabled:opacity-50 dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60]"
              >
                <CloudUpload className="h-4 w-4" aria-hidden="true" />
                <span>Kirim Buku Baru ke Sheets</span>
              </button>

              <button
                type="button"
                disabled={syncing || books.length === 0}
                onClick={() => {
                  setPendingSheetImport(null);
                  setPendingSheetsMutation('replaceAll');
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 dark:bg-[#2B5486] dark:hover:bg-[#3566A1]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>Timpa &amp; Sinkronkan Semua ({books.length})</span>
              </button>

              <button
                type="button"
                disabled={syncing}
                onClick={handleStartImportFromSheet}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-stone-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Impor dari Google Sheets</span>
              </button>
            </div>

            {/* Mandatory Explicit Confirmation Dialog for Google Sheets Write/Overwrite */}
            {pendingSheetsMutation && (
              <div
                role="alertdialog"
                aria-labelledby="sheets-confirm-title"
                className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/40 space-y-3"
              >
                <div>
                  <h4
                    id="sheets-confirm-title"
                    className="text-sm font-semibold text-amber-950 dark:text-amber-100"
                  >
                    {pendingSheetsMutation === 'replaceAll'
                      ? `Konfirmasi Timpa Data Tab "${config.sheetName}"?`
                      : `Konfirmasi Tambah Data ke Tab "${config.sheetName}"?`}
                  </h4>
                  <p className="mt-1 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                    {pendingSheetsMutation === 'replaceAll'
                      ? `Tindakan ini akan menghapus seluruh isi saat ini pada tab "${config.sheetName}" di spreadsheet "${config.spreadsheetTitle}" dan menimpanya dengan ${books.length} data buku dari katalog lokal Anda.`
                      : `Aplikasi akan memeriksa ID yang sudah ada di tab "${config.sheetName}" pada "${config.spreadsheetTitle}" dan menambahkan buku yang belum tercatat (dari total ${books.length} buku lokal).`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={handleConfirmSheetsMutation}
                    className={`min-h-[42px] rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${
                      pendingSheetsMutation === 'replaceAll'
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-[#1B4332] hover:bg-[#143325] dark:bg-[#2D6A4F]'
                    }`}
                  >
                    {syncing
                      ? 'Menyinkronkan...'
                      : pendingSheetsMutation === 'replaceAll'
                      ? 'Ya, Timpa & Sinkronkan'
                      : 'Ya, Kirim ke Sheets'}
                  </button>
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => setPendingSheetsMutation(null)}
                    className="min-h-[42px] rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}

            {/* Confirmation Dialog for Importing from Google Sheets into Local DB */}
            {pendingSheetImport && (
              <div
                role="alertdialog"
                aria-labelledby="sheets-import-confirm-title"
                className="rounded-2xl border border-[#1E3A5F]/25 bg-[#1E3A5F]/[0.04] p-4 dark:border-sky-500/30 dark:bg-sky-950/30 space-y-3"
              >
                <div>
                  <h4
                    id="sheets-import-confirm-title"
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Ditemukan {pendingSheetImport.length} Buku di Tab &ldquo;{config.sheetName}&rdquo;
                  </h4>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Pilih cara memasukkan data dari Google Sheets ke database lokal perangkat Anda:
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={processingRestore}
                    onClick={() => handleConfirmSheetImport('merge')}
                    className="min-h-[42px] rounded-xl bg-[#1B4332] px-4 py-2 text-xs font-semibold text-white hover:bg-[#143325] disabled:opacity-60 dark:bg-[#2D6A4F]"
                  >
                    Gabung dengan Koleksi Ada
                  </button>
                  <button
                    type="button"
                    disabled={processingRestore}
                    onClick={() => handleConfirmSheetImport('replace')}
                    className="min-h-[42px] rounded-xl border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:bg-slate-900 dark:text-red-300"
                  >
                    Timpa Semua Koleksi Lokal
                  </button>
                  <button
                    type="button"
                    disabled={processingRestore}
                    onClick={() => setPendingSheetImport(null)}
                    className="min-h-[42px] rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {statusMessage && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1B4332] dark:text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {restoreError && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <span>{restoreError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Export & Backup Actions */}
        <section className="lg:col-span-7 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#161D24] space-y-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Ekspor &amp; Cadangkan File Lokal
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Seluruh data disimpan gratis di perangkat Anda tanpa biaya server. Unduh file ekspor kapan saja untuk arsip pribadi.
            </p>
          </div>

          <div className="space-y-3">
            {/* CSV / Excel Export */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Spreadsheet (CSV / Excel)
                </h3>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  Format UTF-8 siap buka di Microsoft Excel atau Google Sheets.
                </p>
              </div>
              <button
                type="button"
                disabled={books.length === 0}
                onClick={handleExportCSV}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#1B4332] px-4 py-2 text-xs font-semibold text-white hover:bg-[#143325] disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60] whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                <span>Ekspor ke CSV / Excel</span>
              </button>
            </div>

            {/* JSON Backup */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Cadangan Penuh (JSON + Sampul)
                </h3>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  Menyertakan seluruh metadata dan foto thumbnail sampul untuk pindah perangkat.
                </p>
              </div>
              <button
                type="button"
                disabled={books.length === 0}
                onClick={handleExportJSON}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#2B5486] dark:hover:bg-[#3566A1] whitespace-nowrap shrink-0"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Backup JSON</span>
              </button>
            </div>

            {/* JSON Restore */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Pulihkan dari Backup JSON
                </h3>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  Impor file backup <code className="font-mono">.json</code> RakBuku untuk menggabungkan atau memulihkan koleksi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => restoreInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                <FolderUp className="h-4 w-4" aria-hidden="true" />
                <span>Restore JSON</span>
              </button>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleSelectRestoreFile}
                className="hidden"
              />
            </div>
          </div>

          {/* Pending Restore Confirmation Box */}
          {pendingRestore && (
            <div className="rounded-2xl border border-[#1E3A5F]/25 bg-[#1E3A5F]/[0.04] p-4 dark:border-sky-500/30 dark:bg-sky-950/30 space-y-3">
              <div className="flex items-start gap-2.5">
                <Database className="h-5 w-5 shrink-0 text-[#1E3A5F] dark:text-sky-400 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    File Backup Valid: {pendingRestore.length} Buku Ditemukan
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                    Pilih cara memulihkan data ke database lokal Anda:
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={processingRestore}
                  onClick={() => executeRestore('merge')}
                  className="min-h-[44px] rounded-xl bg-[#1B4332] px-4 py-2 text-xs font-semibold text-white hover:bg-[#143325] disabled:opacity-60 dark:bg-[#2D6A4F]"
                >
                  Gabung dengan Koleksi Ada
                </button>
                <button
                  type="button"
                  disabled={processingRestore}
                  onClick={() => executeRestore('replace')}
                  className="min-h-[44px] rounded-xl border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:bg-slate-900 dark:text-red-300"
                >
                  Timpa Semua Koleksi
                </button>
                <button
                  type="button"
                  disabled={processingRestore}
                  onClick={() => setPendingRestore(null)}
                  className="min-h-[44px] rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Category Breakdown */}
        <section className="lg:col-span-5 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#161D24]">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Distribusi Kategori
            </h2>
            <HardDrive className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          {stats.sortedCategories.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              Belum ada buku untuk ditampilkan dalam ringkasan kategori.
            </p>
          ) : (
            <ul className="space-y-3">
              {stats.sortedCategories.map(([cat, count]) => {
                const pct = Math.round((count / stats.totalBooks) * 100);
                return (
                  <li key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {cat}
                      </span>
                      <span className="font-mono text-slate-600 dark:text-slate-400">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-[#1B4332] dark:bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

