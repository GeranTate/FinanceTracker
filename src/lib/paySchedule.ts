import type { Milestone, PaySchedule, Settings, Snapshot } from "../types";
import { addDays, day, plan, today } from "./savings";

export function paySchedule(settings: Settings): PaySchedule {
  return {
    cadence: "daily",
    weekday: 5,
    anchor_date: today(settings.timezone),
    day1: 1,
    day2: 15,
    ...settings.pay_schedule,
  };
}
function monthPayday(on: string, monthOffset: number, payDay: number) {
  const [y, m] = on.split("-").map(Number),
    month = m - 1 + monthOffset;
  const last = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, month, Math.min(payDay, last)))
    .toISOString()
    .slice(0, 10);
}
export function latestPayday(on: string, schedule: PaySchedule) {
  if (schedule.cadence === "daily") return on;
  if (schedule.cadence === "weekly") {
    const weekday = new Date(on + "T00:00:00Z").getUTCDay();
    return addDays(on, -((weekday - schedule.weekday + 7) % 7));
  }
  if (schedule.cadence === "biweekly")
    return addDays(
      schedule.anchor_date,
      Math.floor((day(on) - day(schedule.anchor_date)) / 14) * 14,
    );
  const dates = [0, -1].flatMap((offset) =>
    (schedule.cadence === "semimonthly"
      ? [schedule.day1, schedule.day2]
      : [schedule.day1]
    ).map((d) => monthPayday(on, offset, d)),
  );
  return dates
    .filter((date) => date <= on)
    .sort()
    .at(-1)!;
}
export function nextPayday(on: string, schedule: PaySchedule) {
  const last = latestPayday(on, schedule);
  for (let i = 1; i <= 62; i++) {
    const date = addDays(on, i);
    if (latestPayday(date, schedule) > last) return date;
  }
  return on;
}
export function periodPlan(
  m: Milestone,
  balance: number,
  on: string,
  settings: Settings,
) {
  const p = plan(m, balance, on),
    schedule = paySchedule(settings);
  const cutoff = on >= m.due_date ? m.due_date : latestPayday(on, schedule);
  const comparisonDate = cutoff < m.baseline_date ? m.baseline_date : cutoff;
  const expected = plan(m, balance, comparisonDate).expected,
    difference = balance - expected;
  const status =
    on < m.baseline_date
      ? "Scheduled"
      : p.funded
        ? "Funded"
        : p.daysLeft <= 0
          ? "Overdue"
          : difference < -1
            ? "Behind"
            : difference > 1
              ? "Ahead"
              : "On track";
  return { ...p, expected, difference, status, comparisonDate };
}
export function statusExpectedSavings(
  data: Snapshot,
  on: string,
  secondary = false,
) {
  return data.goals
    .filter((g) => g.status === "active" && g.start_date <= on)
    .reduce(
      (sum, g) =>
        sum +
        Math.max(
          0,
          ...data.milestones
            .filter((m) => m.goal_id === g.id && (secondary || m.is_primary))
            .map((m) => periodPlan(m, 0, on, data.settings).expected),
        ),
      0,
    );
}
