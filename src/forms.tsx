import { useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import type { CommandPayload, Goal, Snapshot } from "./types";
import {
  addDays,
  bankBalance,
  capacity,
  goalBalance,
  money,
  parseMoney,
  plan,
  requiredWeekly,
  today,
} from "./lib/savings";
export type SaveCommand = (
  action: string,
  payload: CommandPayload,
  id: string,
) => Promise<void>;
function useSubmit(save: SaveCommand) {
  const id = useRef(crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(action: string, makePayload: () => CommandPayload) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await save(action, makePayload(), id.current);
    } catch (e) {
      setError((e as Error).message || "Could not save. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return { submit, busy, error };
}
function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <div className="form-error" role="alert">
      <AlertCircle size={17} />
      {error}
    </div>
  ) : null;
}
function AmountInput({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </label>
  );
}
const safeMoney = (value: string) => {
  try {
    return parseMoney(value);
  } catch {
    return 0;
  }
};
export function GoalForm({
  data,
  goal,
  save,
}: {
  data: Snapshot;
  goal?: Goal;
  save: SaveCommand;
}) {
  const now = today(data.settings.timezone),
    existing = goal ? data.milestones.filter((m) => m.goal_id === goal.id) : [];
  const [name, setName] = useState(goal?.name || ""),
    [description, setDescription] = useState(goal?.description || "");
  const [category, setCategory] = useState(goal?.category || "Other"),
    [color, setColor] = useState(goal?.color || "sage");
  const [start, setStart] = useState(now),
    [opening, setOpening] = useState("0"),
    [source, setSource] = useState("new");
  const [rows, setRows] = useState(
    existing.length
      ? existing.map((m) => ({
          name: m.name,
          target: String(m.target / 100),
          due_date: m.due_date,
          is_primary: m.is_primary,
        }))
      : [
          {
            name: "Main milestone",
            target: "",
            due_date: addDays(now, 365),
            is_primary: true,
          },
        ],
  );
  const { submit, busy, error } = useSubmit(save);
  const rowUpdate = (index: number, key: string, value: unknown) =>
    setRows(
      rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  const balance = goal ? goalBalance(data, goal.id) : safeMoney(opening);
  const draftMilestones = rows
    .filter((r) => r.target && r.due_date)
    .map((r, i) => ({
      ...r,
      id: "draft-" + i,
      user_id: data.settings.user_id,
      goal_id: goal?.id || "draft",
      baseline_date: goal ? now : start,
      baseline_balance: balance,
      target: safeMoney(r.target),
    }));
  const primary = draftMilestones.find((m) => m.is_primary),
    weekly = primary ? plan(primary, balance, now).weekly : 0;
  const limit = capacity(data.settings);
  const draftGoal = goal || {
    id: "draft",
    user_id: data.settings.user_id,
    name,
    description,
    category,
    color,
    start_date: start,
    status: "active" as const,
    created_at: now,
    actual_cost: null,
    acquired_on: null,
  };
  const otherGoals = data.goals.filter((g) => g.id !== goal?.id);
  const combined = requiredWeekly(
    [...otherGoals, draftGoal],
    [
      ...data.milestones.filter((m) => m.goal_id !== goal?.id),
      ...draftMilestones,
    ],
    {
      ...Object.fromEntries(
        otherGoals.map((g) => [g.id, goalBalance(data, g.id)]),
      ),
      [draftGoal.id]: balance,
    },
    now,
  );
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(goal ? "replan" : "create_goal", () => ({
      goal_id: goal?.id,
      name,
      description,
      category,
      color,
      start_date: start,
      opening: parseMoney(opening),
      opening_source: source,
      milestones: rows.map((r) => ({ ...r, target: parseMoney(r.target) })),
    }));
  }
  return (
    <form onSubmit={onSubmit} className="form-stack">
      <label>
        Goal name
        <input
          autoFocus
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What are you making room for?"
        />
      </label>
      <label>
        A little motivation <span className="muted">(optional)</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why this matters to you…"
        />
      </label>
      <div className="form-grid">
        <label>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "Home",
              "Travel",
              "Transport",
              "Education",
              "Emergency",
              "Other",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Color
          <select value={color} onChange={(e) => setColor(e.target.value)}>
            {["sage", "sand", "blue", "rose"].map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!goal && (
        <>
          <div className="form-grid">
            <label>
              Start date
              <input
                type="date"
                min="2000-01-01"
                max={now}
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <AmountInput
              label={`Already saved (${data.settings.currency})`}
              value={opening}
              onChange={setOpening}
            />
          </div>
          {safeMoney(opening) > 0 && (
            <label>
              Where is this money coming from?
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="new">
                  Savings not yet recorded in the tracker
                </option>
                <option value="bank">
                  Transfer from Bank (
                  {money(bankBalance(data), data.settings.currency)})
                </option>
              </select>
            </label>
          )}
        </>
      )}
      <div className="section-label">
        <h3>Milestones</h3>
        <span>Cumulative targets · one shared balance</span>
      </div>
      {rows.map((row, i) => (
        <fieldset key={i} className="milestone-editor">
          <legend>Milestone {i + 1}</legend>
          <div className="form-grid">
            <label>
              Name
              <input
                required
                maxLength={80}
                value={row.name}
                onChange={(e) => rowUpdate(i, "name", e.target.value)}
              />
            </label>
            <AmountInput
              label={`Target (${data.settings.currency})`}
              value={row.target}
              onChange={(v) => rowUpdate(i, "target", v)}
            />
          </div>
          <div className="form-grid">
            <label>
              Goal date
              <input
                type="date"
                min={addDays(now, 1)}
                max={addDays(now, 36525)}
                required
                value={row.due_date}
                onChange={(e) => rowUpdate(i, "due_date", e.target.value)}
              />
            </label>
            <div className="row-options">
              <label className="radio-label">
                <input
                  type="radio"
                  name="primary"
                  checked={row.is_primary}
                  onChange={() =>
                    setRows(rows.map((r, j) => ({ ...r, is_primary: j === i })))
                  }
                />
                Main milestone
              </label>
              {rows.length > 1 && (
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove milestone ${i + 1}`}
                  onClick={() => {
                    const next = rows.filter((_, j) => j !== i);
                    if (!next.some((r) => r.is_primary))
                      next[0].is_primary = true;
                    setRows(next);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        </fieldset>
      ))}
      {rows.length < 20 && (
        <button
          className="text-button align-left"
          type="button"
          onClick={() =>
            setRows([
              ...rows,
              {
                name: "Stretch milestone",
                target: "",
                due_date: addDays(rows[rows.length - 1].due_date || now, 180),
                is_primary: false,
              },
            ])
          }
        >
          <Plus size={16} />
          Add a milestone
        </button>
      )}
      {primary && primary.target > 0 && (
        <div
          className={`plan-callout ${limit && combined.weekly > limit.amount ? "warning" : ""}`}
        >
          <span className="eyebrow">Your savings pace</span>
          <strong>
            {money(weekly, data.settings.currency)}
            <small> / week toward the main milestone</small>
          </strong>
          {data.settings.hourly_rate > 0 && (
            <p>
              About {(weekly / data.settings.hourly_rate).toFixed(1)} hours of
              work per week.
            </p>
          )}
          {limit && combined.weekly > limit.amount ? (
            <p>
              <AlertCircle size={15} />
              All goals together need{" "}
              {money(combined.weekly, data.settings.currency)} / week, above
              your {limit.label}. You can still keep this goal.
            </p>
          ) : (
            <p>
              {limit
                ? `Your combined plan needs ${money(combined.weekly, data.settings.currency)} / week.`
                : "Set a weekly savings budget in Settings to check affordability."}
            </p>
          )}
        </div>
      )}
      {goal && (
        <p className="fine-print">
          Saving starts a new plan from today’s balance. Your previous plan is
          kept in history.
        </p>
      )}
      <ErrorMessage error={error} />
      <button className="button primary full" disabled={busy}>
        {busy ? "Saving…" : goal ? "Save new plan" : "Create goal"}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
export function MoneyForm({
  data,
  mode,
  goalId,
  save,
}: {
  data: Snapshot;
  mode: "deposit" | "transfer" | "spend" | "acquire";
  goalId?: string;
  save: SaveCommand;
}) {
  const currency = data.settings.currency,
    now = today(data.settings.timezone);
  const [selected, setSelected] = useState(goalId || ""),
    [direction, setDirection] = useState("to_goal"),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(now),
    [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false),
    { submit, busy, error } = useSubmit(save);
  const goal = data.goals.find((g) => g.id === selected),
    saved = goal ? goalBalance(data, goal.id) : 0;
  const price = safeMoney(amount),
    bank = bankBalance(data),
    primary = data.milestones.find(
      (m) => m.goal_id === selected && m.is_primary,
    );
  const funded = Boolean(primary && saved >= primary.target);
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(mode, () => {
          if (mode === "acquire" && !confirmed)
            throw new Error("Confirm the purchase details before saving.");
          return {
            goal_id: selected || null,
            amount: parseMoney(amount),
            direction,
            date,
            note,
          };
        });
      }}
    >
      {mode !== "spend" && (
        <label>
          {mode === "deposit" ? "Save to" : "Goal"}
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setConfirmed(false);
            }}
            required={mode !== "deposit"}
          >
            <option value="">
              {mode === "deposit"
                ? "Bank · unallocated savings"
                : "Choose a goal"}
            </option>
            {data.goals
              .filter((g) => g.status === "active")
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {mode === "transfer" && (
        <label>
          Direction
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="to_goal">Bank → goal</option>
            <option value="to_bank">Goal → Bank</option>
          </select>
        </label>
      )}
      <AmountInput
        label={`${mode === "acquire" ? "Actual purchase price" : "Amount"} (${currency})`}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setConfirmed(false);
        }}
      />
      <label>
        Date
        <input
          type="date"
          min={goal?.start_date || "2000-01-01"}
          max={now}
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={mode === "acquire"}
        />
      </label>
      <label>
        Note <span className="muted">(optional)</span>
        <input
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            mode === "acquire"
              ? "What did you acquire?"
              : "A little context for future you"
          }
        />
      </label>
      {mode === "deposit" && (
        <p className="form-note">
          This records new money. To move savings already in Bank, use Transfer
          instead.
        </p>
      )}
      {mode === "spend" && (
        <p className="form-note">
          Spending comes from Bank. Available:{" "}
          <strong>{money(bank, currency)}</strong>.
        </p>
      )}
      {mode === "transfer" && (
        <p className="form-note">
          Bank: <strong>{money(bank, currency)}</strong>
          {goal && (
            <>
              {" "}
              · Goal: <strong>{money(saved, currency)}</strong>
            </>
          )}
          . Your combined savings stay the same.
        </p>
      )}
      {mode === "acquire" && goal && (
        <div className="purchase-preview">
          <span className="eyebrow">Before you make it yours</span>
          <div>
            <span>Goal savings</span>
            <strong>{money(saved, currency)}</strong>
          </div>
          <div>
            <span>Actual purchase</span>
            <strong>−{money(price, currency)}</strong>
          </div>
          <div>
            <span>
              {saved >= price ? "Returned to Bank" : "Needed from Bank"}
            </span>
            <strong>{money(Math.abs(saved - price), currency)}</strong>
          </div>
          <div className="total">
            <span>Bank afterward</span>
            <strong>{money(bank + saved - price, currency)}</strong>
          </div>
          {!funded && (
            <p className="form-error">
              The main milestone must be fully funded first.
            </p>
          )}
          {price > bank + saved && (
            <p className="form-error">Bank cannot cover this shortfall.</p>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Record this purchase and close the goal, including its remaining
            milestones.
          </label>
        </div>
      )}
      <ErrorMessage error={error} />
      <button
        className="button primary full"
        disabled={
          busy ||
          (mode === "acquire" &&
            (!funded || !confirmed || price > bank + saved))
        }
      >
        {busy
          ? "Saving…"
          : mode === "acquire"
            ? "Record acquisition"
            : mode === "transfer"
              ? "Transfer savings"
              : mode === "spend"
                ? "Record spending"
                : "Add savings"}
        <Check size={17} />
      </button>
    </form>
  );
}
export function SettingsForm({
  data,
  save,
}: {
  data: Snapshot;
  save: SaveCommand;
}) {
  const s = data.settings;
  const [name, setName] = useState(s.display_name),
    [currency, setCurrency] = useState(s.currency),
    [timezone, setTimezone] = useState(s.timezone);
  const [rate, setRate] = useState(String(s.hourly_rate / 100)),
    [rateType, setRateType] = useState(s.rate_type);
  const [hours, setHours] = useState(
      s.weekly_hours === null ? "" : String(s.weekly_hours),
    ),
    [budget, setBudget] = useState(
      s.weekly_budget === null ? "" : String(s.weekly_budget / 100),
    );
  const { submit, busy, error } = useSubmit(save);
  return (
    <form
      className="form-stack settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("settings", () => ({
          display_name: name,
          currency,
          timezone,
          hourly_rate: parseMoney(rate),
          rate_type: rateType,
          weekly_hours: hours === "" ? null : Number(hours),
          weekly_budget: budget === "" ? null : parseMoney(budget),
        }));
      }}
    >
      <div className="settings-section">
        <h3>A few basics</h3>
        <p>Make this space feel like yours.</p>
      </div>
      <label>
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Your first name"
        />
      </label>
      <div className="form-grid">
        <label>
          Currency
          <select
            value={currency}
            disabled={data.entries.length > 0}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {["USD", "CAD", "GBP", "EUR", "AUD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Timezone
          <input
            required
            list="timezones"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
          <datalist id="timezones">
            {Intl.supportedValuesOf("timeZone").map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </label>
      </div>
      {data.entries.length > 0 && (
        <p className="fine-print">
          Currency stays fixed once money is recorded, to keep your history
          consistent.
        </p>
      )}
      <div className="settings-section">
        <h3>What’s a realistic pace?</h3>
        <p>
          Income is a ceiling. Your savings budget is what you can actually set
          aside.
        </p>
      </div>
      <div className="form-grid">
        <AmountInput
          label={`Hourly rate (${currency})`}
          value={rate}
          onChange={setRate}
        />
        <label>
          Rate type
          <select
            value={rateType}
            onChange={(e) => setRateType(e.target.value as typeof rateType)}
          >
            <option value="gross">Gross · before deductions</option>
            <option value="take_home">Take-home</option>
          </select>
        </label>
      </div>
      <label>
        Usual hours worked per week <span className="muted">(optional)</span>
        <input
          type="number"
          min="0"
          max="168"
          step="0.25"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="40"
        />
      </label>
      <AmountInput
        label={`Weekly savings budget (${currency}, optional)`}
        value={budget}
        onChange={setBudget}
        required={false}
      />
      <p className="form-note">
        We compare all your goals against this budget. Leave it blank to use
        your weekly income as a rough ceiling. We don’t estimate taxes or living
        expenses.
      </p>
      <ErrorMessage error={error} />
      <button className="button primary align-left" disabled={busy}>
        {busy ? "Saving…" : "Save settings"}
        <Check size={17} />
      </button>
    </form>
  );
}
