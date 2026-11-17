import { test } from "node:test";
import assert from "node:assert/strict";
import {
  latestPayday,
  nextPayday,
  paySchedule,
  periodPlan,
  statusExpectedSavings,
} from "../src/lib/paySchedule";
import { expectedSavings, plan } from "../src/lib/savings";
import { makeDemo } from "../src/lib/demo";
import type { Milestone, PaySchedule } from "../src/types";
const settings = makeDemo().settings;
const weekly: PaySchedule = {
  cadence: "weekly",
  weekday: 5,
  anchor_date: "2026-11-20",
  day1: 1,
  day2: 15,
};
const milestone: Milestone = {
  id: "main",
  goal_id: "home",
  user_id: "demo",
  name: "Main",
  target: 280000,
  due_date: "2026-12-04",
  baseline_date: "2026-11-06",
  baseline_balance: 0,
  is_primary: true,
};
test("weekly status holds between paydays and updates on Friday itself", () => {
  const s = { ...settings, pay_schedule: weekly };
  assert.equal(latestPayday("2026-11-17", weekly), "2026-11-13");
  assert.equal(nextPayday("2026-11-17", weekly), "2026-11-20");
  const before = periodPlan(milestone, 70000, "2026-11-17", s),
    later = periodPlan(milestone, 70000, "2026-11-19", s);
  assert.equal(before.expected, 70000);
  assert.equal(later.expected, before.expected);
  assert.equal(before.status, "On track");
  assert.equal(periodPlan(milestone, 70000, "2026-11-20", s).status, "Behind");
  assert.equal(
    periodPlan(milestone, 150000, "2026-11-20", s).difference,
    10000,
  );
});
test("first payday never charges savings before the baseline, and the final deadline takes priority", () => {
  const s = { ...settings, pay_schedule: weekly },
    m = { ...milestone, baseline_date: "2026-11-16", due_date: "2026-11-19" };
  assert.equal(periodPlan(m, 0, "2026-11-17", s).expected, 0);
  assert.equal(periodPlan(m, 0, "2026-11-19", s).expected, m.target);
  assert.equal(periodPlan(m, 0, "2026-11-19", s).status, "Overdue");
  assert.equal(periodPlan(m, m.target, "2026-11-19", s).status, "Funded");
  assert.equal(
    periodPlan({ ...m, baseline_date: "2026-11-18" }, 0, "2026-11-17", s)
      .status,
    "Scheduled",
  );
});
test("every-two-week schedule is anchored to a known payday in either direction", () => {
  const s = { ...weekly, cadence: "biweekly" as const };
  assert.equal(latestPayday("2026-11-17", s), "2026-11-06");
  assert.equal(latestPayday("2026-11-20", s), "2026-11-20");
  assert.equal(nextPayday("2026-11-20", s), "2026-12-04");
});
test("monthly and twice-monthly paydays clamp to month end without drifting", () => {
  const monthly = { ...weekly, cadence: "monthly" as const, day1: 31 };
  assert.equal(latestPayday("2028-02-27", monthly), "2028-01-31");
  assert.equal(latestPayday("2028-02-29", monthly), "2028-02-29");
  assert.equal(nextPayday("2028-02-29", monthly), "2028-03-31");
  const twice = {
    ...weekly,
    cadence: "semimonthly" as const,
    day1: 1,
    day2: 15,
  };
  assert.equal(latestPayday("2026-11-14", twice), "2026-11-01");
  assert.equal(latestPayday("2026-11-15", twice), "2026-11-15");
  assert.equal(nextPayday("2026-11-15", twice), "2026-12-01");
  assert.equal(
    latestPayday("2026-02-28", { ...twice, day1: 15, day2: 31 }),
    "2026-02-28",
  );
});
test("pay schedules change labels but leave daily chart series and catch-up pace unchanged", () => {
  const d = makeDemo();
  d.goals = [
    { ...d.goals[0], id: "home", start_date: milestone.baseline_date },
  ];
  d.milestones = [milestone];
  d.settings.pay_schedule = { ...weekly, cadence: "daily" };
  const smooth = expectedSavings(d, "2026-11-17");
  d.settings.pay_schedule = weekly;
  assert.equal(expectedSavings(d, "2026-11-17"), smooth);
  assert.equal(statusExpectedSavings(d, "2026-11-17"), 70000);
  assert.equal(
    periodPlan(milestone, 70000, "2026-11-17", d.settings).weekly,
    plan(milestone, 70000, "2026-11-17").weekly,
  );
  const legacy = { ...settings, pay_schedule: undefined };
  assert.equal(paySchedule(legacy).cadence, "daily");
  assert.equal(
    periodPlan(milestone, 70000, "2026-11-17", legacy).expected,
    smooth,
  );
});
