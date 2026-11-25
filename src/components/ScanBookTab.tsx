import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  AlertCircle,
  Barcode,
  BookOpen,
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe,
  ImagePlus,
  Loader2,
  QrCode,
  RefreshCw,
  RotateCcw,
  Sparkles,
  SwitchCamera,
  Trash2,
  X,
} from 'lucide-react';
import {
  createNativeBarcodeDetector,
  createZxingBarcodeReader,
  detectCodeFromVideoFrame,
  normalizeScannedIsbn,
} from '../lib/barcodeScanner';
import { compressImageFile, compressVideoFrame } from '../lib/imageCompression';
import type {
  BookRecord,
  CapturedSlotPhoto,
  ExtractedBookData,
  GroundingSource,
  IsbnLookupResponse,
} from '../types/book';
import { BookForm } from './BookForm';

interface ScanBookTabProps {
  onBookSaved: (
    book: BookRecord
  ) => Promise<{ sheetsSynced?: boolean; sheetsMessage?: string } | void>;
  onNavigateToCatalog: () => void;
  onNavigateToExport?: () => void;
}

const SLOT_DEFINITIONS: Array<{
  index: 0 | 1 | 2;
  title: string;
  hint: string;
}> = [
  {
    index: 0,
    title: 'Foto 1: Sampul Depan',
    hint: 'Otomatis jadi thumbnail katalog',
  },
  {
    index: 1,
    title: 'Foto 2: Sampul Belakang',
    hint: 'Barcode ISBN / QRCBN & sinopsis',
  },
  {
    index: 2,
    title: 'Foto 3: Halaman Hak Cipta',
    hint: 'Info penerbit, tahun & KDT',
  },
];

const LOADING_MESSAGES = [
  'Menyiapkan foto terkompresi untuk analisis...',
  'Membaca judul, penulis, dan halaman hak cipta...',
  'Menyusun klasifikasi DDC dan metadata bibliografi...',
];

const PERPUSNAS_SEARCH_URL = 'https://isbn.perpusnas.go.id/landing_page/search';

function createEmptyExtractedBook(barcode: string): ExtractedBookData {
  return {
    judul_utama: '',
    anak_judul: null,
    penulis: [],
    editor_atau_penerjemah: null,
    desain_sampul: null,
    ilustrator: null,
    layouter: null,
    penerbit: null,
    kota_terbit: null,
    tahun_terbit: null,
    isbn: barcode || null,
    bahasa: 'Indonesia',
    kategori_umum: 'Non-Fiksi',
    kode_ddc: '000',
    sinopsis_singkat: null,
    status_kondisi: 'Tersedia',
  };
}

export const ScanBookTab: React.FC<ScanBookTabProps> = ({
  onBookSaved,
  onNavigateToCatalog,
  onNavigateToExport,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const nativeDetectorRef = useRef<ReturnType<typeof createNativeBarcodeDetector>>(null);
  const barcodeBusyRef = useRef(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const lastAutoLookedUpRef = useRef<string>('');

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureFlash, setCaptureFlash] = useState(false);

  const [photos, setPhotos] = useState<Record<number, CapturedSlotPhoto>>({});
  const [activeSlot, setActiveSlot] = useState<0 | 1 | 2>(0);

  const [detectedBarcode, setDetectedBarcode] = useState('');
  const [detectedCodeKind, setDetectedCodeKind] = useState<'BARCODE' | 'QRCBN' | null>(
    null
  );
  const [barcodeFlash, setBarcodeFlash] = useState(false);
  const [autoCheckPerpusnas, setAutoCheckPerpusnas] = useState(false);
  const [clipboardCopiedNotice, setClipboardCopiedNotice] = useState(false);

  const [lookingUpPerpusnas, setLookingUpPerpusnas] = useState(false);
  const [perpusnasNotice, setPerpusnasNotice] = useState<string | null>(null);
  const [customCoverThumbnail, setCustomCoverThumbnail] = useState<string | null>(null);
  const [groundingSources, setGroundingSources] = useState<GroundingSource[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [extractedBook, setExtractedBook] = useState<ExtractedBookData | null>(null);
  const [savedSuccessBook, setSavedSuccessBook] = useState<BookRecord | null>(null);
  const [savedSheetsFeedback, setSavedSheetsFeedback] = useState<{
    synced?: boolean;
    message: string;
  } | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setCameraLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startCamera = useCallback(
    async (mode: 'environment' | 'user' = facingMode) => {
      setCameraError(null);
      setSavedSuccessBook(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Browser atau perangkat ini tidak mendukung akses kamera langsung. Gunakan tombol Unggah dari Galeri.'
        );
        return;
      }

      stopCamera();
      setCameraLoading(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        setCameraOpen(true);

        requestAnimationFrame(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        });
      } catch (err: unknown) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError(
            'Izin kamera ditolak. Buka pengaturan browser (ikon gembok di bilah alamat), izinkan akses Kamera untuk situs ini, lalu tekan Coba Lagi — atau unggah foto dari galeri.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraError(
            'Kamera tidak ditemukan pada perangkat ini. Silakan gunakan tombol Unggah dari Galeri.'
          );
        } else if (name === 'NotReadableError') {
          setCameraError(
            'Kamera sedang dipakai oleh aplikasi lain. Tutup aplikasi tersebut atau gunakan Unggah dari Galeri.'
          );
        } else {
          setCameraError(
            'Tidak dapat membuka kamera. Pastikan halaman diakses melalui HTTPS atau localhost, atau unggah foto dari galeri.'
          );
        }
      } finally {
        setCameraLoading(false);
      }
    },
    [facingMode, stopCamera]
  );

  const lookupPerpusnasByIsbn = useCallback(
    async (isbnToLookup: string) => {
      const cleaned = isbnToLookup.replace(/[^0-9Xx]/g, '').toUpperCase();
      if (cleaned.length !== 10 && cleaned.length !== 13) {
        setAnalysisError(
          'Masukkan nomor ISBN-10 atau ISBN-13 yang valid (10 atau 13 digit).'
        );
        return;
      }
      if (!navigator.onLine) {
        setPerpusnasNotice(
          `ISBN ${cleaned} terdeteksi (mode offline). Sambungkan internet untuk mencari di Perpusnas, atau isi data manual.`
        );
        return;
      }

      setLookingUpPerpusnas(true);
      setAnalysisError(null);
      setPerpusnasNotice(null);

      try {
        const res = await fetch('/api/lookup-isbn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isbn: cleaned }),
        });

        const data = (await res.json()) as IsbnLookupResponse & { error?: string };

        if (!res.ok) {
          throw new Error(data.error || 'Gagal mencari data buku di Perpusnas.');
        }

        if (data.found && data.book) {
          stopCamera();
          setGroundingSources(data.sources ?? []);
          setExtractedBook(data.book);
          setPerpusnasNotice(null);
        } else {
          setGroundingSources(data.sources ?? []);
          setPerpusnasNotice(
            data.message ||
              `Data untuk ISBN ${cleaned} belum ditemukan di indeks Perpusnas. Silakan ambil foto sampul/hak cipta untuk ekstraksi AI atau isi manual.`
          );
        }
      } catch (err) {
        setAnalysisError(
          err instanceof Error
            ? err.message
            : 'Gagal mengambil data dari Perpusnas.'
        );
      } finally {
        setLookingUpPerpusnas(false);
      }
    },
    [stopCamera]
  );

  // Real-time automatic Barcode & QRCBN scanning loop while camera is open
  useEffect(() => {
    if (!cameraOpen) return;

    if (!readerRef.current) {
      readerRef.current = createZxingBarcodeReader();
    }
    if (!nativeDetectorRef.current) {
      nativeDetectorRef.current = createNativeBarcodeDetector();
    }
    if (!scanCanvasRef.current) {
      scanCanvasRef.current = document.createElement('canvas');
    }

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      if (cancelled || barcodeBusyRef.current) return;
      const video = videoRef.current;
      const canvas = scanCanvasRef.current;
      const reader = readerRef.current;
      if (!video || !canvas || !reader || video.readyState < 2 || video.videoWidth === 0) {
        return;
      }

      barcodeBusyRef.current = true;
      try {
        const detected = await detectCodeFromVideoFrame(
          video,
          canvas,
          reader,
          nativeDetectorRef.current
        );
        if (!cancelled && detected && detected.isbn !== detectedBarcode) {
          setDetectedBarcode(detected.isbn);
          setDetectedCodeKind(detected.kind);
          setBarcodeFlash(true);
          setPerpusnasNotice(null);
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate([80, 40, 80]);
          }
          window.setTimeout(() => setBarcodeFlash(false), 1800);

          if (
            autoCheckPerpusnas &&
            !lookingUpPerpusnas &&
            lastAutoLookedUpRef.current !== detected.isbn
          ) {
            lastAutoLookedUpRef.current = detected.isbn;
            lookupPerpusnasByIsbn(detected.isbn);
          }
        }
      } finally {
        barcodeBusyRef.current = false;
      }
    }, 240);

    return () => {
      cancelled = true;
      barcodeBusyRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [
    cameraOpen,
    detectedBarcode,
    autoCheckPerpusnas,
    lookingUpPerpusnas,
    lookupPerpusnasByIsbn,
  ]);

  useEffect(() => {
    if (!analyzing) {
      setLoadingStepIdx(0);
      return;
    }
    const timer = window.setInterval(() => {
      setLoadingStepIdx((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [analyzing]);

  const advanceToNextEmptySlot = (
    updatedPhotos: Record<number, CapturedSlotPhoto>,
    current: 0 | 1 | 2
  ) => {
    const order: Array<0 | 1 | 2> = [0, 1, 2];
    const nextEmpty = order.find((idx) => idx !== current && !updatedPhotos[idx]);
    if (nextEmpty !== undefined) {
      setActiveSlot(nextEmpty);
    }
  };

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const compressed = compressVideoFrame(video);
    const slotDef = SLOT_DEFINITIONS[activeSlot];
    const newPhoto: CapturedSlotPhoto = {
      slotIndex: activeSlot,
      label: slotDef.title,
      aiDataUrl: compressed.aiDataUrl,
      thumbnailDataUrl: compressed.thumbnailDataUrl,
      sizeKB: compressed.sizeKB,
    };

    const nextMap = { ...photos, [activeSlot]: newPhoto };
    setPhotos(nextMap);
    setAnalysisError(null);
    setCaptureFlash(true);
    window.setTimeout(() => setCaptureFlash(false), 180);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(40);
    }
    advanceToNextEmptySlot(nextMap, activeSlot);
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setAnalysisError(null);
    setSavedSuccessBook(null);
    setPerpusnasNotice(null);

    try {
      let currentSlot: 0 | 1 | 2 = activeSlot;
      const nextMap = { ...photos };
      let foundIsbnInGallery: string | null = null;

      if (!readerRef.current) {
        readerRef.current = createZxingBarcodeReader();
      }

      for (let i = 0; i < files.length && i < 3; i++) {
        const file = files[i];
        const compressed = await compressImageFile(file);

        try {
          const result = await readerRef.current.decodeFromImageUrl(compressed.aiDataUrl);
          const rawText = result.getText();
          const isbn = normalizeScannedIsbn(rawText);
          if (isbn) {
            foundIsbnInGallery = isbn;
            setDetectedBarcode(isbn);
            setDetectedCodeKind(rawText.includes('http') ? 'QRCBN' : 'BARCODE');
            setBarcodeFlash(true);
            window.setTimeout(() => setBarcodeFlash(false), 1800);
          }
        } catch {
          // Not every photo contains a barcode/QRCBN
        }

        const slotDef = SLOT_DEFINITIONS[currentSlot];
        nextMap[currentSlot] = {
          slotIndex: currentSlot,
          label: slotDef.title,
          aiDataUrl: compressed.aiDataUrl,
          thumbnailDataUrl: compressed.thumbnailDataUrl,
          sizeKB: compressed.sizeKB,
        };

        const emptyNext = ([0, 1, 2] as const).find((idx) => !nextMap[idx]);
        if (emptyNext !== undefined) {
          currentSlot = emptyNext;
        }
      }

      setPhotos(nextMap);
      setActiveSlot(currentSlot);

      if (
        foundIsbnInGallery &&
        autoCheckPerpusnas &&
        lastAutoLookedUpRef.current !== foundIsbnInGallery
      ) {
        lastAutoLookedUpRef.current = foundIsbnInGallery;
        await lookupPerpusnasByIsbn(foundIsbnInGallery);
      }
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Gagal memproses foto dari galeri.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (slotIdx: 0 | 1 | 2) => {
    const next = { ...photos };
    delete next[slotIdx];
    setPhotos(next);
    setActiveSlot(slotIdx);
  };

  const handleSelectRetake = (slotIdx: 0 | 1 | 2) => {
    setActiveSlot(slotIdx);
    if (!cameraOpen) {
      startCamera(facingMode);
    }
  };

  const handleSwitchCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (cameraOpen) {
      startCamera(nextMode);
    }
  };

  const capturedList = ([0, 1, 2] as const)
    .map((idx) => photos[idx])
    .filter((p): p is CapturedSlotPhoto => Boolean(p));

  const handleAnalyzeWithAI = async () => {
    setAnalysisError(null);
    setPerpusnasNotice(null);

    if (capturedList.length === 0 && !detectedBarcode.trim()) {
      setAnalysisError(
        'Ambil minimal 1 foto buku atau pindai barcode/QRCBN sebelum memulai analisis AI.'
      );
      return;
    }

    if (!navigator.onLine) {
      setAnalysisError(
        'Anda sedang offline. Sambungkan ke internet untuk ekstraksi Gemini AI, atau tekan "Isi Formulir Secara Manual" untuk mencatat buku secara offline.'
      );
      return;
    }

    setAnalyzing(true);
    stopCamera();

    try {
      const response = await fetch('/api/extract-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: capturedList.map((p) => ({
            label: p.label,
            dataUrl: p.aiDataUrl,
          })),
          barcode: detectedBarcode.trim() || undefined,
        }),
      });

      const result = (await response.json()) as {
        book?: ExtractedBookData;
        sources?: GroundingSource[];
        error?: string;
      };

      if (!response.ok || !result.book) {
        throw new Error(
          result.error || 'Gagal mengekstrak data buku dari gambar.'
        );
      }

      setGroundingSources(result.sources ?? []);
      setExtractedBook(result.book);
    } catch (err) {
      setAnalysisError(
        err instanceof Error
          ? err.message
          : 'Terjadi gangguan jaringan saat menghubungi layanan AI.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveVerifiedBook = async (data: ExtractedBookData) => {
    const now = new Date().toISOString();
    const coverThumb =
      customCoverThumbnail ??
      photos[0]?.thumbnailDataUrl ??
      capturedList[0]?.thumbnailDataUrl ??
      null;

    const record: BookRecord = {
      ...data,
      id: crypto.randomUUID(),
      coverThumbnail: coverThumb,
      createdAt: now,
      updatedAt: now,
    };

    const saveResult = await onBookSaved(record);
    setSavedSuccessBook(record);
    setSavedSheetsFeedback(
      saveResult && saveResult.sheetsMessage
        ? { synced: saveResult.sheetsSynced, message: saveResult.sheetsMessage }
        : null
    );
    setExtractedBook(null);
    setGroundingSources([]);
    setCustomCoverThumbnail(null);
    setPerpusnasNotice(null);
    setPhotos({});
    setActiveSlot(0);
    setDetectedBarcode('');
    setDetectedCodeKind(null);
    lastAutoLookedUpRef.current = '';
  };

  const handleResetScanner = () => {
    setSavedSuccessBook(null);
    setSavedSheetsFeedback(null);
    setExtractedBook(null);
    setGroundingSources([]);
    setCustomCoverThumbnail(null);
    setPerpusnasNotice(null);
    setAnalysisError(null);
    setPhotos({});
    setActiveSlot(0);
    setDetectedBarcode('');
    setDetectedCodeKind(null);
    lastAutoLookedUpRef.current = '';
  };

  const handleCopyIsbnForPerpusnas = () => {
    if (!detectedBarcode) return;
    navigator.clipboard?.writeText(detectedBarcode).catch(() => {});
    setClipboardCopiedNotice(true);
    window.setTimeout(() => setClipboardCopiedNotice(false), 3200);
  };

  const activeCoverThumbnail =
    customCoverThumbnail ??
    photos[0]?.thumbnailDataUrl ??
    capturedList[0]?.thumbnailDataUrl ??
    null;

  const isValidBarcodeReady =
    detectedBarcode.length === 10 || detectedBarcode.length === 13;

  return (
    <div className="space-y-6">
      {/* Post-save Confirmation Card */}
      {savedSuccessBook && (
        <section
          aria-live="polite"
          className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-5 dark:border-emerald-800/60 dark:bg-emerald-950/50"
        >
          <div className="flex items-start gap-3.5">
            <CheckCircle2
              className="h-6 w-6 shrink-0 text-[#1B4332] dark:text-emerald-400 mt-0.5"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Buku Tersimpan ke Katalog
              </h2>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                <strong>{savedSuccessBook.judul_utama}</strong> berhasil dicatat di database lokal browser Anda.
              </p>
              {savedSheetsFeedback && (
                <p
                  className={`mt-1.5 text-xs font-medium ${
                    savedSheetsFeedback.synced
                      ? 'text-[#1B4332] dark:text-emerald-300'
                      : 'text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {savedSheetsFeedback.message}{' '}
                  {!savedSheetsFeedback.synced && onNavigateToExport && (
                    <button
                      type="button"
                      onClick={onNavigateToExport}
                      className="underline font-semibold ml-1"
                    >
                      Buka Integrasi Sheets
                    </button>
                  )}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={handleResetScanner}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white hover:bg-[#143325] dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60]"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  <span>Pindai Buku Lainnya</span>
                </button>
                <button
                  type="button"
                  onClick={onNavigateToCatalog}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  <span>Lihat Koleksi Katalog</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Editable AI / Perpusnas Verification Form View */}
      {extractedBook ? (
        <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-[#161D24]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4 mb-5 dark:border-slate-800">
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                Verifikasi &amp; Lengkapi Data Pustaka
              </h2>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                Formulir telah diisi otomatis. Periksa sebelum menyimpan ke database perpustakaan Anda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExtractedBook(null)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Kembali ke Pemindai</span>
            </button>
          </div>

          <BookForm
            initialData={extractedBook}
            coverThumbnail={activeCoverThumbnail}
            sources={groundingSources}
            submitLabel="Simpan ke Katalog"
            onCoverChange={(thumb) => setCustomCoverThumbnail(thumb)}
            onSubmit={handleSaveVerifiedBook}
            onCancel={() => setExtractedBook(null)}
          />
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (Mobile Top): Automatic Barcode / QRCBN Camera & Perpusnas Check */}
          <section className="lg:col-span-7 rounded-3xl border border-stone-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-[#161D24]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Pemindai Barcode &amp; QRCBN Otomatis
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Arahkan kamera ke barcode ISBN atau kode QRCBN, lalu tekan Cek Perpusnas.
                </p>
              </div>
              {cameraOpen && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSwitchCamera}
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-medium text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    title="Ganti kamera depan/belakang"
                    aria-label="Ganti kamera depan atau belakang"
                  >
                    <SwitchCamera className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    <span>Tutup</span>
                  </button>
                </div>
              )}
            </div>

            {/* Camera Viewfinder or Launch Area */}
            {cameraOpen ? (
              <div className="relative overflow-hidden rounded-2xl bg-slate-950 aspect-[4/3] sm:aspect-video select-none">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full object-cover"
                />

                {captureFlash && (
                  <div className="pointer-events-none absolute inset-0 z-40 bg-white/55 transition-opacity" />
                )}

                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-between p-3">
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="rounded-lg bg-black/70 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white">
                      Target: {SLOT_DEFINITIONS[activeSlot].title}
                    </span>
                    <span className="rounded-lg bg-black/70 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-emerald-300">
                      Auto Barcode &amp; QRCBN
                    </span>
                  </div>

                  {/* Centered Barcode / QRCBN Scanner Guide Box */}
                  <div className="relative w-60 h-28 sm:w-72 sm:h-32 rounded-2xl border-2 border-dashed border-white/70 bg-black/10 flex items-center justify-center">
                    <span className="rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white/90">
                      Posisikan Barcode / QRCBN di sini
                    </span>
                  </div>

                  {/* Bottom Bar with Bottom-Right Foreground Shutter Button */}
                  <div className="w-full flex items-end justify-between gap-3">
                    <span className="rounded-lg bg-black/65 backdrop-blur-sm px-2.5 py-1 text-[11px] text-white/95">
                      {detectedBarcode
                        ? `${detectedCodeKind === 'QRCBN' ? 'QRCBN' : 'ISBN'} tertangkap: ${detectedBarcode}`
                        : 'Membaca barcode / QRCBN secara otomatis...'}
                    </span>
                    <button
                      type="button"
                      onClick={handleCaptureFrame}
                      className="pointer-events-auto relative z-30 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-white bg-[#1B4332] text-white shadow-xl transition-transform active:scale-90 hover:bg-[#2D6A4F]"
                      aria-label={`Jepret ${SLOT_DEFINITIONS[activeSlot].title}`}
                      title={`Jepret ${SLOT_DEFINITIONS[activeSlot].title}`}
                    >
                      <Camera className="h-7 w-7" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-[#FAF9F6] px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1B4332]/10 text-[#1B4332] dark:bg-emerald-500/15 dark:text-emerald-400">
                  <QrCode className="h-7 w-7" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Siap Memindai Barcode &amp; QRCBN
                </h3>
                <p className="mt-1 max-w-sm text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Kamera membaca barcode ISBN dan QRCBN secara otomatis. Setelah kode tertangkap, tombol Cek Perpusnas akan langsung aktif untuk mengisi formulir katalog.
                </p>

                <div className="mt-5 flex flex-col sm:flex-row flex-wrap w-full sm:w-auto justify-center gap-2.5">
                  <button
                    type="button"
                    disabled={cameraLoading}
                    onClick={() => startCamera(facingMode)}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#1B4332] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#143325] active:scale-[0.98] disabled:opacity-60 dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60]"
                  >
                    {cameraLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>{cameraLoading ? 'Membuka Kamera...' : 'Buka Kamera'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-stone-100 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    <span>Unggah dari Galeri</span>
                  </button>
                </div>
              </div>
            )}

            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleGalleryUpload}
              className="hidden"
            />

            {/* Camera Error Message */}
            {cameraError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
                <div className="flex-1 space-y-2">
                  <p className="leading-relaxed">{cameraError}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startCamera(facingMode)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Coba Lagi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-slate-900 dark:text-amber-200"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span>Pilih Foto Galeri</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Detected Barcode / QRCBN Field + Activated "Cek Perpusnas" Button */}
            <div
              className={`mt-4 rounded-2xl border p-3.5 transition-colors space-y-3 ${
                barcodeFlash
                  ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/60'
                  : isValidBarcodeReady
                  ? 'border-[#1B4332]/40 bg-[#1B4332]/[0.03] dark:border-emerald-500/40 dark:bg-emerald-950/20'
                  : 'border-stone-200 bg-stone-50/70 dark:border-slate-800 dark:bg-slate-900/50'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="detected-isbn-input"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Barcode className="h-4 w-4 text-[#1E3A5F] dark:text-sky-400" aria-hidden="true" />
                  <span>Hasil Pindai Barcode / QRCBN (ISBN)</span>
                </label>
                {isValidBarcodeReady && (
                  <span className="text-xs font-semibold text-[#1B4332] dark:text-emerald-400">
                    {detectedCodeKind === 'QRCBN'
                      ? 'QRCBN tertangkap — siap Cek Perpusnas'
                      : 'Barcode tertangkap — siap Cek Perpusnas'}
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex flex-1 gap-2">
                  <input
                    id="detected-isbn-input"
                    type="text"
                    inputMode="numeric"
                    value={detectedBarcode}
                    onChange={(e) => {
                      lastAutoLookedUpRef.current = '';
                      setDetectedCodeKind(null);
                      setDetectedBarcode(
                        e.target.value.replace(/[^0-9Xx]/g, '').toUpperCase()
                      );
                    }}
                    placeholder="Pindai barcode/QRCBN atau ketik ISBN 10/13 digit..."
                    className="flex-1 min-h-[44px] rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-xs placeholder:text-slate-400 focus:border-[#1B4332] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  {detectedBarcode && (
                    <button
                      type="button"
                      onClick={() => {
                        setDetectedBarcode('');
                        setDetectedCodeKind(null);
                        setPerpusnasNotice(null);
                        lastAutoLookedUpRef.current = '';
                      }}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-stone-300 bg-white text-slate-500 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      aria-label="Hapus barcode"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Primary Cek Perpusnas Button — activated once barcode/QRCBN is pulled */}
                <button
                  type="button"
                  disabled={lookingUpPerpusnas || !isValidBarcodeReady}
                  onClick={() => lookupPerpusnasByIsbn(detectedBarcode)}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition-all whitespace-nowrap shrink-0 ${
                    isValidBarcodeReady
                      ? 'bg-[#1B4332] text-white hover:bg-[#143325] active:scale-[0.98] dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60]'
                      : 'bg-stone-200 text-stone-500 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'
                  }`}
                >
                  {lookingUpPerpusnas ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>
                    {lookingUpPerpusnas ? 'Mengecek Perpusnas...' : 'Cek Perpusnas'}
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoCheckPerpusnas}
                    onChange={(e) => setAutoCheckPerpusnas(e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-[#1B4332] focus:ring-[#1B4332]"
                  />
                  <span>Otomatis jalankan Cek Perpusnas saat barcode tertangkap</span>
                </label>

                {isValidBarcodeReady && (
                  <a
                    href={PERPUSNAS_SEARCH_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleCopyIsbnForPerpusnas}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A5F] hover:underline dark:text-sky-400"
                  >
                    <span>Buka Portal Perpusnas (Salin ISBN)</span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>

              {clipboardCopiedNotice && (
                <p className="text-[11px] font-medium text-[#1B4332] dark:text-emerald-400">
                  ISBN {detectedBarcode} disalin — tempel ke kolom pencarian Perpusnas (adv_isbn) bila diperlukan.
                </p>
              )}

              {lookingUpPerpusnas && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 rounded-xl border border-[#1E3A5F]/20 bg-[#1E3A5F]/[0.06] px-3 py-2 text-xs font-medium text-[#1E3A5F] dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-300"
                >
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>
                    Mengambil data pustaka Perpusnas untuk ISBN{' '}
                    <strong className="font-mono">{detectedBarcode}</strong>...
                  </span>
                </div>
              )}

              {perpusnasNotice && (
                <div
                  role="status"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/50 dark:text-amber-200"
                >
                  {perpusnasNotice}
                </div>
              )}
            </div>
          </section>

          {/* Right Column (Mobile Below): Multi-Foto Slots & AI Extraction Trigger */}
          <section className="lg:col-span-5 rounded-3xl border border-stone-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-[#161D24] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Slot Multi-Foto Buku
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Opsional: foto sampul untuk thumbnail &amp; ekstraksi AI.
                </p>
              </div>
              <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">
                {capturedList.length}/3 foto
              </span>
            </div>

            <div className="space-y-2.5">
              {SLOT_DEFINITIONS.map((slot) => {
                const captured = photos[slot.index];
                const isSelected = activeSlot === slot.index;
                return (
                  <div
                    key={slot.index}
                    className={`flex items-center gap-3 rounded-2xl border p-2.5 transition-colors ${
                      isSelected
                        ? 'border-[#1B4332] bg-[#1B4332]/[0.04] dark:border-emerald-500/70 dark:bg-emerald-500/[0.06]'
                        : 'border-stone-200 bg-[#FAF9F6] dark:border-slate-800 dark:bg-slate-900/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveSlot(slot.index)}
                      className="flex flex-1 min-w-0 items-center gap-3 text-left"
                    >
                      {captured ? (
                        <img
                          src={captured.thumbnailDataUrl}
                          alt={slot.title}
                          referrerPolicy="no-referrer"
                          className="h-16 w-12 rounded-lg object-cover border border-stone-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white text-xs font-mono font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                          {slot.index + 1}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {slot.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 truncate">
                          {captured
                            ? `Tersimpan · ~${captured.sizeKB} KB`
                            : slot.hint}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {captured ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSelectRetake(slot.index)}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-stone-200 bg-white text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            title="Ambil ulang foto ini"
                            aria-label={`Ambil ulang ${slot.title}`}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(slot.index)}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-800 dark:text-red-400"
                            title="Hapus foto ini"
                            aria-label={`Hapus ${slot.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSlot(slot.index);
                            galleryInputRef.current?.click();
                          }}
                          className="min-h-[40px] rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          Pilih
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {analysisError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-200"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{analysisError}</p>
              </div>
            )}

            {/* Informative AI Loading Indicator */}
            {analyzing && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-2xl border border-[#1E3A5F]/20 bg-[#1E3A5F]/[0.05] p-4 dark:border-sky-500/30 dark:bg-sky-950/40"
              >
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-[#1E3A5F] dark:text-sky-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Pustakawan AI sedang membaca buku...
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {LOADING_MESSAGES[loadingStepIdx]}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Primary CTA: Analisis Foto & Ekstrak Data */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={analyzing || (capturedList.length === 0 && !detectedBarcode.trim())}
                onClick={handleAnalyzeWithAI}
                className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#162C49] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#2B5486] dark:hover:bg-[#3566A1]"
              >
                {analyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                <span>
                  {analyzing
                    ? 'Menganalisis Data Buku...'
                    : 'Analisis Foto & Ekstrak Data'}
                </span>
              </button>

              <button
                type="button"
                disabled={analyzing}
                onClick={() => {
                  stopCamera();
                  setGroundingSources([]);
                  setExtractedBook(createEmptyExtractedBook(detectedBarcode));
                }}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>Isi Formulir Secara Manual (Bisa Offline)</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
