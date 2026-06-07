"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/splits";
import { format } from "date-fns";
import {
  Plus, Users, ArrowLeftRight, Settings, ChevronRight,
  Loader2, Trash2, Plane, Home, Briefcase, Grid3x3
} from "lucide-react";
import CreateExpenseModal from "@/components/expenses/CreateExpenseModal";
import SettleUpModal from "@/components/settlements/SettleUpModal";
import MembersPanel from "@/components/groups/MembersPanel";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  trip: <Plane size={16} />,
  home: <Home size={16} />,
  work: <Briefcase size={16} />,
  other: <Grid3x3 size={16} />,
};

export default function GroupPage() {
  const params = useParams();
  const groupId = params.id as string;

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettleModal, setShowSettleModal]   = useState(false);
  const [showMembers, setShowMembers]           = useState(false);
  const [activeTab, setActiveTab]               = useState<"expenses" | "settlements">("expenses");

  const { data: group, refetch: refetchGroup } = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => api.groups.get(groupId),
  });

  const { data: expenses, refetch: refetchExpenses } = useQuery({
    queryKey: ["expenses", groupId],
    queryFn: () => api.expenses.list(groupId),
  });

  const { data: balances, refetch: refetchBalances } = useQuery({
    queryKey: ["balances", groupId],
    queryFn: () => api.balances.get(groupId),
  });

  const { data: settlements } = useQuery({
    queryKey: ["settlements", groupId],
    queryFn: () => api.settlements.list(groupId),
  });

  const refetchAll = () => { refetchExpenses(); refetchBalances(); };

  if (!group) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-500" size={28} />
      </div>
    );
  }

  // Net summary for current user shown in header
  const rawBalances = balances?.raw ?? [];
  const totalOwed  = rawBalances.reduce((s, b) => s + b.amount, 0); // simplified display

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
            {CATEGORY_ICONS[group.category] || CATEGORY_ICONS.other}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{group.name}</h1>
            <p className="text-sm text-slate-500 capitalize">{group.category} · {group.members?.length ?? 0} members</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowMembers(true)} className="btn-ghost flex items-center gap-2 text-sm">
            <Users size={16} />
            Members
          </button>
          <button onClick={() => setShowSettleModal(true)} className="btn-primary flex items-center gap-2 text-sm">
            <ArrowLeftRight size={16} />
            Settle Up
          </button>
          <button onClick={() => setShowExpenseModal(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} />
            Add Expense
          </button>
        </div>
      </div>

      {/* Balance summary strip */}
      {rawBalances.length > 0 && (
        <div className="card p-4 mb-6">
          <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Outstanding Balances</p>
          <div className="flex flex-wrap gap-3">
            {rawBalances.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-slate-300">{b.from_name}</span>
                <ChevronRight size={14} className="text-slate-600" />
                <span className="text-slate-300">{b.to_name}</span>
                <span className="text-brand-400 font-semibold">{formatCurrency(b.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 w-fit mb-6">
        {(["expenses", "settlements"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${
              activeTab === tab
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Expenses list */}
      {activeTab === "expenses" && (
        <div className="space-y-2">
          {!expenses ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-500" size={24} /></div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-500 mb-3">No expenses yet</p>
              <button onClick={() => setShowExpenseModal(true)} className="btn-primary text-sm inline-flex items-center gap-2">
                <Plus size={14} />
                Add first expense
              </button>
            </div>
          ) : (
            expenses.map((expense) => (
              <Link key={expense.id} href={`/groups/${groupId}/expenses/${expense.id}`}>
                <div className="card px-5 py-4 flex items-center justify-between hover:border-slate-700 hover:bg-slate-800/40 transition-all cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                      <span className="text-xs text-slate-400 font-mono">
                        {expense.split_type[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-white text-sm">{expense.description}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Paid by <span className="text-slate-400">{expense.paid_by_name}</span>
                        {" · "}
                        {format(new Date(expense.date), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-white">{formatCurrency(expense.amount)}</p>
                    <p className="text-xs text-slate-500 capitalize">{expense.split_type} split</p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* Settlements list */}
      {activeTab === "settlements" && (
        <div className="space-y-2">
          {!settlements || settlements.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-500">No settlements recorded yet</p>
            </div>
          ) : (
            settlements.map((s) => (
              <div key={s.id} className="card px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">
                    <span className="text-brand-400">{s.paid_by_name}</span>
                    {" paid "}
                    <span className="text-slate-300">{s.paid_to_name}</span>
                  </p>
                  {s.note && <p className="text-xs text-slate-500 mt-0.5">{s.note}</p>}
                  <p className="text-xs text-slate-600 mt-0.5">{format(new Date(s.created_at), "MMM d, yyyy")}</p>
                </div>
                <span className="font-semibold text-brand-400">{formatCurrency(s.amount)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {showExpenseModal && (
        <CreateExpenseModal
          groupId={groupId}
          members={group.members ?? []}
          onClose={() => setShowExpenseModal(false)}
          onCreated={refetchAll}
        />
      )}
      {showSettleModal && (
        <SettleUpModal
          groupId={groupId}
          members={group.members ?? []}
          balances={balances}
          simplifyEnabled={group.simplify_debts}
          onClose={() => setShowSettleModal(false)}
          onSettled={refetchAll}
          onToggleSimplify={async (val) => {
            await api.groups.update(groupId, { simplify_debts: val });
            refetchGroup();
            refetchBalances();
          }}
        />
      )}
      {showMembers && (
        <MembersPanel
          groupId={groupId}
          members={group.members ?? []}
          onClose={() => setShowMembers(false)}
          onChanged={refetchGroup}
        />
      )}
    </div>
  );
}
