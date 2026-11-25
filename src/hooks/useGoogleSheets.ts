import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  clearCachedGoogleToken,
  getGoogleAccessToken,
  googleLogout,
  googleSignIn,
  initGoogleAuth,
} from '../lib/googleAuth';
import {
  appendBookToSheet,
  appendMissingBooksToSheet,
  createCatalogSpreadsheet,
  fetchSpreadsheetMetadata,
  GoogleSheetsAuthError,
  importBooksFromSheet,
  parseSpreadsheetId,
  syncAllBooksToSheet,
} from '../lib/googleSheets';
import type { BookRecord, SpreadsheetConfig } from '../types/book';

const CONFIG_STORAGE_KEY = 'rakbuku-sheets-config';

function loadSavedConfig(): SpreadsheetConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpreadsheetConfig>;
    if (
      typeof parsed.spreadsheetId === 'string' &&
      parsed.spreadsheetId &&
      typeof parsed.sheetName === 'string' &&
      parsed.sheetName
    ) {
      return {
        spreadsheetId: parsed.spreadsheetId,
        spreadsheetTitle:
          typeof parsed.spreadsheetTitle === 'string'
            ? parsed.spreadsheetTitle
            : 'Google Spreadsheet',
        spreadsheetUrl:
          typeof parsed.spreadsheetUrl === 'string'
            ? parsed.spreadsheetUrl
            : `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/edit`,
        sheetName: parsed.sheetName,
        autoSyncOnSave: Boolean(parsed.autoSyncOnSave),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveConfig(config: SpreadsheetConfig | null) {
  try {
    if (!config) {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
    } else {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    // Ignore storage errors
  }
}

export function useGoogleSheets() {
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [config, setConfig] = useState<SpreadsheetConfig | null>(loadSavedConfig);
  const [availableTabs, setAvailableTabs] = useState<string[]>(() =>
    config ? [config.sheetName] : []
  );
  const [syncing, setSyncing] = useState<boolean>(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [sheetsSuccess, setSheetsSuccess] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);
      },
      (existingUser) => {
        setUser(existingUser);
        setNeedsAuth(true);
      }
    );
    return unsubscribe;
  }, []);

  const refreshTabsForConfig = useCallback(
    async (targetConfig: SpreadsheetConfig, token: string) => {
      const meta = await fetchSpreadsheetMetadata(token, targetConfig.spreadsheetId);
      setAvailableTabs(meta.availableTabs);
      const validTab = meta.availableTabs.includes(targetConfig.sheetName)
        ? targetConfig.sheetName
        : meta.availableTabs[0];
      const nextConfig: SpreadsheetConfig = {
        ...targetConfig,
        spreadsheetTitle: meta.spreadsheetTitle,
        spreadsheetUrl: meta.spreadsheetUrl,
        sheetName: validTab,
      };
      setConfig(nextConfig);
      saveConfig(nextConfig);
      return meta.availableTabs;
    },
    []
  );

  const handleApiError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof GoogleSheetsAuthError) {
      clearCachedGoogleToken();
      setNeedsAuth(true);
    }
    setSheetsError(err instanceof Error ? err.message : fallback);
  }, []);

  const login = useCallback(async () => {
    setIsLoggingIn(true);
    setSheetsError(null);
    setSheetsSuccess(null);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setNeedsAuth(false);
      if (config) {
        try {
          await refreshTabsForConfig(config, result.accessToken);
        } catch {
          // Existing spreadsheet may no longer be accessible; keep auth alive
        }
      }
      setSheetsSuccess(
        `Terhubung ke Google sebagai ${result.user.email || result.user.displayName || 'Akun Google'}.`
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('popup-closed-by-user')) {
        setSheetsError(
          msg || 'Gagal masuk dengan Google. Pastikan pop-up browser diizinkan.'
        );
      }
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  }, [config, refreshTabsForConfig]);

  const logout = useCallback(async () => {
    setSheetsError(null);
    setSheetsSuccess(null);
    await googleLogout();
    setUser(null);
    setNeedsAuth(true);
  }, []);

  const requireToken = useCallback((): string | null => {
    const token = getGoogleAccessToken();
    if (!token) {
      setNeedsAuth(true);
      setSheetsError(
        'Silakan masuk dengan Google terlebih dahulu untuk mengakses Google Sheets.'
      );
      return null;
    }
    return token;
  }, []);

  const createNewSheet = useCallback(
    async (title?: string) => {
      const token = requireToken();
      if (!token) return null;
      setSyncing(true);
      setSheetsError(null);
      setSheetsSuccess(null);
      try {
        const { config: newConfig, availableTabs: tabs } =
          await createCatalogSpreadsheet(token, title);
        setConfig(newConfig);
        saveConfig(newConfig);
        setAvailableTabs(tabs);
        setSheetsSuccess(
          `Spreadsheet baru "${newConfig.spreadsheetTitle}" berhasil dibuat dan terhubung.`
        );
        return newConfig;
      } catch (err) {
        handleApiError(err, 'Gagal membuat Google Spreadsheet baru.');
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [handleApiError, requireToken]
  );

  const connectExistingSheet = useCallback(
    async (urlOrId: string) => {
      const id = parseSpreadsheetId(urlOrId);
      if (!id) {
        setSheetsError(
          'Tautan atau ID Google Spreadsheet tidak valid. Tempel tautan lengkap dari Google Sheets atau ID spreadsheet-nya.'
        );
        return null;
      }
      const token = requireToken();
      if (!token) return null;

      setSyncing(true);
      setSheetsError(null);
      setSheetsSuccess(null);
      try {
        const meta = await fetchSpreadsheetMetadata(token, id);
        const nextConfig: SpreadsheetConfig = {
          spreadsheetId: meta.spreadsheetId,
          spreadsheetTitle: meta.spreadsheetTitle,
          spreadsheetUrl: meta.spreadsheetUrl,
          sheetName: meta.availableTabs[0],
          autoSyncOnSave: true,
        };
        setConfig(nextConfig);
        saveConfig(nextConfig);
        setAvailableTabs(meta.availableTabs);
        setSheetsSuccess(
          `Berhasil terhubung ke "${meta.spreadsheetTitle}" (tab: ${nextConfig.sheetName}).`
        );
        return nextConfig;
      } catch (err) {
        handleApiError(err, 'Gagal menghubungkan spreadsheet.');
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [handleApiError, requireToken]
  );

  const refreshTabs = useCallback(async () => {
    if (!config) return;
    const token = requireToken();
    if (!token) return;
    setSyncing(true);
    setSheetsError(null);
    try {
      await refreshTabsForConfig(config, token);
    } catch (err) {
      handleApiError(err, 'Gagal memuat daftar tab lembar kerja.');
    } finally {
      setSyncing(false);
    }
  }, [config, handleApiError, refreshTabsForConfig, requireToken]);

  const selectTab = useCallback(
    (sheetName: string) => {
      if (!config) return;
      const updated = { ...config, sheetName };
      setConfig(updated);
      saveConfig(updated);
    },
    [config]
  );

  const setAutoSync = useCallback(
    (enabled: boolean) => {
      if (!config) return;
      const updated = { ...config, autoSyncOnSave: enabled };
      setConfig(updated);
      saveConfig(updated);
    },
    [config]
  );

  const disconnectSheet = useCallback(() => {
    setConfig(null);
    saveConfig(null);
    setAvailableTabs([]);
    setSheetsError(null);
    setSheetsSuccess('Koneksi ke Google Spreadsheet telah dilepas.');
  }, []);

  const syncSingleBook = useCallback(
    async (
      book: BookRecord
    ): Promise<{ synced: boolean; message?: string }> => {
      if (!config || !config.autoSyncOnSave) {
        return { synced: false };
      }
      const token = getGoogleAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return {
          synced: false,
          message:
            'Buku tersimpan lokal, namun sesi Google Sheets perlu masuk ulang di tab Ekspor & Database.',
        };
      }
      try {
        await appendBookToSheet(token, config, book);
        return {
          synced: true,
          message: `Tersinkron otomatis ke Google Sheets ("${config.spreadsheetTitle}" · ${config.sheetName}).`,
        };
      } catch (err) {
        if (err instanceof GoogleSheetsAuthError) {
          clearCachedGoogleToken();
          setNeedsAuth(true);
        }
        return {
          synced: false,
          message:
            err instanceof Error
              ? `Tersimpan lokal, tetapi gagal sinkron ke Google Sheets: ${err.message}`
              : 'Tersimpan lokal, gagal mengirim ke Google Sheets.',
        };
      }
    },
    [config]
  );

  const syncMissingBooks = useCallback(
    async (books: BookRecord[]) => {
      if (!config) return null;
      const token = requireToken();
      if (!token) return null;
      setSyncing(true);
      setSheetsError(null);
      setSheetsSuccess(null);
      try {
        const res = await appendMissingBooksToSheet(token, config, books);
        if (res.addedCount === 0) {
          setSheetsSuccess(
            `Seluruh ${books.length} buku sudah ada di tab "${config.sheetName}".`
          );
        } else {
          setSheetsSuccess(
            `Berhasil mengirim ${res.addedCount} buku baru ke "${config.spreadsheetTitle}" (${res.skippedCount} sudah ada).`
          );
        }
        return res;
      } catch (err) {
        handleApiError(err, 'Gagal mengirim buku baru ke Google Sheets.');
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [config, handleApiError, requireToken]
  );

  const replaceSheetWithCatalog = useCallback(
    async (books: BookRecord[]) => {
      if (!config) return false;
      const token = requireToken();
      if (!token) return false;
      setSyncing(true);
      setSheetsError(null);
      setSheetsSuccess(null);
      try {
        await syncAllBooksToSheet(token, config, books);
        setSheetsSuccess(
          `Tab "${config.sheetName}" pada "${config.spreadsheetTitle}" berhasil diperbarui dengan ${books.length} data buku.`
        );
        return true;
      } catch (err) {
        handleApiError(err, 'Gagal menyinkronkan seluruh katalog ke Google Sheets.');
        return false;
      } finally {
        setSyncing(false);
      }
    },
    [config, handleApiError, requireToken]
  );

  const importFromSheet = useCallback(async () => {
    if (!config) return null;
    const token = requireToken();
    if (!token) return null;
    setSyncing(true);
    setSheetsError(null);
    setSheetsSuccess(null);
    try {
      const imported = await importBooksFromSheet(token, config);
      if (imported.length === 0) {
        setSheetsError(
          `Tidak ditemukan baris data buku pada tab "${config.sheetName}".`
        );
        return null;
      }
      return imported;
    } catch (err) {
      handleApiError(err, 'Gagal membaca data dari Google Sheets.');
      return null;
    } finally {
      setSyncing(false);
    }
  }, [config, handleApiError, requireToken]);

  const clearMessages = useCallback(() => {
    setSheetsError(null);
    setSheetsSuccess(null);
  }, []);

  return {
    user,
    needsAuth,
    isLoggingIn,
    config,
    availableTabs,
    syncing,
    sheetsError,
    sheetsSuccess,
    login,
    logout,
    createNewSheet,
    connectExistingSheet,
    refreshTabs,
    selectTab,
    setAutoSync,
    disconnectSheet,
    syncSingleBook,
    syncMissingBooks,
    replaceSheetWithCatalog,
    importFromSheet,
    clearMessages,
    setSheetsSuccess,
    setSheetsError,
  };
}
