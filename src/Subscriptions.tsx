import { useState, type FormEvent } from "react";
import { Repeat, Pencil, Pause, Plus } from "lucide-react";
import type { Snapshot, Subscription } from "./types";
import { Empty, Stat } from "./components";
import {
  AmountInput,
  ErrorMessage,
  useSubmit,
  type SaveCommand,
} from "./forms";
import { addDays, dateLabel, money, parseMoney, today } from "./lib/savings";
import { creditDueDate, upcomingSubscriptions } from "./lib/recurring";
export type SubscriptionAction =
  | "subscription_create"
  | "subscription_edit"
  | "subscription_pause";
const cadenceLabels = { week: "Weekly", month: "Monthly", year: "Yearly" };
export default function Subscriptions({
  data,
  onAction,
  onSettings,
}: {
  data: Snapshot;
  onAction: (action: SubscriptionAction, id?: string) => void;
  onSettings: () => void;
}) {
  const now = today(data.settings.timezone),
    currency = data.settings.currency,
    rows = data.subscriptions || [],
    upcoming = upcomingSubscriptions(data, now);
  const active = rows.filter((s) => s.status === "active"),
    monthly = active.reduce(
      (sum, s) =>
        sum +
        s.amount *
          (s.cadence === "week" ? 52 / 12 : s.cadence === "year" ? 1 / 12 : 1),
      0,
    );
  return (
    <>
      <div className="stats-grid">
        <Stat
          featured
          label="ACTIVE SUBSCRIPTIONS"
          value={String(active.length)}
          caption="Subscriptions and memberships"
        />
        <Stat
          label="AVERAGE MONTHLY COST"
          value={money(Math.round(monthly), currency)}
          caption="Weekly × 52 ÷ 12 · yearly ÷ 12"
        />
        <Stat
          label="RENEWALS IN NEXT MONTH"
          value={money(
            upcoming.reduce((sum, r) => sum + r.amount, 0),
            currency,
          )}
          caption="Upcoming charges, not yet issued as purchases"
        />
      </div>
      {!data.settings.credit_due_day && (
        <div className="gentle-notice">
          <p>
            Set your credit payment due day before adding recurring charges.
          </p>
          <button onClick={onSettings}>Open Settings</button>
        </div>
      )}
      <div className="purchase-intro">
        <Repeat size={23} />
        <p>
          Renewals automatically become credit purchases on their charge dates,
          including while the app is closed. Payment is due on your configured
          day in the following month. These are bookkeeping entries; payments
          are recorded separately from Bank.
        </p>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Subscriptions / Memberships</h2>
            <p>Your recurring commitments, in one place.</p>
          </div>
        </div>
        {rows.length ? (
          <div className="purchase-list">
            {rows.map((s) => (
              <article key={s.id} className="purchase-row">
                <div className="purchase-identity">
                  <span className="purchase-icon">
                    <Repeat size={20} />
                  </span>
                  <div>
                    <h3>{s.name}</h3>
                    <p>
                      {s.card || "Credit"} · {cadenceLabels[s.cadence]}
                    </p>
                    <span
                      className={`status ${s.status === "active" ? "upcoming" : "cancelled"}`}
                    >
                      {s.status === "active" ? "Active" : "Paused"}
                    </span>
                  </div>
                </div>
                <div className="purchase-due">
                  <span>
                    {s.status === "active" ? "Next charge" : "Schedule paused"}
                  </span>
                  <strong>
                    {s.status === "active"
                      ? dateLabel(s.next_charge_date)
                      : "Choose a date to resume"}
                  </strong>
                </div>
                <div className="purchase-amount">
                  <strong>{money(s.amount, currency)}</strong>
                  <span>per {s.cadence}</span>
                </div>
                <div className="purchase-actions">
                  <button
                    className="button secondary"
                    onClick={() => onAction("subscription_edit", s.id)}
                  >
                    <Pencil size={14} />
                    {s.status === "paused" ? "Resume / edit" : "Edit"}
                  </button>
                  {s.status === "active" && (
                    <button
                      className="icon-button"
                      aria-label={`Pause ${s.name}`}
                      onClick={() => onAction("subscription_pause", s.id)}
                    >
                      <Pause size={16} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Keep recurring costs in view."
            action={
              <button
                className="button primary"
                disabled={!data.settings.credit_due_day}
                onClick={() => onAction("subscription_create")}
              >
                <Plus size={16} />
                Add subscription
              </button>
            }
          >
            Add a weekly, monthly or yearly subscription or membership.
          </Empty>
        )}
      </section>
      <p className="fine-print">
        Pausing stops future renewals. Purchases already issued stay due.
        Editing a subscription changes future charges only; past purchases keep
        their amounts and due dates. Monthly dates return to their original day
        after shorter months.
      </p>
    </>
  );
}
export function SubscriptionForm({
  data,
  subscription: s,
  mode,
  save,
}: {
  data: Snapshot;
  subscription?: Subscription;
  mode: SubscriptionAction;
  save: SaveCommand;
}) {
  const now = today(data.settings.timezone),
    [name, setName] = useState(s?.name || ""),
    [card, setCard] = useState(s?.card || ""),
    [amount, setAmount] = useState(s ? String(s.amount / 100) : ""),
    [cadence, setCadence] = useState<Subscription["cadence"]>(
      s?.cadence || "month",
    ),
    [date, setDate] = useState(
      s && s.next_charge_date > now ? s.next_charge_date : now,
    ),
    [status, setStatus] = useState<Subscription["status"]>("active");
  const { submit, busy, error } = useSubmit(save);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(mode, () =>
      mode === "subscription_pause"
        ? { subscription_id: s!.id }
        : {
            subscription_id: s?.id,
            name,
            card,
            amount: parseMoney(amount),
            cadence,
            next_charge_date: date,
            status,
          },
    );
  }
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      {mode === "subscription_pause" ? (
        <p>
          Pause “{s?.name}”? Future charges stop. Issued purchases and their
          unpaid balances stay in Purchases.
        </p>
      ) : (
        <>
          <label>
            Subscription or membership name
            <input
              required
              autoFocus
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Streaming, gym, software…"
            />
          </label>
          <label>
            Card label (optional)
            <input
              maxLength={80}
              value={card}
              onChange={(e) => setCard(e.target.value)}
              placeholder="e.g. Everyday Visa"
            />
          </label>
          <AmountInput
            label={`Charge amount (${data.settings.currency})`}
            value={amount}
            onChange={setAmount}
          />
          <div className="form-grid">
            <label>
              Repeats
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value as typeof cadence)}
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </label>
            <label>
              Next charge date
              <input
                required
                type="date"
                min={now}
                max={addDays(now, 36525)}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <label>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </label>
          <p className="form-note">
            {data.settings.credit_due_day && date
              ? `A charge on ${dateLabel(date, true)} will create a credit purchase due ${dateLabel(creditDueDate(date, data.settings.credit_due_day))}.`
              : "Set your credit due day in Settings first."}{" "}
            Charges dated today are recorded when you save.
          </p>
        </>
      )}
      <ErrorMessage error={error} />
      <button
        className="button primary full"
        disabled={
          busy ||
          (!data.settings.credit_due_day && mode !== "subscription_pause")
        }
      >
        {busy
          ? "Saving…"
          : mode === "subscription_pause"
            ? "Pause subscription"
            : "Save subscription"}
      </button>
    </form>
  );
}
