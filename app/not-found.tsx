import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"
      style={{ backgroundColor: '#020617', color: '#f8fafc', minHeight: '100vh' }}
    >
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-4xl font-extrabold text-amber-400 font-mono">404</h1>
        <h2 className="text-lg font-bold text-white">ገጹ አልተገኘም (Page Not Found)</h2>
        <p className="text-xs text-slate-400">
          የፈለጉት ገጽ አልተገኘም። እባክዎ ወደ ዋናው የቢንጎ መጫወቻ ገጽ ይመለሱ።
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-colors"
          >
            ወደ ዋናው ገጽ ተመለስ (Back to Home)
          </Link>
        </div>
      </div>
    </div>
  );
}
