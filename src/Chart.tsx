import { useId } from "react";
import type { Snapshot } from "./types";
import {
  accountBalance,
  addDays,
  day,
  goalBalance,
  expectedSavings,
  money,
  today,
} from "./lib/savings";
export default function Chart({
  data: source,
  goalId,
}: {
  data: Snapshot;
  goalId?: string;
}) {
  const gradientId = useId().replaceAll(":", "");
  const data = goalId
    ? { ...source, goals: source.goals.filter((g) => g.id === goalId) }
    : source;
  const now = today(data.settings.timezone),
    active = data.goals.filter((g) => g.status === "active");
  const main = data.milestones.filter(
    (m) => m.is_primary && active.some((g) => g.id === m.goal_id),
  );
  if (!main.length)
    return (
      <div className="chart-empty">
        <div className="chart-empty-lines">
          <i />
          <i />
          <i />
        </div>
        <p>Your first goal is the start of the curve.</p>
      </div>
    );
  const milestones = data.milestones.filter((m) =>
    active.some((g) => g.id === m.goal_id),
  );
  const hasStretch = milestones.some((m) => !m.is_primary);
  const start = milestones.reduce(
    (s, m) => (m.baseline_date < s ? m.baseline_date : s),
    now,
  );
  const end = milestones.reduce(
    (s, m) => (m.due_date > s ? m.due_date : s),
    addDays(now, 1),
  );
  const days = Math.max(1, day(end) - day(start)),
    steps = 32;
  const dates = Array.from({ length: steps + 1 }, (_, i) =>
    addDays(start, Math.round((days * i) / steps)),
  );
  dates.push(
    now,
    ...milestones.flatMap((m) => [m.baseline_date, m.due_date]),
    ...active.map((g) => g.start_date),
    ...data.transactions
      .map((t) => t.effective_date)
      .filter((d) => d >= start && d <= end),
  );
  dates.sort();
  const points = [...new Set(dates)].map((date) => {
    const expected = expectedSavings(data, date);
    const stretch = expectedSavings(data, date, true);
    const actual = active.reduce((sum, g) => {
      const a = data.accounts.find((a) => a.goal_id === g.id);
      return sum + (a ? accountBalance(data, a.id, date) : 0);
    }, 0);
    return { date, expected, stretch, actual };
  });
  const max =
    Math.max(
      100,
      ...points.map((p) => Math.max(p.expected, p.stretch, p.actual)),
    ) * 1.15;
  const x = (date: string) => 66 + ((day(date) - day(start)) / days) * 690,
    y = (amount: number) => 212 - (amount / max) * 180;
  const actual = points.filter((p) => p.date <= now);
  const plannedPath = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.expected)}`)
    .join(" ");
  const stretchPath = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.stretch)}`)
    .join(" ");
  const actualPath = actual
    .map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.actual)}`)
    .join(" ");
  const current = active.reduce((s, g) => s + goalBalance(data, g.id), 0);
  const difference = current - expectedSavings(data, now),
    stretchDifference = current - expectedSavings(data, now, true);
  const pace = (difference: number) =>
    Math.abs(difference) <= 1
      ? "On track"
      : `${money(Math.abs(difference), data.settings.currency)} ${difference < -1 ? "behind" : "ahead"}`;
  return (
    <>
      <div className="chart-summary">
        <span className={difference < -1 ? "behind-text" : ""}>
          Main plan: <strong>{pace(difference)}</strong>
        </span>
        {hasStretch && (
          <span>
            Stretch plan: <strong>{pace(stretchDifference)}</strong>
          </span>
        )}
      </div>
      <div className="chart-legend">
        <span>
          <i />
          Saved
        </span>
        <span>
          <i />
          Main plan
        </span>
        {hasStretch && (
          <span className="stretch-legend">
            <i />
            With stretch targets
          </span>
        )}
      </div>
      <svg
        className="savings-chart"
        viewBox="0 0 790 258"
        role="img"
        aria-label={`Savings plan for your active goals. Currently saved ${money(current, data.settings.currency)}. Solid green is recorded savings; gray dashed is the main plan; purple dashed includes stretch targets. Main plan: ${pace(difference)}.`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#388a70" stopOpacity=".19" />
            <stop offset="100%" stopColor="#388a70" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, 0.33, 0.66, 1].map((t) => (
          <g key={t}>
            <line
              x1="66"
              x2="756"
              y1={y(t * max)}
              y2={y(t * max)}
              stroke="#e8ebe5"
              strokeDasharray="3 5"
            />
            <text x="50" y={y(t * max) + 4} textAnchor="end">
              {money(t * max, data.settings.currency, true)}
            </text>
          </g>
        ))}
        {hasStretch && (
          <path
            d={stretchPath}
            fill="none"
            stroke="#8a72a0"
            strokeWidth="2"
            strokeDasharray="3 5"
          />
        )}
        <path
          d={plannedPath}
          fill="none"
          stroke="#afb7a6"
          strokeWidth="2"
          strokeDasharray="6 6"
        />
        {actual.length > 0 && (
          <>
            <path
              d={`${actualPath} L${x(actual[actual.length - 1].date)},212 L66,212 Z`}
              fill={`url(#${gradientId})`}
            />
            <path
              d={actualPath}
              fill="none"
              stroke="#25715b"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <circle
              cx={x(now)}
              cy={y(current)}
              r="5"
              fill="#25715b"
              stroke="white"
              strokeWidth="3"
            />
            <line
              x1={x(now)}
              x2={x(now)}
              y1="20"
              y2="212"
              stroke="#25715b"
              opacity=".18"
            />
            <text
              x={Math.max(86, Math.min(730, x(now)))}
              y="15"
              textAnchor="middle"
              className="today-label"
            >
              TODAY
            </text>
          </>
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const date = addDays(start, Math.round(days * t));
          return (
            <text key={t} x={x(date)} y="242" textAnchor="middle">
              {new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
                timeZone: "UTC",
                month: "short",
                year: "2-digit",
              })}
            </text>
          );
        })}
      </svg>
      {hasStretch && (
        <p className="fine-print">
          Stretch targets share each goal’s balance. The purple line tracks the
          combined pace needed for all milestones.
        </p>
      )}
    </>
  );
}
