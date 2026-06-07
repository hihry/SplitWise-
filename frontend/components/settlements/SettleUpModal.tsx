"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { api, Member, BalancesResponse } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overlay } from "../groups/CreateGroupModal";
import { formatCurrency } from "@/lib/splits";
import { ArrowRight, Sparkles, Loader2 } from "lucide-react";

export default function SettleUpModal({
  groupId,
  members,
  balances,
  simplifyEnabled,
  onClose,
  onSettled,
  onToggleSimplify,
}: {
  groupId: string;
  members: Member[];
  balances: BalancesResponse | undefined;
  simplifyEnabled: boolean;
  onClose: () => void;
  onSettled: () => void;
  onToggleSimplify: (val: boolean) => void;
}) {
  const { user } = useAuth();
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [note, setNote]             = useState("");
  const [confirmItem, setConfirmItem] = useState<{ from: string; to: string; amount: number; from_name: string; to_name: string } | null>(null);
  const [toggling, setToggling]     = useState(false);

  const displayList = simplifyEnabled ? (balances?.simplified ?? []) : (balances?.raw ?? []);

  const handleToggle = async () => {
    setToggling(true);
    await onToggleSimplify(!simplifyEnabled);
    setToggling(false);
  };

  const handleSettle = async () => {
    if (!confirmItem) return;
    setSettlingId(`${confirmItem.from}-${confirmItem.to}`);
    try {
      await api.settlements.create(groupId, {
        paid_by: confirmItem.from,
        paid_to: confirmItem.to,
        amount: confirmItem.amount,
        note: note.trim() || undefined,
      });
      toast.success("Payment recorded");
      onSettled();
      setConfirmItem(null);
      setNote("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSettlingId(null);
    }
  };

  if (confirmItem) {
    return (
      <Overlay onClose={() => setConfirmItem(null)}>
        <h2 className="text-lg font-semibold text-white mb-2">Confirm Payment</h2>
        <p className="text-slate-500 text-sm mb-5">Record that this payment was made.</p>

        <div className="card p-4 mb-4 flex items-center justify-between">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-1">
              <span className="text-sm font-bold text-slate-300">{confirmItem.from_name[0]}</span>
            </div>
            <p className="text-xs text-slate-400">{confirmItem.from_name}</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-brand-400">{formatCurrency(confirmItem.amount)}</p>
            <ArrowRight size={16} className="text-slate-600 mx-auto mt-1" />
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-1">
              <span className="text-sm font-bold text-slate-300">{confirmItem.to_name[0]}</span>
            </div>
            <p className="text-xs text-slate-400">{confirmItem.to_name}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="label">Note (optional)</label>
          <input className="input" placeholder="e.g. Paid via UPI" value={note}
            onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="flex gap-2">
          <button onClick={() => setConfirmItem(null)} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSettle} disabled={!!settlingId} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {settlingId && <Loader2 size={15} className="animate-spin" />}
            Confirm Payment
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">Settle Up</h2>
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
            simplifyEnabled
              ? "bg-brand-500/10 text-brand-400 border-brand-500/30"
              : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600"
          }`}
        >
          {toggling ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {simplifyEnabled ? "Simplified" : "Simplify debts"}
        </button>
      </div>

      {simplifyEnabled && (
        <p className="text-xs text-slate-500 bg-slate-800 rounded-lg px-3 py-2 mb-4">
          Showing minimum transactions to settle all debts. This is a suggestion — confirm each payment to record it.
        </p>
      )}

      {displayList.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-3xl mb-2">🎉</div>
          <p className="text-slate-300 font-medium">All settled up!</p>
          <p className="text-slate-500 text-sm mt-1">No outstanding balances in this group.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayList.map((item, i) => (
            <div key={i} className="card px-4 py-3 flex items-center justify-between hover:border-slate-700 transition-colors">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-300 font-medium">{item.from_name}</span>
                <ArrowRight size={14} className="text-slate-600" />
                <span className="text-slate-300 font-medium">{item.to_name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-brand-400 font-semibold">{formatCurrency(item.amount)}</span>
                <button
                  onClick={() => setConfirmItem(item)}
                  className="text-xs bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Record
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Overlay>
  );
}
