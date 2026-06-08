import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  console.log("MY MYSTERY TOKEN:", token);

  // if (typeof window !== "undefined") {
  //     alert("MY TOKEN IS: " + token);
  // }
  // throw new Error("STOP EVERYTHING. THE TOKEN IS: " + token);
  if (!token) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API error");
  }
  if (res.status === 204) return null as T;
  return res.json();
}

// ── Groups ────────────────────────────────────────────────────
export const api = {
  groups: {
    list: () => apiFetch<Group[]>("/groups"),
    create: (data: { name: string; category: string }) =>
      apiFetch<Group>("/groups", { method: "POST", body: JSON.stringify(data) }),
    get: (id: string) => apiFetch<Group>(`/groups/${id}`),
    update: (id: string, data: Partial<Group>) =>
      apiFetch<Group>(`/groups/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    addMember: (groupId: string, email: string) =>
      apiFetch(`/groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    removeMember: (groupId: string, userId: string) =>
      apiFetch(`/groups/${groupId}/members/${userId}`, { method: "DELETE" }),
  },

  expenses: {
    list: (groupId: string, limit = 50, offset = 0) =>
      apiFetch<Expense[]>(`/groups/${groupId}/expenses?limit=${limit}&offset=${offset}`),
    create: (groupId: string, data: CreateExpensePayload) =>
      apiFetch<Expense>(`/groups/${groupId}/expenses`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    get: (groupId: string, expenseId: string) =>
      apiFetch<Expense>(`/groups/${groupId}/expenses/${expenseId}`),
    update: (groupId: string, expenseId: string, data: Partial<CreateExpensePayload>) =>
      apiFetch<Expense>(`/groups/${groupId}/expenses/${expenseId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (groupId: string, expenseId: string) =>
      apiFetch(`/groups/${groupId}/expenses/${expenseId}`, { method: "DELETE" }),
  },

  balances: {
    get: (groupId: string) => apiFetch<BalancesResponse>(`/groups/${groupId}/balances`),
  },

  settlements: {
    create: (groupId: string, data: { paid_by: string; paid_to: string; amount: number; note?: string }) =>
      apiFetch(`/groups/${groupId}/settlements`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    list: (groupId: string) => apiFetch<Settlement[]>(`/groups/${groupId}/settlements`),
  },

  comments: {
    list: (expenseId: string) => apiFetch<Comment[]>(`/expenses/${expenseId}/comments`),
    create: (expenseId: string, body: string) =>
      apiFetch(`/expenses/${expenseId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
  },
};

// ── Types ─────────────────────────────────────────────────────
export interface Group {
  id: string;
  name: string;
  category: string;
  created_by: string;
  simplify_debts: boolean;
  is_archived: boolean;
  created_at: string;
  members: Member[];
  member_count?: number;
}

export interface Member {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  joined_at: string;
}

export interface Split {
  user_id: string;
  full_name: string;
  paid_share: number;
  amount_owed: number;
}

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  paid_by: string;
  paid_by_name: string;
  split_type: string;
  date: string;
  created_by: string;
  created_at: string;
  splits?: Split[];
}

export interface SplitInput {
  user_id: string;
  paid_share: number;
  amount_owed: number;
}

export interface CreateExpensePayload {
  description: string;
  amount: number;
  paid_by: string;
  split_type: string;
  date: string;
  splits: SplitInput[];
}

export interface BalanceItem {
  from: string;
  to: string;
  amount: number;
  from_name: string;
  to_name: string;
}

export interface BalancesResponse {
  raw: BalanceItem[];
  simplified: BalanceItem[];
  simplify_enabled: boolean;
}

export interface Settlement {
  id: string;
  group_id: string;
  paid_by: string;
  paid_to: string;
  paid_by_name: string;
  paid_to_name: string;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  expense_id: string;
  user_id: string;
  body: string;
  created_at: string;
  full_name: string;
  avatar_url: string | null;
}
