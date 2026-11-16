import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bankReserves,
  creditDueDate,
  recurrenceDate,
  upcomingSubscriptions,
  incomeCommitments,
} from "../src/lib/recurring";
import { makeDemo } from "../src/lib/demo";
import { today } from "../src/lib/savings";
test("credit due dates always use the following month and clamp days 29–31", () => {
  assert.equal(creditDueDate("2026-01-10", 31), "2026-02-28");
  assert.equal(creditDueDate("2027-12-30", 15), "2028-01-15");
  assert.equal(creditDueDate("2028-01-31", 31), "2028-02-29");
  assert.equal(creditDueDate("2026-11-01", 15), "2026-12-15");
});

test("income reserves weekly, monthly and yearly charges even when credit is due next month", () => {
  const d = makeDemo(),
    on = "2026-11-16";
  d.purchases = [];
  d.transactions = [];
  d.entries = [];
  d.subscriptions = (
    [
      ["monthly", "month", 2000, "2026-11-20"],
      ["weekly", "week", 500, "2026-11-20"],
      ["annual", "year", 12000, "2026-12-01"],
      ["boundary", "month", 9000, "2026-12-16"],
    ] as const
  ).map(([id, cadence, amount, date]) => ({
    id,
    user_id: "demo",
    name: id,
    card: "Visa",
    amount,
    cadence,
    anchor_date: date,
    next_charge_date: date,
    occurrence: 0,
    status: "active",
    created_at: on,
  }));
  // Four weekly charges, one monthly renewal, and the yearly renewal.
  assert.equal(incomeCommitments(d, on, "month").amount, 16000);
  assert.equal(incomeCommitments(d, on, "week").amount, 2500);
  d.subscriptions[0].status = "paused";
  assert.equal(incomeCommitments(d, on, "month").amount, 14000);
});

test("issuing a subscription charge preserves its reservation without double-counting due credit", () => {
  const d = makeDemo(),
    on = "2026-11-16";
  d.purchases = [];
  d.transactions = [];
  d.entries = [];
  d.subscriptions = [
    {
      id: "sub",
      user_id: "demo",
      name: "Membership",
      card: "Visa",
      amount: 2000,
      cadence: "month",
      anchor_date: on,
      next_charge_date: on,
      occurrence: 0,
      status: "active",
      created_at: on,
    },
  ];
  assert.equal(incomeCommitments(d, on, "month").amount, 2000);
  d.purchases = [
    {
      id: "charge",
      user_id: "demo",
      name: "Membership",
      card: "Visa",
      amount: 2000,
      purchased_on: on,
      due_date: "2026-12-20",
      notes: "",
      status: "active",
      created_at: on,
      subscription_id: "sub",
      subscription_charge_date: on,
    },
  ];
  d.subscriptions[0].next_charge_date = "2026-12-16";
  d.subscriptions[0].occurrence = 1;
  assert.equal(incomeCommitments(d, on, "month").amount, 2000);
  d.purchases[0].due_date = "2026-12-15";
  const result = incomeCommitments(d, on, "month");
  assert.equal(result.credit, 2000);
  assert.equal(result.subscriptions, 0);
  assert.equal(result.amount, 2000);
  d.purchases[0].status = "cancelled";
  assert.equal(incomeCommitments(d, on, "month").amount, 0);
});
test("weekly, monthly and yearly renewals retain the original calendar anchor", () => {
  assert.equal(recurrenceDate("2026-12-28", "week", 1), "2027-01-04");
  assert.equal(recurrenceDate("2026-01-31", "month", 1), "2026-02-28");
  assert.equal(recurrenceDate("2026-01-31", "month", 2), "2026-03-31");
  assert.equal(recurrenceDate("2024-02-29", "year", 1), "2025-02-28");
  assert.equal(recurrenceDate("2024-02-29", "year", 4), "2028-02-29");
});
test("Bank reserves count unpaid credit and future renewals once, then reconcile partial payments", () => {
  const d = makeDemo(),
    on = today(d.settings.timezone);
  d.subscriptions = [
    {
      id: "sub",
      user_id: "demo",
      name: "Weekly membership",
      card: "Visa",
      amount: 1000,
      cadence: "week",
      anchor_date: on,
      next_charge_date: on,
      occurrence: 0,
      status: "active",
      created_at: on,
    },
  ];
  d.purchases = [
    {
      id: "bill",
      user_id: "demo",
      name: "Membership",
      card: "Visa",
      amount: 1000,
      purchased_on: on,
      due_date: creditDueDate(on, 15),
      notes: "",
      status: "active",
      created_at: on,
      subscription_id: "sub",
      subscription_charge_date: on,
    },
    {
      id: "ordinary",
      user_id: "demo",
      name: "Credit",
      card: "Visa",
      amount: 5000,
      purchased_on: on,
      due_date: "2027-12-15",
      notes: "",
      status: "active",
      created_at: on,
    },
  ];
  const r = bankReserves(d, on),
    n = upcomingSubscriptions(d, on).length;
  assert.equal(r.credit, 6000);
  assert.equal(r.subscriptionCredit, 1000);
  assert.equal(r.upcoming, n * 1000);
  assert.equal(r.available, r.bank - 5000 - 1000 - n * 1000);
  d.transactions.push({
    id: "pay",
    user_id: "demo",
    kind: "spend",
    effective_date: on,
    created_at: on,
    note: "Payment",
    reversal_of: null,
    purchase_id: "bill",
  });
  d.entries.push({
    id: "pay",
    user_id: "demo",
    transaction_id: "pay",
    account_id: "bank",
    amount: -400,
  });
  assert.equal(bankReserves(d, on).available, r.available);
  d.subscriptions[0].status = "paused";
  assert.equal(upcomingSubscriptions(d, on).length, 0);
  assert.equal(bankReserves(d, on).subscriptionCredit, 600);
});
