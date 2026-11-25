import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#1B4332] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#143325] active:scale-[0.98] dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60] whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Pasang App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#1B4332]/25 bg-white px-3 py-2 text-xs font-semibold text-[#1B4332] transition-colors hover:bg-[#F3F1EC] dark:border-emerald-400/25 dark:bg-[#1A232C] dark:text-emerald-300 dark:hover:bg-[#222E3A] whitespace-nowrap shrink-0"
        >
          <Share className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Pasang iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-[#182026] border border-slate-200 dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <h3
                  id="ios-install-title"
                  className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
                >
                  Pasang RakBuku di iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Tutup panduan instalasi"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <ol className="mt-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <li>
                  1. Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah atau atas Safari.
                </li>
                <li>
                  2. Gulir ke bawah lalu pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.
                </li>
                <li>
                  3. Ketuk <strong>Tambah</strong> agar RakBuku dapat diakses layaknya aplikasi native dan siap offline.
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-[#1B4332] py-2.5 text-sm font-semibold text-white hover:bg-[#143325] dark:bg-[#2D6A4F] dark:hover:bg-[#3A7D60]"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
