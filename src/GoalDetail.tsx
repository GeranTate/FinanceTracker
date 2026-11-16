import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  Pencil,
  ShoppingBag,
  Archive,
} from "lucide-react";
import type { Goal, Snapshot } from "./types";
import { GoalIcon, Status } from "./components";
import {
  dateLabel,
  goalBalance,
  installments,
  money,
  plan,
  today,
} from "./lib/savings";
export default function GoalDetail({
  data,
  goal,
  onAction,
}: {
  data: Snapshot;
  goal: Goal;
  onAction: (action: string, goalId: string) => void;
}) {
  const rows = data.milestones.filter((m) => m.goal_id === goal.id);
  const [selected, setSelected] = useState(
      rows.find((m) => m.is_primary)?.id || rows[0]?.id,
    ),
    [cadence, setCadence] = useState<"week" | "month">("month"),
    [all, setAll] = useState(false),
    [scheduleType, setScheduleType] = useState<"catchup" | "original">(
      "catchup",
    );
  const m = rows.find((m) => m.id === selected) || rows[0],
    balance = goalBalance(data, goal.id),
    currency = data.settings.currency;
  const now = today(data.settings.timezone),
    p = plan(m, balance, now);
  const schedule = installments(
    scheduleType === "catchup"
      ? p.remaining
      : Math.max(0, m.target - m.baseline_balance),
    scheduleType === "catchup" ? now : m.baseline_date,
    m.due_date,
    cadence,
  );
  return (
    <div className="detail-body">
      <div className="detail-intro">
        <GoalIcon category={goal.category} color={goal.color} />
        <p>
          {goal.description ||
            "A little progress today. More possibilities tomorrow."}
        </p>
      </div>
      {goal.status !== "active" ? (
        <div className="plan-callout">
          <span className="eyebrow">
            {goal.status === "acquired" ? "Made it yours" : "Archived"}
          </span>
          <strong>
            {goal.actual_cost
              ? money(goal.actual_cost, currency)
              : money(balance, currency)}
          </strong>
          {goal.acquired_on && (
            <p>
              Acquired {dateLabel(goal.acquired_on)}. Your savings history is
              preserved.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="detail-balance">
            <span>
              {money(balance, currency)}
              <small> saved</small>
            </span>
            <Status value={p.status} />
          </div>
          <div className="detail-actions">
            <button
              className="button primary"
              onClick={() => onAction("deposit", goal.id)}
            >
              <ArrowDownLeft size={16} />
              Add savings
            </button>
            <button
              className="button secondary"
              onClick={() => onAction("transfer", goal.id)}
            >
              <ArrowRightLeft size={16} />
              Transfer
            </button>
            <button
              className="button secondary"
              onClick={() => onAction("edit", goal.id)}
            >
              <Pencil size={16} />
              Edit plan
            </button>
          </div>
        </>
      )}
      <div className="section-label">
        <h3>One goal. More possibilities.</h3>
      </div>
      <div className="milestone-tabs">
        {rows.map((row) => (
          <button
            className={selected === row.id ? "selected" : ""}
            key={row.id}
            onClick={() => {
              setSelected(row.id);
              setAll(false);
            }}
          >
            <span>
              {row.name}
              {row.is_primary && <small>MAIN</small>}
            </span>
            <strong>{money(row.target, currency, true)}</strong>
            <span>{dateLabel(row.due_date, true)}</span>
          </button>
        ))}
      </div>
      <div className="progress-track">
        <span
          style={{
            width: `${p.progress}%`,
            background: `var(--${goal.color})`,
          }}
        />
      </div>
      <div className="progress-caption">
        <span>
          {p.progress.toFixed(1)}% of {money(m.target, currency)}
        </span>
        <span>{Math.max(0, p.daysLeft)} days left</span>
      </div>
      {goal.status === "active" && (
        <>
          <div className="detail-metrics">
            <div>
              <span>Still to save</span>
              <strong>{money(p.remaining, currency)}</strong>
            </div>
            <div>
              <span>Needed per week</span>
              <strong>
                {p.daysLeft <= 0 && !p.funded
                  ? "Overdue"
                  : money(p.weekly, currency)}
              </strong>
            </div>
          </div>
          <p
            className={`schedule-note ${p.difference < -1 ? "behind-text" : ""}`}
          >
            {p.funded
              ? "This milestone is fully funded. Keep going or make it yours."
              : `${money(Math.abs(p.difference), currency)} ${p.difference < -1 ? "behind" : p.difference > 1 ? "ahead of" : "from"} the original plan. Expected by today: ${money(p.expected, currency)}.`}
          </p>
          <div className="schedule-controls">
            <div className="segmented">
              <button
                className={scheduleType === "catchup" ? "selected" : ""}
                onClick={() => setScheduleType("catchup")}
              >
                From today
              </button>
              <button
                className={scheduleType === "original" ? "selected" : ""}
                onClick={() => setScheduleType("original")}
              >
                Original plan
              </button>
            </div>
            <select
              aria-label="Schedule frequency"
              value={cadence}
              onChange={(e) => {
                setCadence(e.target.value as typeof cadence);
                setAll(false);
              }}
            >
              <option value="month">Monthly</option>
              <option value="week">Weekly</option>
            </select>
          </div>
          {schedule.length ? (
            <>
              <div className="schedule-table">
                {(all ? schedule : schedule.slice(0, 6)).map((row, i) => (
                  <div key={row.date}>
                    <span>
                      {dateLabel(row.date)}
                      {i === 0 && (
                        <small>
                          {scheduleType === "catchup"
                            ? "Next period ends"
                            : "First period ends"}
                        </small>
                      )}
                    </span>
                    <strong>{money(row.amount, currency)}</strong>
                  </div>
                ))}
              </div>
              {schedule.length > 6 && (
                <button className="text-button" onClick={() => setAll(!all)}>
                  {all
                    ? "Show fewer periods"
                    : `Show all ${schedule.length} periods`}
                </button>
              )}
              <p className="fine-print">
                Weekly and monthly views describe the same plan. Partial periods
                are prorated to your exact goal date.
              </p>
            </>
          ) : (
            <p className="form-note">
              {p.funded
                ? "Nothing left to save for this milestone."
                : "This date has passed. Edit the plan to set a new deadline."}
            </p>
          )}
          <div className="detail-footer">
            <button
              className="button primary"
              disabled={
                balance < (rows.find((m) => m.is_primary)?.target || Infinity)
              }
              onClick={() => onAction("acquire", goal.id)}
            >
              <ShoppingBag size={17} />
              Acquire goal
            </button>
            {balance === 0 && (
              <button
                className="text-button"
                onClick={() => onAction("archive", goal.id)}
              >
                <Archive size={15} />
                Archive goal
              </button>
            )}
          </div>
          <p className="fine-print">
            Acquiring records the actual purchase price and settles the
            difference with Bank.
          </p>
        </>
      )}
    </div>
  );
}
