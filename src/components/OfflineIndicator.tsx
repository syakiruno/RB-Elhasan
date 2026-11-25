import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-40 flex items-center gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900 shadow-md dark:border-amber-500/30 dark:bg-amber-950/90 dark:text-amber-200"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <span>
        Mode Offline — Katalog lokal tetap tersedia. Analisis AI membutuhkan koneksi internet.
      </span>
    </div>
  );
};
