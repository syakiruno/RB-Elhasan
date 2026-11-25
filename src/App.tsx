import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Camera,
  Database,
  Moon,
  Sun,
} from 'lucide-react';
import { CatalogTab } from './components/CatalogTab';
import { ExportTab } from './components/ExportTab';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ScanBookTab } from './components/ScanBookTab';
import { useGoogleSheets } from './hooks/useGoogleSheets';
import {
  deleteBookById,
  getAllBooks,
  mergeBooks,
  replaceAllBooks,
  saveBook,
} from './lib/db';
import type { BookRecord, TabId } from './types/book';

const NAV_ITEMS: Array<{
  id: TabId;
  label: string;
  icon: typeof Camera;
}> = [
  { id: 'scan', label: 'Pindai Buku', icon: Camera },
  { id: 'catalog', label: 'Koleksi Katalog', icon: BookOpen },
  { id: 'export', label: 'Ekspor & Database', icon: Database },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('scan');
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  const googleSheets = useGoogleSheets();

  const refreshBooks = useCallback(async () => {
    try {
      setDbError(null);
      const all = await getAllBooks();
      setBooks(all);
    } catch (err) {
      setDbError(
        err instanceof Error
          ? err.message
          : 'Gagal memuat database lokal browser.'
      );
    } finally {
      setLoadingBooks(false);
    }
  }, []);

  useEffect(() => {
    refreshBooks();
  }, [refreshBooks]);

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('rakbuku-theme', next ? 'dark' : 'light');
    } catch {
      // Ignore storage write issues
    }
  };

  const handleBookSaved = async (book: BookRecord) => {
    await saveBook(book);
    await refreshBooks();
    const syncRes = await googleSheets.syncSingleBook(book);
    return {
      sheetsSynced: syncRes.synced,
      sheetsMessage: syncRes.message,
    };
  };

  const handleUpdateBook = async (book: BookRecord) => {
    await saveBook(book);
    await refreshBooks();
  };

  const handleDeleteBook = async (id: string) => {
    await deleteBookById(id);
    await refreshBooks();
  };

  const handleRestoreMerge = async (imported: BookRecord[]) => {
    await mergeBooks(imported);
    await refreshBooks();
  };

  const handleRestoreReplace = async (imported: BookRecord[]) => {
    await replaceAllBooks(imported);
    await refreshBooks();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-slate-900 dark:bg-[#0F1419] dark:text-slate-100">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 border-b border-stone-200/90 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-[#141A21]/90 pt-safe">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Brand Logo + Title & Sub-brand */}
          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className="flex items-center gap-2.5 text-left min-w-0 shrink-0"
          >
            <img
              src="/icon.svg"
              alt="Logo RakBuku"
              className="h-9 w-9 rounded-xl shadow-sm shrink-0"
            />
            <div className="leading-tight">
              <span className="block font-display text-lg font-bold tracking-tight text-[#1B4332] dark:text-emerald-300 whitespace-nowrap">
                RakBuku
              </span>
              <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                by RB Elhasan
              </span>
            </div>
          </button>

          {/* Desktop Navigation Tabs */}
          <nav
            className="hidden md:flex items-center gap-1"
            aria-label="Navigasi utama"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-[#1B4332]/10 text-[#1B4332] dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'text-slate-600 hover:bg-stone-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.id === 'catalog' && books.length > 0 && (
                    <span className="font-mono text-[11px] opacity-80">
                      ({books.length})
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Controls: PWA Install + Dark Mode */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              title={isDark ? 'Mode Terang' : 'Mode Gelap'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-slate-700 transition-colors hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-[#1E3A5F]" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 pt-5 pb-24 md:pb-10">
        {dbError && (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
          >
            {dbError}
          </div>
        )}

        {activeTab === 'scan' && (
          <ScanBookTab
            onBookSaved={handleBookSaved}
            onNavigateToCatalog={() => setActiveTab('catalog')}
            onNavigateToExport={() => setActiveTab('export')}
          />
        )}

        {activeTab === 'catalog' && (
          loadingBooks ? (
            <div className="rounded-3xl border border-stone-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#161D24] dark:text-slate-400">
              Memuat koleksi katalog lokal...
            </div>
          ) : (
            <CatalogTab
              books={books}
              onUpdateBook={handleUpdateBook}
              onDeleteBook={handleDeleteBook}
              onGoToScan={() => setActiveTab('scan')}
            />
          )
        )}

        {activeTab === 'export' && (
          <ExportTab
            books={books}
            googleSheets={googleSheets}
            onRestoreMerge={handleRestoreMerge}
            onRestoreReplace={handleRestoreReplace}
          />
        )}
      </main>

      {/* Quiet Brand Footer */}
      <footer className="hidden md:block border-t border-stone-200/80 py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        RakBuku — Katalogisasi Perpustakaan Cerdas · by RB Elhasan
      </footer>

      {/* Mobile Bottom Navigation Bar (Thumb-Friendly) */}
      <nav
        aria-label="Navigasi bawah"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-[#141A21]/95 pb-safe"
      >
        <div className="grid grid-cols-3 h-16 items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex h-full min-h-[44px] flex-col items-center justify-center gap-1 px-1 transition-colors ${
                  isActive
                    ? 'text-[#1B4332] dark:text-emerald-400'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <div className="relative">
                  <Icon
                    className="h-5 w-5"
                    strokeWidth={isActive ? 2.4 : 1.9}
                    aria-hidden="true"
                  />
                  {item.id === 'catalog' && books.length > 0 && (
                    <span className="absolute -top-1.5 -right-3 rounded-md bg-[#1E3A5F] px-1 text-[9px] font-mono font-semibold text-white dark:bg-sky-500 dark:text-slate-950">
                      {books.length > 99 ? '99+' : books.length}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[11px] leading-none whitespace-nowrap ${
                    isActive ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
