import { test } from "node:test";
import assert from "node:assert/strict";
import {
  installments,
  parseMoney,
  plan,
  requiredWeekly,
  today,
} from "../src/lib/savings";
import type { Goal, Milestone } from "../src/types";
const m: Milestone = {
  id: "m",
  user_id: "u",
  goal_id: "g",
  name: "Main",
  target: 3000000,
  due_date: "2027-01-01",
  is_primary: true,
  baseline_date: "2026-01-01",
  baseline_balance: 0,
};
test("money parsing preserves exact cents and rejects ambiguous values", () => {
  assert.equal(parseMoney("123.45"), 12345);
  assert.equal(parseMoney("0.10"), 10);
  for (const invalid of ["-1", "NaN", "1.234", "1e4", "1,000", "Infinity", ""])
    assert.throws(() => parseMoney(invalid));
});
test("baseline stays fixed after contributions; catch-up requirements change", () => {
  const a = plan(m, 0, "2026-07-02"),
    b = plan(m, 2000000, "2026-07-02");
  assert.equal(a.expected, b.expected);
  assert.equal(a.status, "Behind");
  assert.equal(b.status, "Ahead");
  assert.ok(b.weekly < a.weekly);
});
test("past deadlines and funded goals never divide by zero", () => {
  assert.equal(plan(m, 100, "2027-01-01").status, "Overdue");
  assert.equal(plan(m, m.target, "2027-01-02").status, "Funded");
  assert.equal(plan(m, m.target, "2027-01-02").weekly, 0);
});
test("calendar monthly and weekly schedules reconcile exact cents across leap day and partial periods", () => {
  for (const cadence of ["week", "month"] as const) {
    const rows = installments(123457, "2028-01-29", "2028-03-17", cadence);
    assert.equal(
      rows.reduce((sum, r) => sum + r.amount, 0),
      123457,
    );
    assert.equal(rows[rows.length - 1].date, "2028-03-17");
    assert.ok(rows.every((r) => Number.isInteger(r.amount) && r.amount > 0));
  }
  assert.equal(installments(100, "2026-01-01", "2026-01-01", "week").length, 0);
  assert.deepEqual(installments(3100, "2026-01-15", "2026-02-15", "month"), [
    { date: "2026-02-01", amount: 1700 },
    { date: "2026-02-15", amount: 1400 },
  ]);
});
test("cumulative milestones share one balance; different goals combine", () => {
  const goal = { id: "g", status: "active" } as Goal;
  const primary = {
    ...m,
    target: 30000,
    baseline_date: "2026-01-01",
    due_date: "2026-01-31",
  };
  const stretch = {
    ...primary,
    id: "stretch",
    target: 60000,
    due_date: "2026-03-02",
    is_primary: false,
  };
  assert.equal(
    requiredWeekly([goal], [primary, stretch], { g: 0 }, "2026-01-01").weekly,
    7000,
  );
  assert.equal(
    requiredWeekly([goal], [primary, stretch], { g: 30000 }, "2026-01-01")
      .weekly,
    3500,
  );
  assert.equal(
    requiredWeekly(
      [goal, { id: "g2", status: "active" } as Goal],
      [primary, stretch, { ...primary, goal_id: "g2" }],
      { g: 0, g2: 0 },
      "2026-01-01",
    ).weekly,
    14000,
  );
});
test("timezone calendar dates are well-formed", () =>
  assert.match(today("America/New_York"), /^\d{4}-\d{2}-\d{2}$/));
