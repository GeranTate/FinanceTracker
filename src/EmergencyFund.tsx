import { useState, type FormEvent } from "react";
import {
  ShieldCheck,
  Plus,
  ArrowRightLeft,
  ArrowUpRight,
  Settings,
  ArchiveRestore,
} from "lucide-react";
import type { Snapshot } from "./types";
import { Stat, Empty } from "./components";
import {
  AmountInput,
  ErrorMessage,
  useSubmit,
  type SaveCommand,
} from "./forms";
import {
  accountBalance,
  bankBalance,
  dateLabel,
  goalBalance,
  money,
  parseMoney,
  today,
} from "./lib/savings";
export type EmergencyAction =
  | "emergency_deposit"
  | "emergency_transfer"
  | "emergency_spend"
  | "emergency_settings"
  | "emergency_from_goal";
export function emergencyBalance(data: Snapshot) {
  const a = data.accounts.find((a) => a.kind === "emergency");
  return a ? accountBalance(data, a.id) : 0;
}
export default function EmergencyFund({
  data,
  onAction,
}: {
  data: Snapshot;
  onAction: (action: EmergencyAction) => void;
}) {
  const balance = emergencyBalance(data),
    target = data.settings.emergency_target || 0,
    c = data.settings.currency,
    account = data.accounts.find((a) => a.kind === "emergency");
  const rows = data.transactions
    .filter((t) =>
      data.entries.some(
        (e) => e.transaction_id === t.id && e.account_id === account?.id,
      ),
    )
    .sort(
      (a, b) =>
        b.effective_date.localeCompare(a.effective_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  const saved = data.goals.filter((g) => g.status === "active");
  return (
    <>
      <div className="stats-grid">
        <Stat
          featured
          label="EMERGENCY FUND"
          value={money(balance, c)}
          caption="Reserved for emergencies · separate from Bank"
        />
        <Stat
          label="PREFERRED RESERVE"
          value={target ? money(target, c) : "Not set"}
          caption="An optional cushion to build and replenish"
        />
        <Stat
          label="LEFT TO REPLENISH"
          value={target ? money(Math.max(0, target - balance), c) : "—"}
          caption="No deadline or purchase milestone"
        />
      </div>
      <div className="emergency-intro">
        <ShieldCheck size={28} />
        <div>
          <h2>A cushion for the unexpected.</h2>
          <p>
            This money is kept outside goal savings and your spendable Bank
            balance. Credit payments and goal acquisitions cannot draw from it.
            Record withdrawals here when an emergency comes up.
          </p>
        </div>
      </div>
      {target > 0 && (
        <div className="progress-track">
          <span
            style={{
              width: `${Math.min(100, (balance / target) * 100)}%`,
              background: "var(--sage)",
            }}
          />
        </div>
      )}
      <div className="bank-toolbar">
        <div>
          <h2>Build it. Protect it. Replenish it.</h2>
          <p>Deposits add new money; transfers move savings already tracked.</p>
        </div>
        <div className="button-row">
          <button
            className="button primary"
            onClick={() => onAction("emergency_deposit")}
          >
            <Plus size={16} />
            Add savings
          </button>
          <button
            className="button secondary"
            onClick={() => onAction("emergency_transfer")}
          >
            <ArrowRightLeft size={16} />
            Transfer
          </button>
          <button
            className="button secondary"
            onClick={() => onAction("emergency_spend")}
          >
            <ArrowUpRight size={16} />
            Record emergency
          </button>
          <button
            className="icon-button"
            aria-label="Set Emergency Fund target"
            onClick={() => onAction("emergency_settings")}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
      {saved.length > 0 && (
        <div className="gentle-notice">
          <ArchiveRestore size={18} />
          <p>
            Already tracking this as a goal? Move its savings here once, keeping
            its history and total cash.
          </p>
          <button onClick={() => onAction("emergency_from_goal")}>
            Move an existing goal
          </button>
        </div>
      )}
      <section className="panel">
        <div className="panel-header">
          <h2>Emergency Fund activity</h2>
          <span className="muted">Savings, transfers and emergency use</span>
        </div>
        {rows.length ? (
          <div className="activity-list">
            {rows.map((t) => {
              const amount = data.entries
                .filter(
                  (e) =>
                    e.account_id === account?.id && e.transaction_id === t.id,
                )
                .reduce((sum, e) => sum + e.amount, 0);
              return (
                <div className="activity-row" key={t.id}>
                  <span className="activity-icon">
                    <ShieldCheck size={18} />
                  </span>
                  <div className="activity-description">
                    <strong>{t.note}</strong>
                    <span>{t.kind}</span>
                  </div>
                  <time>{dateLabel(t.effective_date, true)}</time>
                  <strong
                    className={`activity-amount ${amount > 0 ? "positive" : ""}`}
                  >
                    {amount > 0 ? "+" : ""}
                    {money(amount, c)}
                  </strong>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title="A reserve you can count on.">
            Add savings, transfer from Bank, or move your existing Emergency
            Fund goal here. Corrections to entries can be made from History.
          </Empty>
        )}
      </section>
    </>
  );
}
export function EmergencyForm({
  data,
  mode,
  save,
}: {
  data: Snapshot;
  mode: EmergencyAction;
  save: SaveCommand;
}) {
  const now = today(data.settings.timezone),
    c = data.settings.currency,
    balance = emergencyBalance(data),
    bank = bankBalance(data);
  const candidates = data.goals.filter((g) => g.status === "active");
  const [amount, setAmount] = useState(
      mode === "emergency_settings" && data.settings.emergency_target != null
        ? String(data.settings.emergency_target / 100)
        : "",
    ),
    [date, setDate] = useState(now),
    [note, setNote] = useState(""),
    [direction, setDirection] = useState("to_fund"),
    [confirmed, setConfirmed] = useState(false),
    [goalId, setGoalId] = useState(
      candidates.find((g) => /emergency/i.test(g.name))?.id ||
        candidates.find((g) => g.category === "Emergency")?.id ||
        "",
    );
  const { submit, busy, error } = useSubmit(save);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(mode, () => {
      if (
        (mode === "emergency_spend" || mode === "emergency_from_goal") &&
        !confirmed
      )
        throw new Error("Confirm the details before recording this change.");
      return mode === "emergency_settings"
        ? { target: amount === "" ? null : parseMoney(amount) }
        : mode === "emergency_from_goal"
          ? { goal_id: goalId }
          : { amount: parseMoney(amount), date, note, direction };
    });
  }
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      {mode === "emergency_settings" ? (
        <>
          <AmountInput
            label={`Preferred Emergency Fund reserve (${c}, optional)`}
            value={amount}
            onChange={setAmount}
            required={false}
          />
          <p className="form-note">
            This is a reserve target with no deadline. It is separate from goal
            milestones and their required savings. Clear it to track the balance
            without a target.
          </p>
        </>
      ) : mode === "emergency_from_goal" ? (
        <>
          <label>
            Existing savings goal
            <select
              required
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">Choose the goal to move</option>
              {candidates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {money(goalBalance(data, g.id), c)}
                </option>
              ))}
            </select>
          </label>
          <p className="form-note">
            Moves the selected goal’s whole balance into Emergency Fund and
            archives the goal. Total cash stays the same. Past plans and
            transactions stay in History and your export. The main target
            becomes your reserve target if one is not already set.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Move this goal’s savings and archive its plan.
          </label>
        </>
      ) : (
        <>
          <div className="plan-callout">
            <span className="eyebrow">Money set aside</span>
            <strong>
              {money(balance, c)}
              <small> in Emergency Fund</small>
            </strong>
            <p>{money(bank, c)} available as Bank cash</p>
          </div>
          {mode === "emergency_transfer" && (
            <label>
              Direction
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="to_fund">Bank → Emergency Fund</option>
                <option value="to_bank">Emergency Fund → Bank</option>
              </select>
            </label>
          )}
          <AmountInput
            label={`${mode === "emergency_spend" ? "Emergency expense" : "Amount"} (${c})`}
            value={amount}
            onChange={setAmount}
          />
          <label>
            Date
            <input
              required
              type="date"
              min="2000-01-01"
              max={now}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            {mode === "emergency_spend"
              ? "What emergency is this for?"
              : "Note (optional)"}
            <input
              required={mode === "emergency_spend"}
              maxLength={450}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {mode === "emergency_spend" ? (
            <label className="check-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              This is an emergency expense using my reserve.
            </label>
          ) : (
            <p className="form-note">
              {mode === "emergency_deposit"
                ? "Adds money not yet recorded in the tracker. Use Transfer for money already in Bank."
                : "Moves tracked cash without increasing total savings."}
            </p>
          )}
        </>
      )}
      <ErrorMessage error={error} />
      <button
        className="button primary full"
        disabled={
          busy ||
          ((mode === "emergency_spend" || mode === "emergency_from_goal") &&
            !confirmed)
        }
      >
        {busy
          ? "Saving…"
          : mode === "emergency_settings"
            ? "Save reserve target"
            : mode === "emergency_spend"
              ? "Record emergency expense"
              : mode === "emergency_from_goal"
                ? "Move goal to Emergency Fund"
                : mode === "emergency_transfer"
                  ? "Transfer savings"
                  : "Add emergency savings"}
      </button>
    </form>
  );
}
