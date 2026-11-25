import type { BookRecord } from '../types/book';

const DB_NAME = 'RakBukuDB';
const DB_VERSION = 1;
const STORE_NAME = 'books';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser ini tidak mendukung IndexedDB.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('judul_utama', 'judul_utama', { unique: false });
        store.createIndex('kategori_umum', 'kategori_umum', { unique: false });
        store.createIndex('isbn', 'isbn', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Gagal membuka database lokal.'));
  });
}

export async function getAllBooks(): Promise<BookRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const items = (req.result as BookRecord[]) || [];
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(items);
    };
    req.onerror = () => reject(req.error ?? new Error('Gagal membaca koleksi buku.'));
  });
}

export async function saveBook(book: BookRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(book);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Gagal menyimpan data buku.'));
  });
}

export async function deleteBookById(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Gagal menghapus buku.'));
  });
}

export async function replaceAllBooks(books: BookRecord[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const book of books) {
      store.put(book);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal memulihkan database buku.'));
  });
}

export async function mergeBooks(books: BookRecord[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const book of books) {
      store.put(book);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal menggabungkan database buku.'));
  });
}

export async function getStorageEstimateMB(): Promise<string> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number') {
        const mb = est.usage / (1024 * 1024);
        return mb < 0.1 ? `${Math.round(est.usage / 1024)} KB` : `${mb.toFixed(2)} MB`;
      }
    }
  } catch {
    // Ignore unsupported storage estimation
  }
  return 'Tersimpan lokal';
}
