"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { api, Member } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overlay } from "./CreateGroupModal";
import { UserPlus, Trash2, Loader2, Crown } from "lucide-react";

export default function MembersPanel({
  groupId,
  members,
  onClose,
  onChanged,
}: {
  groupId: string;
  members: Member[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user }     = useAuth();
  const [email, setEmail]   = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const currentMember = members.find((m) => m.user_id === user?.id);
  const isAdmin = currentMember?.role === "admin";

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await api.groups.addMember(groupId, email.trim());
      toast.success("Member added");
      setEmail("");
      onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from the group?`)) return;
    setRemoving(userId);
    try {
      await api.groups.removeMember(groupId, userId);
      toast.success(`${name} removed`);
      onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-semibold text-white mb-5">Group Members</h2>

      {/* Member list */}
      <div className="space-y-2 mb-5">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center">
                <span className="text-xs text-slate-300 font-medium">
                  {m.full_name?.[0]?.toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
                  {m.full_name}
                  {m.role === "admin" && <Crown size={12} className="text-brand-400" />}
                  {m.user_id === user?.id && <span className="text-xs text-slate-500">(you)</span>}
                </p>
              </div>
            </div>
            {isAdmin && m.user_id !== user?.id && (
              <button
                onClick={() => handleRemove(m.user_id, m.full_name)}
                disabled={removing === m.user_id}
                className="text-slate-600 hover:text-red-400 transition-colors p-1"
              >
                {removing === m.user_id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add member */}
      {isAdmin && (
        <form onSubmit={handleAdd} className="border-t border-slate-800 pt-4">
          <label className="label">Add by email</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit" disabled={adding} className="btn-primary px-3 flex items-center gap-1.5">
              {adding ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
              Add
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-1.5">They must already have an account.</p>
        </form>
      )}
    </Overlay>
  );
}
