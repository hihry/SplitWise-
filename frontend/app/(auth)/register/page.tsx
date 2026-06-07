"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Account created! Signing you in…");
      router.push("/dashboard");
    }
  };

  return (
    <div className="card p-8 animate-fade-in">
      <h1 className="text-xl font-semibold text-white mb-1">Create your account</h1>
      <p className="text-slate-500 text-sm mb-6">Start splitting expenses in seconds</p>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="label">Full name</label>
          <input
            className="input"
            type="text"
            placeholder="Alex Johnson"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            placeholder="Min. 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
          {loading && <Loader2 size={16} className="animate-spin" />}
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
