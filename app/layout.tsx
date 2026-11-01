import type { Metadata } from 'next';
import { Outfit, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import TelegramWebAppInit from '@/src/components/TelegramWebAppInit';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-mono',
});

const EMPTY_FAVICON_DATA_URI =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export const metadata: Metadata = {
  title: 'Winner Bingo — Provably Fair 75-Ball Multiplayer Bingo',
  description:
    'Real-time multiplayer 75-ball Bingo betting platform with provably fair HMAC-SHA256 draws, integer santim append-only ledger, Amharic and English mobile-first UI, and Responsible Gaming protections.',
  icons: {
    icon: [{ url: EMPTY_FAVICON_DATA_URI, type: 'image/gif' }],
    shortcut: [{ url: EMPTY_FAVICON_DATA_URI, type: 'image/gif' }],
    apple: [{ url: EMPTY_FAVICON_DATA_URI, type: 'image/gif' }],
  },
  openGraph: {
    title: 'Winner Bingo — Provably Fair 75-Ball Multiplayer Bingo',
    description:
      'Real-time multiplayer 75-ball Bingo betting platform with provably fair HMAC-SHA256 draws, integer santim append-only ledger, Amharic and English mobile-first UI, and Responsible Gaming protections.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Winner Bingo — Provably Fair 75-Ball Multiplayer Bingo',
    description:
      'Real-time multiplayer 75-ball Bingo betting platform with provably fair HMAC-SHA256 draws, integer santim append-only ledger, Amharic and English mobile-first UI, and Responsible Gaming protections.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
      style={{ backgroundColor: '#020617', color: '#f8fafc' }}
    >
      <head>
        <link rel="icon" href={EMPTY_FAVICON_DATA_URI} />
        <link rel="shortcut icon" href={EMPTY_FAVICON_DATA_URI} />
        <link rel="apple-touch-icon" href={EMPTY_FAVICON_DATA_URI} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function handleChunkError(e) {
                  var err = (e && (e.reason || e.error)) || e;
                  var msg = (err && (err.message || err.name || String(err))) || '';
                  if (msg.indexOf('ChunkLoadError') !== -1 || msg.indexOf('Loading chunk') !== -1) {
                    var k = 'wb_chunk_reload_ts';
                    var last = Number(sessionStorage.getItem(k) || '0');
                    var now = Date.now();
                    if (now - last > 5000) {
                      sessionStorage.setItem(k, String(now));
                      window.location.reload();
                    }
                  }
                }
                window.addEventListener('error', handleChunkError);
                window.addEventListener('unhandledrejection', handleChunkError);
              })();
            `,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="bg-slate-950 text-slate-100 font-sans antialiased selection:bg-emerald-500 selection:text-slate-950"
        style={{ backgroundColor: '#020617', color: '#f8fafc', minHeight: '100vh' }}
      >
        <TelegramWebAppInit />
        {children}
      </body>
    </html>
  );
}

