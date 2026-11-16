import type { Goal, Milestone, Settings, Snapshot } from "../types";
import { estimateIncome } from "./income";

export function money(cents: number, currency = "USD", compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 0 : 2,
  }).format(cents / 100);
}
export function parseMoney(value: string) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 9_000_000_000_000)
    throw new Error("That amount is too large.");
  return result;
}
export function today(
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function day(date: string) {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}
export function addDays(date: string, count: number) {
  return new Date((day(date) + count) * 86_400_000).toISOString().slice(0, 10);
}
export function dateLabel(date: string, short = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: short ? "short" : "long",
    day: "numeric",
    ...(short ? {} : { year: "numeric" }),
  });
}
export function accountBalance(data: Snapshot, accountId: string, on?: string) {
  const valid = new Set(
    data.transactions
      .filter((t) => !on || t.effective_date <= on)
      .map((t) => t.id),
  );
  return data.entries
    .filter((e) => e.account_id === accountId && valid.has(e.transaction_id))
    .reduce((sum, e) => sum + e.amount, 0);
}
export function goalBalance(data: Snapshot, goalId: string) {
  const account = data.accounts.find((a) => a.goal_id === goalId);
  return account ? accountBalance(data, account.id) : 0;
}
export function bankBalance(data: Snapshot) {
  const account = data.accounts.find((a) => a.kind === "bank");
  return account ? accountBalance(data, account.id) : 0;
}
export function plan(m: Milestone, balance: number, on: string) {
  const duration = Math.max(1, day(m.due_date) - day(m.baseline_date));
  const elapsed = Math.min(
    1,
    Math.max(0, (day(on) - day(m.baseline_date)) / duration),
  );
  const expected = Math.round(
    m.baseline_balance + Math.max(0, m.target - m.baseline_balance) * elapsed,
  );
  const remaining = Math.max(0, m.target - balance);
  const daysLeft = day(m.due_date) - day(on);
  const scheduled = on < m.baseline_date;
  const difference = balance - expected;
  const funded = remaining === 0;
  const status = scheduled
    ? "Scheduled"
    : funded
      ? "Funded"
      : daysLeft <= 0
        ? "Overdue"
        : difference < -1
          ? "Behind"
          : difference > 1
            ? "Ahead"
            : "On track";
  return {
    expected,
    difference,
    remaining,
    daysLeft,
    funded,
    status,
    progress: Math.min(100, Math.max(0, (balance / m.target) * 100)),
    weekly:
      !scheduled && remaining && daysLeft > 0
        ? Math.ceil((remaining / daysLeft) * Math.min(7, daysLeft))
        : 0,
    originalWeekly: Math.ceil(
      (Math.max(0, m.target - m.baseline_balance) / duration) *
        Math.min(7, duration),
    ),
  };
}
export function installments(
  amount: number,
  start: string,
  end: string,
  cadence: "week" | "month",
) {
  const total = day(end) - day(start);
  if (total <= 0 || amount <= 0) return [];
  let cursor = start,
    assigned = 0;
  const result: { date: string; amount: number }[] = [];
  while (cursor < end) {
    const next =
      cadence === "week"
        ? addDays(cursor, 7)
        : new Date(
            Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 1),
          )
            .toISOString()
            .slice(0, 10);
    const boundary = next > end ? end : next;
    const cumulative = Math.round(
      (amount * (day(boundary) - day(start))) / total,
    );
    result.push({ date: boundary, amount: cumulative - assigned });
    assigned = cumulative;
    cursor = boundary;
  }
  return result;
}
// Cumulative targets share one balance. Test demand at each deadline and
// future release date, so a future-start goal cannot borrow earlier capacity.
export function requiredWeekly(
  goals: Goal[],
  milestones: Milestone[],
  balances: Record<string, number>,
  on: string,
) {
  const active = goals.filter((g) => g.status === "active");
  const relevant = milestones.filter((m) =>
    active.some((g) => g.id === m.goal_id),
  );
  let peak = 0,
    overdue = 0;
  const starts = new Set([
    on,
    ...active.filter((g) => g.start_date > on).map((g) => g.start_date),
  ]);
  for (const start of starts)
    for (const deadline of new Set(relevant.map((m) => m.due_date))) {
      let required = 0;
      for (const goal of active) {
        const release = goal.start_date > on ? goal.start_date : on;
        if (release < start) continue;
        const target = Math.max(
          0,
          ...relevant
            .filter((m) => m.goal_id === goal.id && m.due_date <= deadline)
            .map((m) => m.target),
        );
        required += Math.max(0, target - (balances[goal.id] || 0));
      }
      const days = day(deadline) - day(start);
      if (start === on && days <= 0) overdue = Math.max(overdue, required);
      else if (days > 0) peak = Math.max(peak, (required / days) * 7);
    }
  return { weekly: Math.ceil(peak), overdue };
}
export function capacity(settings: Settings) {
  if (settings.weekly_budget !== null)
    return { amount: settings.weekly_budget, label: "weekly savings budget" };
  const income = estimateIncome(settings);
  if (income.ready)
    return { amount: income.weekly, label: "estimated weekly take-home pay" };
  return null;
}

export function nextMonth(date: string) {
  const [year, month, dateDay] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(dateDay, lastDay)))
    .toISOString()
    .slice(0, 10);
}
export function primarySavings(data: Snapshot, on: string) {
  let weekly = 0,
    monthly = 0,
    overdue = 0,
    scheduled = 0;
  const rows: { goal: Goal; weekly: number; monthly: number }[] = [];
  for (const goal of data.goals.filter((g) => g.status === "active")) {
    if (goal.start_date > on) {
      scheduled++;
      continue;
    }
    const m = data.milestones.find(
      (m) => m.goal_id === goal.id && m.is_primary,
    );
    if (!m) continue;
    const p = plan(m, goalBalance(data, goal.id), on);
    if (p.funded) continue;
    const week =
      p.daysLeft <= 0
        ? p.remaining
        : Math.min(p.remaining, Math.ceil((p.remaining / p.daysLeft) * 7));
    const month =
      p.daysLeft <= 0
        ? p.remaining
        : Math.min(
            p.remaining,
            Math.ceil(((p.remaining / p.daysLeft) * 7 * 52) / 12),
          );
    weekly += week;
    monthly += month;
    if (p.daysLeft <= 0) overdue += p.remaining;
    rows.push({ goal, weekly: week, monthly: month });
  }
  return { weekly, monthly, overdue, scheduled, rows };
}
export function expectedSavings(data: Snapshot, on: string, secondary = false) {
  return data.goals
    .filter((g) => g.status === "active" && g.start_date <= on)
    .reduce((sum, g) => {
      const expected = data.milestones
        .filter((m) => m.goal_id === g.id && (secondary || m.is_primary))
        .map((m) => (on < m.baseline_date ? 0 : plan(m, 0, on).expected));
      return sum + Math.max(0, ...expected);
    }, 0);
}
export function purchasePaid(data: Snapshot, id: string) {
  const transactions = new Set(
    data.transactions.filter((t) => t.purchase_id === id).map((t) => t.id),
  );
  return Math.max(
    0,
    -data.entries
      .filter((e) => transactions.has(e.transaction_id))
      .reduce((sum, e) => sum + e.amount, 0),
  );
}
export function purchaseBalance(data: Snapshot, id: string) {
  const p = data.purchases?.find((p) => p.id === id);
  return !p || p.status === "cancelled"
    ? 0
    : Math.max(0, p.amount - purchasePaid(data, id));
}
export function purchaseCommitments(
  data: Snapshot,
  on: string,
  cadence: "week" | "month",
) {
  const end = cadence === "week" ? addDays(on, 7) : nextMonth(on);
  const purchases = (data.purchases || []).filter(
    (p) =>
      p.status === "active" &&
      p.due_date <= end &&
      purchaseBalance(data, p.id) > 0,
  );
  return {
    end,
    amount: purchases.reduce((sum, p) => sum + purchaseBalance(data, p.id), 0),
    overdue: purchases
      .filter((p) => p.due_date < on)
      .reduce((sum, p) => sum + purchaseBalance(data, p.id), 0),
    purchases,
  };
}
