import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateIncome,
  federalIncomeTax,
  INCOME_DEFAULTS,
} from "../src/lib/income";
import {
  addDays,
  goalBalance,
  primarySavings,
  expectedSavings,
  purchaseCommitments,
  purchaseBalance,
  nextMonth,
  requiredWeekly,
} from "../src/lib/savings";
import { makeDemo } from "../src/lib/demo";
import type { Settings } from "../src/types";
const settings: Settings = {
  user_id: "u",
  display_name: "",
  currency: "USD",
  timezone: "America/New_York",
  hourly_rate: 2500,
  rate_type: "gross",
  weekly_hours: 40,
  weekly_budget: null,
  income_settings: { ...INCOME_DEFAULTS },
};
test("Georgia single 2026 wage estimate matches a hand-calculated $52,000 case", () => {
  const e = estimateIncome(settings);
  assert.equal(e.gross, 5200000);
  assert.equal(e.federal, 406000);
  assert.equal(e.georgia, 184630);
  assert.equal(e.socialSecurity, 322400);
  assert.equal(e.medicare, 75400);
  assert.equal(e.annual, 4211570);
  assert.equal(e.monthly, 350964);
  assert.equal(e.weekly, 80992);
});
test("federal brackets are progressive and apply each filing status", () => {
  assert.equal(federalIncomeTax(1240000, "single"), 124000);
  assert.equal(federalIncomeTax(5040000, "single"), 580000);
  assert.equal(federalIncomeTax(2480000, "married_joint"), 248000);
  assert.equal(federalIncomeTax(1770000, "head_household"), 177000);
  assert.equal(federalIncomeTax(0, "single"), 0);
});
test("traditional retirement reduces income taxes but not FICA; Section125 benefits reduce both", () => {
  const base = estimateIncome(settings);
  const retirement = estimateIncome({
    ...settings,
    income_settings: { ...INCOME_DEFAULTS, retirement_weekly: 10000 },
  });
  const benefits = estimateIncome({
    ...settings,
    income_settings: { ...INCOME_DEFAULTS, benefits_weekly: 10000 },
  });
  assert.ok(retirement.federal < base.federal);
  assert.equal(retirement.socialSecurity, base.socialSecurity);
  assert.equal(retirement.medicare, base.medicare);
  assert.ok(benefits.socialSecurity < base.socialSecurity);
  assert.ok(benefits.medicare < base.medicare);
  assert.equal(
    base.gross! - retirement.annual,
    retirement.federal +
      retirement.georgia +
      retirement.socialSecurity +
      retirement.medicare +
      retirement.retirement,
  );
});
test("Social Security caps, additional Medicare applies, and take-home inputs are not taxed twice", () => {
  const high = estimateIncome({ ...settings, hourly_rate: 20000 });
  assert.equal(high.socialSecurity, 1143900);
  assert.ok(high.medicare > high.gross! * 0.0145);
  const takeHome = estimateIncome({ ...settings, rate_type: "take_home" });
  assert.equal(takeHome.annual, 5200000);
  assert.equal(takeHome.federal, 0);
  const actual = estimateIncome({
    ...settings,
    weekly_hours: null,
    income_settings: {
      ...INCOME_DEFAULTS,
      mode: "actual",
      actual_net_monthly: 300000,
    },
  });
  assert.equal(actual.monthly, 300000);
  assert.equal(actual.annual, 3600000);
  assert.equal(actual.ready, true);
  assert.equal(
    estimateIncome({ ...settings, weekly_hours: null }).ready,
    false,
  );
});
test("main schedules sum independent overlapping goals and exclude scheduled goals and stretch targets", () => {
  const d = makeDemo(),
    on = d.goals[0].start_date;
  d.goals = d.goals.slice(0, 2).map((g) => ({ ...g, start_date: on }));
  d.milestones = d.goals.flatMap((g, i) => [
    {
      id: g.id,
      user_id: "u",
      goal_id: g.id,
      name: "Main",
      target: (i + 1) * 10000,
      due_date: addDays(on, 10),
      is_primary: true,
      baseline_date: on,
      baseline_balance: 0,
    },
    {
      id: g.id + "s",
      user_id: "u",
      goal_id: g.id,
      name: "Stretch",
      target: 9000000,
      due_date: addDays(on, 20),
      is_primary: false,
      baseline_date: on,
      baseline_balance: 0,
    },
  ]);
  d.entries = [];
  const p = primarySavings(d, on);
  assert.equal(p.weekly, 21000);
  assert.equal(p.monthly, 30000);
  d.goals[1].start_date = addDays(on, 5);
  assert.equal(primarySavings(d, on).weekly, 7000);
  assert.equal(primarySavings(d, on).scheduled, 1);
  assert.equal(expectedSavings(d, addDays(on, -1)), 0);
  assert.ok(
    expectedSavings(d, addDays(on, 6), true) >
      expectedSavings(d, addDays(on, 6)),
  );
  const future = { ...d.goals[0], start_date: addDays(on, 9) };
  assert.equal(
    requiredWeekly(
      [future],
      d.milestones.filter((m) => m.is_primary && m.goal_id === future.id),
      {},
      on,
    ).weekly,
    70000,
  );
});
test("purchase commitments include overdue bills, partial payments and reversals without double counting", () => {
  const d = makeDemo(),
    on = "2026-11-16",
    uid = d.settings.user_id;
  d.purchases = [
    {
      id: "p",
      user_id: uid,
      name: "Laptop",
      card: "Visa",
      amount: 100000,
      purchased_on: "2026-11-01",
      due_date: "2026-11-10",
      notes: "",
      status: "active",
      created_at: on,
    },
  ];
  assert.equal(purchaseCommitments(d, on, "week").amount, 100000);
  d.transactions.push({
    id: "pay",
    user_id: uid,
    kind: "spend",
    purchase_id: "p",
    effective_date: on,
    created_at: on,
    note: "Payment",
    reversal_of: null,
  });
  d.entries.push({
    id: "paid",
    user_id: uid,
    transaction_id: "pay",
    account_id: "bank",
    amount: -25000,
  });
  assert.equal(purchaseBalance(d, "p"), 75000);
  assert.equal(purchaseCommitments(d, on, "month").overdue, 75000);
  d.transactions.push({
    id: "reverse",
    user_id: uid,
    kind: "reversal",
    purchase_id: "p",
    effective_date: on,
    created_at: on,
    note: "Reversal",
    reversal_of: "pay",
  });
  d.entries.push({
    id: "r",
    user_id: uid,
    transaction_id: "reverse",
    account_id: "bank",
    amount: 25000,
  });
  assert.equal(purchaseBalance(d, "p"), 100000);
  d.purchases[0].due_date = "2027-01-01";
  assert.equal(purchaseCommitments(d, on, "month").amount, 0);
  assert.equal(nextMonth("2028-01-31"), "2028-02-29");
  assert.equal(goalBalance(d, "home"), 1325000);
});
