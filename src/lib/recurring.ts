import type { Snapshot, Subscription } from "../types";
import { addDays, bankBalance, nextMonth, purchaseBalance } from "./savings";

export function creditDueDate(purchased: string, dueDay: number) {
  const [y, m] = purchased.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(dueDay, last)))
    .toISOString()
    .slice(0, 10);
}
export function recurrenceDate(
  anchor: string,
  cadence: Subscription["cadence"],
  index: number,
) {
  if (cadence === "week") return addDays(anchor, index * 7);
  const [y, m, d] = anchor.split("-").map(Number),
    month = m - 1 + index * (cadence === "year" ? 12 : 1);
  const last = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, month, Math.min(d, last)))
    .toISOString()
    .slice(0, 10);
}
export function upcomingSubscriptions(
  data: Snapshot,
  on: string,
  end = nextMonth(on),
) {
  const rows: { subscription: Subscription; date: string; amount: number }[] =
    [];
  const issued = new Set(
    (data.purchases || [])
      .filter((p) => p.subscription_id)
      .map((p) => `${p.subscription_id}:${p.subscription_charge_date}`),
  );
  for (const sub of data.subscriptions || []) {
    if (sub.status !== "active") continue;
    let index = sub.occurrence,
      date = sub.next_charge_date;
    while (date <= end) {
      if (!issued.has(`${sub.id}:${date}`))
        rows.push({ subscription: sub, date, amount: sub.amount });
      index++;
      date = recurrenceDate(sub.anchor_date, sub.cadence, index);
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
export function bankReserves(data: Snapshot, on: string) {
  let credit = 0,
    subscriptionCredit = 0;
  for (const p of data.purchases || []) {
    if (p.subscription_id) subscriptionCredit += purchaseBalance(data, p.id);
    else credit += purchaseBalance(data, p.id);
  }
  const end = nextMonth(on),
    upcoming = upcomingSubscriptions(data, on, end).reduce(
      (sum, r) => sum + r.amount,
      0,
    );
  const bank = bankBalance(data),
    subscriptions = subscriptionCredit + upcoming;
  return {
    bank,
    credit,
    subscriptionCredit,
    upcoming,
    subscriptions,
    end,
    afterCredit: bank - credit,
    available: bank - credit - subscriptions,
  };
}
