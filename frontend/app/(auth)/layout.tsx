export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">SplitEase</span>
          </div>
          <p className="text-slate-500 text-sm">Split expenses, not friendships</p>
        </div>
        {children}
      </div>
    </div>
  );
}
