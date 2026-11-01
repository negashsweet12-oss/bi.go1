'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const msg = `${error?.name || ''} ${error?.message || ''}`;
    if (msg.includes('ChunkLoadError') || msg.includes('Loading chunk')) {
      try {
        const lastReload = Number(sessionStorage.getItem('wb_chunk_reload_ts') || '0');
        const now = Date.now();
        if (now - lastReload > 15000) {
          sessionStorage.setItem('wb_chunk_reload_ts', String(now));
          window.location.reload();
          return;
        }
      } catch {
        window.location.reload();
        return;
      }
    }
    console.error('Application error:', error);
  }, [error]);

  const handleRetry = () => {
    const msg = `${error?.name || ''} ${error?.message || ''}`;
    if (msg.includes('ChunkLoadError') || msg.includes('Loading chunk')) {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"
      style={{ backgroundColor: '#020617', color: '#f8fafc', minHeight: '100vh' }}
    >
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-bold text-rose-500">ስህተት አጋጥሟል (An error occurred)</h1>
        <p className="text-xs text-slate-400">
          እባክዎ እንደገና ይሞክሩ ወይም ገጹን ያድሱ።
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            onClick={handleRetry}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-colors"
          >
            እንደገና ሞክር (Try Again)
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs shadow-md transition-colors"
          >
            ገጹን አድስ (Reload)
          </button>
        </div>
      </div>
    </div>
  );
}
