"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { api, Comment } from "@/lib/api";
import { formatCurrency } from "@/lib/splits";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Send, Loader2, Trash2 } from "lucide-react";

export default function ExpenseDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const { user } = useAuth();
  const groupId  = params.id as string;
  const expenseId = params.expenseId as string;

  const [comments, setComments]     = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting]       = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: expense, isLoading } = useQuery({
    queryKey: ["expense", expenseId],
    queryFn: () => api.expenses.get(groupId, expenseId),
  });

  // Load initial comments
  const { data: initialComments } = useQuery({
    queryKey: ["comments", expenseId],
    queryFn: () => api.comments.list(expenseId),
  });

  useEffect(() => {
    if (initialComments) setComments(initialComments);
  }, [initialComments]);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`comments:${expenseId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "expense_comments",
          filter: `expense_id=eq.${expenseId}`,
        },
        (payload) => {
          setComments((prev) => {
            // Avoid duplicate if this client just posted it
            if (prev.find((c) => c.id === payload.new.id)) return prev;
            return [...prev, payload.new as Comment];
          });
        }
      )
      .subscribe();

    // Recovery: refetch on tab visibility restore
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        api.comments.list(expenseId).then(setComments).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [expenseId]);

  // Auto-scroll to latest comment
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      await api.comments.create(expenseId, commentText.trim());
      setCommentText("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    try {
      await api.expenses.delete(groupId, expenseId);
      toast.success("Expense deleted");
      router.push(`/groups/${groupId}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-500" size={28} />
      </div>
    );
  }

  if (!expense) return null;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back */}
      <Link href={`/groups/${groupId}`} className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm mb-6 transition-colors">
        <ArrowLeft size={16} />
        Back to group
      </Link>

      {/* Expense card */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">{expense.description}</h1>
            <p className="text-sm text-slate-500">
              Paid by <span className="text-slate-300">{expense.paid_by_name}</span>
              {" · "}{format(new Date(expense.date), "MMMM d, yyyy")}
              {" · "}<span className="capitalize">{expense.split_type} split</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-white">{formatCurrency(expense.amount)}</p>
            <button
              onClick={handleDelete}
              className="mt-2 text-xs text-slate-600 hover:text-red-400 flex items-center gap-1 ml-auto transition-colors"
            >
              <Trash2 size={12} />
              Delete
            </button>
          </div>
        </div>

        {/* Splits */}
        {expense.splits && expense.splits.length > 0 && (
          <div className="border-t border-slate-800 pt-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-3">Split breakdown</p>
            <div className="space-y-2">
              {expense.splits.map((split) => {
                const net = split.paid_share - split.amount_owed;
                return (
                  <div key={split.user_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <span className="text-xs text-slate-400 font-medium">
                          {split.full_name?.[0]?.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm text-slate-300">{split.full_name}</span>
                      {split.paid_share > 0 && (
                        <span className="text-xs text-slate-500">(paid {formatCurrency(split.paid_share)})</span>
                      )}
                    </div>
                    <span className={`text-sm font-semibold ${net > 0 ? "text-brand-400" : net < 0 ? "text-red-400" : "text-slate-500"}`}>
                      {net > 0 ? `gets back ${formatCurrency(net)}` : net < 0 ? `owes ${formatCurrency(Math.abs(net))}` : "settled"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-300">Comments</h2>
        </div>

        {/* Comment list */}
        <div className="px-5 py-4 space-y-4 max-h-80 overflow-y-auto">
          {comments.length === 0 && (
            <p className="text-slate-600 text-sm text-center py-4">No comments yet. Start the conversation.</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className={`flex gap-3 ${c.user_id === user?.id ? "flex-row-reverse" : ""}`}>
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-slate-400 font-medium">{c.full_name?.[0]?.toUpperCase()}</span>
              </div>
              <div className={`max-w-xs ${c.user_id === user?.id ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`px-3 py-2 rounded-xl text-sm ${
                  c.user_id === user?.id
                    ? "bg-brand-500/20 text-brand-100 rounded-tr-sm"
                    : "bg-slate-800 text-slate-200 rounded-tl-sm"
                }`}>
                  {c.body}
                </div>
                <p className="text-xs text-slate-600 mt-1 px-1">
                  {c.full_name} · {format(new Date(c.created_at), "h:mm a")}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={handlePostComment} className="px-4 py-3 border-t border-slate-800 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <button type="submit" disabled={posting || !commentText.trim()} className="btn-primary px-3">
            {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
