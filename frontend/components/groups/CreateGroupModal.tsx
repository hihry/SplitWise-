"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { X, Loader2, Plane, Home, Briefcase, Grid3x3 } from "lucide-react";

const CATEGORIES = [
  { value: "trip",  label: "Trip",  icon: <Plane size={16} /> },
  { value: "home",  label: "Home",  icon: <Home size={16} /> },
  { value: "work",  label: "Work",  icon: <Briefcase size={16} /> },
  { value: "other", label: "Other", icon: <Grid3x3 size={16} /> },
];

export default function CreateGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName]         = useState("");
  const [category, setCategory] = useState("other");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.groups.create({ name: name.trim(), category });
      toast.success(`"${name}" created!`);
      onCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-semibold text-white mb-5">Create a new group</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Group name</label>
          <input
            className="input"
            placeholder="Goa Trip 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <label className="label">Category</label>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-all ${
                  category === cat.value
                    ? "border-brand-500 bg-brand-500/10 text-brand-400"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                }`}
              >
                {cat.icon}
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading || !name.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading && <Loader2 size={15} className="animate-spin" />}
            Create Group
          </button>
        </div>
      </form>
    </Overlay>
  );
}

export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 relative animate-slide-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors">
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
