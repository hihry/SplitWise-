import { SplitInput } from "./api";

/**
 * Equal split with explicit penny rounding.
 * Last person (sorted by user_id asc) absorbs the remainder.
 * Example: ₹100 ÷ 3 → [33.33, 33.33, 33.34]
 */
export function computeEqualSplit(
  amount: number,
  userIds: string[],
  payerId: string
): SplitInput[] {
  const sorted = [...userIds].sort(); // deterministic order
  const n = sorted.length;
  const base = Math.floor((amount / n) * 100) / 100;
  const remainder = Math.round((amount - base * n) * 100) / 100;

  return sorted.map((userId, i) => {
    const amountOwed = i === n - 1 ? base + remainder : base;
    return {
      user_id: userId,
      paid_share: userId === payerId ? amount : 0,
      amount_owed: amountOwed,
    };
  });
}

/**
 * Exact split — user specifies exact amount per person.
 * Frontend validates sum === total before allowing submit.
 */
export function computeExactSplit(
  exactAmounts: Record<string, number>,
  payerId: string,
  totalPaid: number
): SplitInput[] {
  return Object.entries(exactAmounts).map(([userId, amountOwed]) => ({
    user_id: userId,
    paid_share: userId === payerId ? totalPaid : 0,
    amount_owed: amountOwed,
  }));
}

/**
 * Percentage split — each person assigned a percentage.
 * Computed as (percentage / 100) * amount, penny rounding on last person.
 */
export function computePercentageSplit(
  percentages: Record<string, number>,
  payerId: string,
  amount: number
): SplitInput[] {
  const userIds = Object.keys(percentages).sort();
  const rawAmounts = userIds.map((uid) =>
    Math.floor((percentages[uid] / 100) * amount * 100) / 100
  );
  const distributed = rawAmounts.reduce((a, b) => a + b, 0);
  const remainder = Math.round((amount - distributed) * 100) / 100;

  return userIds.map((userId, i) => ({
    user_id: userId,
    paid_share: userId === payerId ? amount : 0,
    amount_owed: i === userIds.length - 1 ? rawAmounts[i] + remainder : rawAmounts[i],
  }));
}

/**
 * Shares split — each person assigned integer shares.
 * Formula: (shares / total_shares) * amount
 * Penny rounding on last person (sorted by user_id asc).
 */
export function computeSharesSplit(
  shares: Record<string, number>,
  payerId: string,
  amount: number
): SplitInput[] {
  const userIds = Object.keys(shares).sort();
  const totalShares = userIds.reduce((sum, uid) => sum + shares[uid], 0);

  const rawAmounts = userIds.map((uid) =>
    Math.floor((shares[uid] / totalShares) * amount * 100) / 100
  );
  const distributed = rawAmounts.reduce((a, b) => a + b, 0);
  const remainder = Math.round((amount - distributed) * 100) / 100;

  return userIds.map((userId, i) => ({
    user_id: userId,
    paid_share: userId === payerId ? amount : 0,
    amount_owed: i === userIds.length - 1 ? rawAmounts[i] + remainder : rawAmounts[i],
  }));
}

/** Validate exact split: sum must equal total within ₹0.01 */
export function validateExactSplit(amounts: Record<string, number>, total: number): boolean {
  const sum = Object.values(amounts).reduce((a, b) => a + b, 0);
  return Math.abs(sum - total) <= 0.01;
}

/** Validate percentage split: sum must equal 100 within 0.01 */
export function validatePercentageSplit(percentages: Record<string, number>): boolean {
  const sum = Object.values(percentages).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 100) <= 0.01;
}

/** Format currency in Indian Rupees */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}
