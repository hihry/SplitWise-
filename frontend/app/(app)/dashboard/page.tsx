"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, Group } from "@/lib/api";
import { formatCurrency } from "@/lib/splits";
import { Plus, Users, Plane, Home, Briefcase, Grid3x3, Loader2 } from "lucide-react";
import CreateGroupModal from "@/components/groups/CreateGroupModal";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  trip: <Plane size={18} />,
  home: <Home size={18} />,
  work: <Briefcase size={18} />,
  other: <Grid3x3 size={18} />,
};

export default function DashboardPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: groups, isLoading, refetch } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.groups.list(),
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Your Groups</h1>
          <p className="text-slate-500 text-sm mt-1">Track shared expenses across all your groups</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          New Group
        </button>
      </div>

      {/* Groups grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-brand-500" size={28} />
        </div>
      ) : groups?.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups?.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { refetch(); setShowCreate(false); }}
        />
      )}
    </div>
  );
}

function GroupCard({ group }: { group: Group }) {
  return (
    <Link href={`/groups/${group.id}`}>
      <div className="card p-5 hover:border-slate-700 hover:bg-slate-800/50 transition-all duration-150 cursor-pointer group">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-brand-400 group-hover:border-brand-500/30 transition-colors">
              {CATEGORY_ICONS[group.category] || CATEGORY_ICONS.other}
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm leading-tight">{group.name}</h3>
              <p className="text-xs text-slate-500 capitalize mt-0.5">{group.category}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Users size={13} />
            <span>{group.member_count ?? "—"} members</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
        <Users size={28} className="text-slate-600" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">No groups yet</h3>
      <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
        Create a group to start tracking shared expenses with friends, roommates, or colleagues.
      </p>
      <button onClick={onCreateClick} className="btn-primary inline-flex items-center gap-2">
        <Plus size={16} />
        Create your first group
      </button>
    </div>
  );
}
