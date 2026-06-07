"use client";

import { useState, useMemo } from "react";
import toast from "react-hot-toast";
import { api, Member, SplitInput } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overlay } from "../groups/CreateGroupModal";
import {
  computeEqualSplit, computeExactSplit,
  computePercentageSplit, computeSharesSplit,
  validateExactSplit, validatePercentageSplit,
  formatCurrency,
} from "@/lib/splits";
import { format } from "date-fns";
import { Loader2, AlertCircle } from "lucide-react";

type SplitTab = "equal" | "exact" | "percentage" | "shares";
const TABS: { id: SplitTab; label: string }[] = [
  { id: "equal",      label: "Equal" },
  { id: "exact",      label: "Exact" },
  { id: "percentage", label: "Percentage" },
  { id: "shares",     label: "Shares" },
];

export default function CreateExpenseModal({
  groupId,
  members,
  onClose,
  onCreated,
  editExpense,
}: {
  groupId: string;
  members: Member[];
  onClose: () => void;
  onCreated: () => void;
  editExpense?: any;
}) {
  const { user } = useAuth();

  const [description, setDescription] = useState(editExpense?.description ?? "");
  const [amount, setAmount]           = useState(editExpense?.amount?.toString() ?? "");
  const [paidBy, setPaidBy]           = useState(editExpense?.paid_by ?? user?.id ?? members[0]?.user_id);
  const [date, setDate]               = useState(editExpense?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [activeTab, setActiveTab]     = useState<SplitTab>("equal");
  const [loading, setLoading]         = useState(false);

  // Per-tab state
  const [exactAmounts, setExactAmounts]     = useState<Record<string, string>>({});
  const [percentages, setPercentages]       = useState<Record<string, string>>({});
  const [shares, setShares]                 = useState<Record<string, string>>(
    Object.fromEntries(members.map((m) => [m.user_id, "1"]))
  );

  const numAmount = parseFloat(amount) || 0;

  // ── Computed splits per tab ────────────────────────────────
  const computedSplits: SplitInput[] = useMemo(() => {
    if (!numAmount || members.length === 0) return [];
    const userIds = members.map((m) => m.user_id);

    switch (activeTab) {
      case "equal":
        return computeEqualSplit(numAmount, userIds, paidBy);
      case "exact": {
        const nums: Record<string, number> = {};
        userIds.forEach((uid) => { nums[uid] = parseFloat(exactAmounts[uid] || "0"); });
        return computeExactSplit(nums, paidBy, numAmount);
      }
      case "percentage": {
        const nums: Record<string, number> = {};
        userIds.forEach((uid) => { nums[uid] = parseFloat(percentages[uid] || "0"); });
        return computePercentageSplit(nums, paidBy, numAmount);
      }
      case "shares": {
        const nums: Record<string, number> = {};
        userIds.forEach((uid) => { nums[uid] = parseInt(shares[uid] || "1", 10); });
        return computeSharesSplit(nums, paidBy, numAmount);
      }
    }
  }, [activeTab, numAmount, paidBy, members, exactAmounts, percentages, shares]);

  // ── Validation ─────────────────────────────────────────────
  const validationError: string | null = useMemo(() => {
    if (!numAmount) return null;
    if (activeTab === "exact") {
      const nums: Record<string, number> = {};
      members.forEach((m) => { nums[m.user_id] = parseFloat(exactAmounts[m.user_id] || "0"); });
      if (!validateExactSplit(nums, numAmount)) {
        const sum = Object.values(nums).reduce((a, b) => a + b, 0);
        return `Sum (${formatCurrency(sum)}) must equal ${formatCurrency(numAmount)}`;
      }
    }
    if (activeTab === "percentage") {
      const nums: Record<string, number> = {};
      members.forEach((m) => { nums[m.user_id] = parseFloat(percentages[m.user_id] || "0"); });
      if (!validatePercentageSplit(nums)) {
        const sum = Object.values(nums).reduce((a, b) => a + b, 0);
        return `Percentages sum to ${sum.toFixed(1)}% — must equal 100%`;
      }
    }
    return null;
  }, [activeTab, numAmount, members, exactAmounts, percentages]);

  const canSubmit = !!description.trim() && numAmount > 0 && !validationError && computedSplits.length > 0;

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const payload = {
        description: description.trim(),
        amount: numAmount,
        paid_by: paidBy,
        split_type: activeTab,
        date,
        splits: computedSplits,
      };
      if (editExpense) {
        await api.expenses.update(groupId, editExpense.id, payload);
        toast.success("Expense updated");
      } else {
        await api.expenses.create(groupId, payload);
        toast.success("Expense added");
      }
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-semibold text-white mb-5">
        {editExpense ? "Edit Expense" : "Add Expense"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Description */}
        <div>
          <label className="label">Description</label>
          <input className="input" placeholder="Dinner, Taxi, Hotel…" value={description}
            onChange={(e) => setDescription(e.target.value)} required autoFocus />
        </div>

        {/* Amount + Date row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount (₹)</label>
            <input className="input" type="number" min="0.01" step="0.01" placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={date}
              onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        {/* Paid by */}
        <div>
          <label className="label">Paid by</label>
          <select className="input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.full_name}{m.user_id === user?.id ? " (you)" : ""}</option>
            ))}
          </select>
        </div>

        {/* Split tabs */}
        <div>
          <label className="label">Split type</label>
          <div className="flex gap-1 p-1 bg-slate-800 rounded-lg mb-3">
            {TABS.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab.id ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="space-y-2">
            {activeTab === "equal" && (
              <EqualPreview members={members} splits={computedSplits} />
            )}
            {activeTab === "exact" && (
              <ExactInputs members={members} values={exactAmounts} total={numAmount}
                onChange={(uid, val) => setExactAmounts((p) => ({ ...p, [uid]: val }))} />
            )}
            {activeTab === "percentage" && (
              <PercentageInputs members={members} values={percentages}
                onChange={(uid, val) => setPercentages((p) => ({ ...p, [uid]: val }))} />
            )}
            {activeTab === "shares" && (
              <SharesInputs members={members} values={shares} amount={numAmount}
                onChange={(uid, val) => setShares((p) => ({ ...p, [uid]: val }))} />
            )}
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="flex items-center gap-2 mt-2 text-red-400 text-xs">
              <AlertCircle size={13} />
              {validationError}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading || !canSubmit} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading && <Loader2 size={15} className="animate-spin" />}
            {editExpense ? "Save Changes" : "Add Expense"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function EqualPreview({ members, splits }: { members: Member[]; splits: SplitInput[] }) {
  const splitMap = Object.fromEntries(splits.map((s) => [s.user_id, s.amount_owed]));
  return (
    <div className="space-y-1.5">
      {members.map((m) => (
        <div key={m.user_id} className="flex items-center justify-between px-3 py-2 bg-slate-800 rounded-lg">
          <span className="text-sm text-slate-300">{m.full_name}</span>
          <span className="text-sm font-medium text-brand-400">
            {splitMap[m.user_id] ? formatCurrency(splitMap[m.user_id]) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function ExactInputs({ members, values, total, onChange }: {
  members: Member[]; values: Record<string, string>; total: number;
  onChange: (uid: string, val: string) => void;
}) {
  const sum = members.reduce((s, m) => s + parseFloat(values[m.user_id] || "0"), 0);
  const remaining = total - sum;
  return (
    <div className="space-y-1.5">
      {members.map((m) => (
        <div key={m.user_id} className="flex items-center gap-2">
          <span className="text-sm text-slate-400 w-24 truncate">{m.full_name}</span>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
            <input className="input pl-7" type="number" min="0" step="0.01" placeholder="0.00"
              value={values[m.user_id] || ""} onChange={(e) => onChange(m.user_id, e.target.value)} />
          </div>
        </div>
      ))}
      <p className={`text-xs text-right pr-1 ${Math.abs(remaining) < 0.01 ? "text-brand-400" : "text-slate-500"}`}>
        {Math.abs(remaining) < 0.01 ? "✓ Balanced" : `${remaining > 0 ? "Remaining" : "Over by"}: ${formatCurrency(Math.abs(remaining))}`}
      </p>
    </div>
  );
}

function PercentageInputs({ members, values, onChange }: {
  members: Member[]; values: Record<string, string>;
  onChange: (uid: string, val: string) => void;
}) {
  const sum = members.reduce((s, m) => s + parseFloat(values[m.user_id] || "0"), 0);
  return (
    <div className="space-y-1.5">
      {members.map((m) => (
        <div key={m.user_id} className="flex items-center gap-2">
          <span className="text-sm text-slate-400 w-24 truncate">{m.full_name}</span>
          <div className="relative flex-1">
            <input className="input pr-7" type="number" min="0" max="100" step="0.1" placeholder="0"
              value={values[m.user_id] || ""} onChange={(e) => onChange(m.user_id, e.target.value)} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
          </div>
        </div>
      ))}
      <p className={`text-xs text-right pr-1 ${Math.abs(sum - 100) < 0.01 ? "text-brand-400" : "text-slate-500"}`}>
        Total: {sum.toFixed(1)}% {Math.abs(sum - 100) < 0.01 ? "✓" : `(need ${(100 - sum).toFixed(1)}% more)`}
      </p>
    </div>
  );
}

function SharesInputs({ members, values, amount, onChange }: {
  members: Member[]; values: Record<string, string>; amount: number;
  onChange: (uid: string, val: string) => void;
}) {
  const totalShares = members.reduce((s, m) => s + parseInt(values[m.user_id] || "1", 10), 0);
  return (
    <div className="space-y-1.5">
      {members.map((m) => {
        const memberShares = parseInt(values[m.user_id] || "1", 10);
        const memberAmount = totalShares > 0 ? (memberShares / totalShares) * amount : 0;
        return (
          <div key={m.user_id} className="flex items-center gap-2">
            <span className="text-sm text-slate-400 w-24 truncate">{m.full_name}</span>
            <input className="input w-20" type="number" min="1" step="1" placeholder="1"
              value={values[m.user_id] || ""} onChange={(e) => onChange(m.user_id, e.target.value)} />
            <span className="text-sm text-brand-400 ml-auto">{amount > 0 ? formatCurrency(memberAmount) : "—"}</span>
          </div>
        );
      })}
      <p className="text-xs text-slate-600 text-right pr-1">Total shares: {totalShares}</p>
    </div>
  );
}
