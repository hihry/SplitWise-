"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Users, LogOut, Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-500" size={32} />
      </div>
    );
  }

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col fixed inset-y-0 left-0 z-40">
        {/* Logo */}
        <div className="p-5 border-b border-slate-800">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-bold text-white tracking-tight">SplitEase</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          <NavItem href="/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" active={pathname === "/dashboard"} />
          <NavItem href="/dashboard" icon={<Users size={18} />} label="My Groups" active={pathname.startsWith("/groups")} />
        </nav>

        {/* User */}
        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
              <span className="text-brand-400 text-xs font-bold">
                {user.email?.[0]?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">
                {user.user_metadata?.full_name || user.email?.split("@")[0]}
              </p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/5 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-60 min-h-screen">
        <div className="max-w-5xl mx-auto p-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-brand-500/10 text-brand-400 border border-brand-500/20"
          : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
