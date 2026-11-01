'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
        }
      } catch {
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ backgroundColor: '#020617', color: '#f8fafc', minHeight: '100vh', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>ስርዓቱ ላይ ስህተት ተፈጥሯል</h2>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>እባክዎ እንደገና ይሞክሩ</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
            <button
              onClick={() => {
                const msg = `${error?.name || ''} ${error?.message || ''}`;
                if (msg.includes('ChunkLoadError') || msg.includes('Loading chunk')) {
                  window.location.reload();
                } else {
                  reset();
                }
              }}
              style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#10b981', color: '#020617', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
            >
              እንደገና ሞክር
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#1e293b', color: '#f8fafc', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
            >
              ገጹን አድስ
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
