import { useState, type FormEvent } from "react";
import { CreditCard, Plus, ArrowRight, Pencil, X } from "lucide-react";
import type { Purchase, Snapshot } from "./types";
import { Empty, Stat } from "./components";
import {
  AmountInput,
  ErrorMessage,
  useSubmit,
  type SaveCommand,
} from "./forms";
import {
  addDays,
  bankBalance,
  dateLabel,
  money,
  parseMoney,
  purchaseBalance,
  purchasePaid,
  purchaseCommitments,
  today,
} from "./lib/savings";

import { creditDueDate, bankReserves } from "./lib/recurring";

export type PurchaseAction =
  | "purchase_create"
  | "purchase_edit"
  | "purchase_pay"
  | "purchase_cancel";
export default function Purchases({
  data,
  onAction,
}: {
  data: Snapshot;
  onAction: (action: PurchaseAction, id?: string) => void;
}) {
  const [filter, setFilter] = useState<"unpaid" | "paid" | "all">("unpaid");
  const now = today(data.settings.timezone),
    currency = data.settings.currency;
  const active = (data.purchases || []).filter((p) => p.status === "active");
  const outstanding = active.reduce(
      (s, p) => s + purchaseBalance(data, p.id),
      0,
    ),
    due = purchaseCommitments(data, now, "month");
  const rows = (data.purchases || [])
    .filter(
      (p) =>
        filter === "all" ||
        (p.status === "active" &&
          (filter === "unpaid"
            ? purchaseBalance(data, p.id) > 0
            : purchaseBalance(data, p.id) === 0)),
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  return (
    <>
      <div className="stats-grid">
        <Stat
          featured
          label="TOTAL UNPAID"
          value={money(outstanding, currency)}
          caption="Across your recorded purchases"
        />
        <Stat
          label="DUE IN THE NEXT MONTH"
          value={money(due.amount, currency)}
          caption={`Through ${dateLabel(due.end, true)} · includes overdue`}
        />
        <Stat
          label="OVERDUE"
          value={money(due.overdue, currency)}
          caption="Unpaid balances past their due date"
        />
      </div>
      <div className="purchase-intro">
        <CreditCard size={23} />
        <p>
          Record card purchases here to reserve room in your income forecast.
          Record payments from Bank when you pay them.{" "}
          <strong>These entries track payments; they don’t send money.</strong>{" "}
          Add interest or fees to the purchase amount when needed.
        </p>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Your purchases</h2>
            <p>Everyday spending, with a date to plan for.</p>
          </div>
          <div className="segmented">
            {(["unpaid", "paid", "all"] as const).map((f) => (
              <button
                key={f}
                className={filter === f ? "selected" : ""}
                onClick={() => setFilter(f)}
              >
                {f === "unpaid" ? "Unpaid" : f === "paid" ? "Paid" : "All"}
              </button>
            ))}
          </div>
        </div>
        {rows.length ? (
          <div className="purchase-list">
            {rows.map((p) => {
              const remaining = purchaseBalance(data, p.id),
                paid = purchasePaid(data, p.id),
                status =
                  p.status === "cancelled"
                    ? "Cancelled"
                    : remaining === 0
                      ? "Paid"
                      : p.due_date < now
                        ? "Overdue"
                        : "Upcoming";
              return (
                <article className="purchase-row" key={p.id}>
                  <div className="purchase-identity">
                    <span className="purchase-icon">
                      <CreditCard size={20} />
                    </span>
                    <div>
                      <h3>{p.name}</h3>
                      <p>
                        {p.subscription_id ? "Subscription · " : ""}
                        {p.card || "Card purchase"} · Bought{" "}
                        {dateLabel(p.purchased_on, true)}
                      </p>
                      {p.notes && <p>{p.notes}</p>}
                      <span className={`status ${status.toLowerCase()}`}>
                        {status}
                      </span>
                    </div>
                  </div>
                  <div className="purchase-due">
                    <span>Payment due</span>
                    <strong>{dateLabel(p.due_date)}</strong>
                  </div>
                  <div className="purchase-amount">
                    <strong>{money(remaining, currency)}</strong>
                    <span>
                      {money(paid, currency)} paid of{" "}
                      {money(p.amount, currency)}
                    </span>
                  </div>
                  <div className="purchase-actions">
                    {p.status === "active" && (
                      <>
                        <button
                          className="icon-button"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => onAction("purchase_edit", p.id)}
                        >
                          <Pencil size={16} />
                        </button>
                        {paid === 0 && (
                          <button
                            className="icon-button"
                            aria-label={`Cancel ${p.name}`}
                            onClick={() => onAction("purchase_cancel", p.id)}
                          >
                            <X size={16} />
                          </button>
                        )}
                        {remaining > 0 && (
                          <button
                            className="button secondary"
                            onClick={() => onAction("purchase_pay", p.id)}
                          >
                            Record payment
                            <ArrowRight size={15} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title={
              filter === "paid"
                ? "Paid purchases will appear here."
                : "A little clarity for everyday spending."
            }
            action={
              <button
                className="button primary"
                onClick={() => onAction("purchase_create")}
              >
                <Plus size={16} />
                Add purchase
              </button>
            }
          >
            Add what you bought and when payment is due. Unpaid balances will be
            included in your overview forecast.
          </Empty>
        )}
      </section>
      <p className="fine-print">
        Purchases are separate from savings goals. Bank shows tracked cash, and
        unpaid card balances are obligations. Your overview deducts unpaid
        purchases due in the selected period; future due dates appear when they
        enter that period. Correct a payment by reversing its entry in History.
      </p>
    </>
  );
}

export function PurchaseForm({
  data,
  purchase,
  mode,
  save,
}: {
  data: Snapshot;
  purchase?: Purchase;
  mode: PurchaseAction;
  save: SaveCommand;
}) {
  const now = today(data.settings.timezone),
    currency = data.settings.currency,
    remaining = purchase ? purchaseBalance(data, purchase.id) : 0;
  const [name, setName] = useState(purchase?.name || ""),
    [card, setCard] = useState(purchase?.card || ""),
    [amount, setAmount] = useState(
      String(
        (mode === "purchase_pay" ? remaining : purchase?.amount || 0) / 100,
      ),
    ),
    [bought, setBought] = useState(purchase?.purchased_on || now),
    [due, setDue] = useState(
      purchase?.due_date ||
        (data.settings.credit_due_day
          ? creditDueDate(now, data.settings.credit_due_day)
          : addDays(now, 30)),
    ),
    [notes, setNotes] = useState(purchase?.notes || ""),
    [date, setDate] = useState(now);
  const { submit, busy, error } = useSubmit(save),
    bank = bankBalance(data);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(mode, () =>
      mode === "purchase_cancel"
        ? { purchase_id: purchase!.id }
        : mode === "purchase_pay"
          ? { purchase_id: purchase!.id, amount: parseMoney(amount), date }
          : {
              purchase_id: purchase?.id,
              name,
              card,
              amount: parseMoney(amount),
              purchased_on: bought,
              due_date: due,
              notes,
            },
    );
  }
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      {mode === "purchase_cancel" ? (
        <p>
          Cancel “{purchase?.name}”? This removes its unpaid amount from your
          forecast and preserves the record. No cash moves.
        </p>
      ) : mode === "purchase_pay" ? (
        <>
          <div className="plan-callout">
            <span className="eyebrow">{purchase?.name}</span>
            <strong>
              {money(remaining, currency)}
              <small> outstanding</small>
            </strong>
            <p>Available in Bank: {money(bank, currency)}</p>
          </div>
          <AmountInput
            label={`Payment from Bank (${currency})`}
            value={amount}
            onChange={setAmount}
          />
          <label>
            Payment date
            <input
              type="date"
              required
              min={purchase?.purchased_on}
              max={now}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <p className="form-note">
            Record a payment you have made. This subtracts from Bank and the
            purchase’s unpaid balance, so it isn’t reserved again in the income
            forecast. Add money to Bank first if the payment came from funds you
            haven’t recorded.
          </p>
        </>
      ) : (
        <>
          <label>
            What did you buy?
            <input
              required
              autoFocus
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Groceries, a new desk, a weekend away…"
            />
          </label>
          <label>
            Card or account label <span className="muted">(optional)</span>
            <input
              maxLength={80}
              value={card}
              onChange={(e) => setCard(e.target.value)}
              placeholder="e.g. Everyday Visa · don’t enter a card number"
            />
          </label>
          <AmountInput
            label={`Purchase amount (${currency})`}
            value={amount}
            onChange={setAmount}
          />
          <div className="form-grid">
            <label>
              Purchase date
              <input
                type="date"
                required
                min="2000-01-01"
                max={now}
                value={bought}
                onChange={(e) => {
                  setBought(e.target.value);
                  if (e.target.value && data.settings.credit_due_day)
                    setDue(
                      creditDueDate(
                        e.target.value,
                        data.settings.credit_due_day,
                      ),
                    );
                }}
              />
            </label>
            <label>
              Payment due
              <input
                type="date"
                required
                min={bought}
                max={addDays(now, 36525)}
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
          </div>
          <label>
            Note <span className="muted">(optional)</span>
            <textarea
              maxLength={500}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <p className="form-note">
            Credit due dates default to your chosen day in the month after the
            purchase. Existing due dates stay fixed. The unpaid amount is
            reserved against Bank immediately and in your income forecast when
            its due date is in range. Recording a purchase doesn’t move cash
            from Bank.
          </p>
        </>
      )}
      {mode !== "purchase_pay" &&
        mode !== "purchase_cancel" &&
        data.settings.bank_min != null &&
        (() => {
          let newAmount = 0;
          try {
            newAmount = parseMoney(amount);
          } catch {
            return null;
          }
          const before = bankReserves(data, now).available,
            after =
              before +
              (purchase ? purchaseBalance(data, purchase.id) : 0) -
              newAmount;
          return after < data.settings.bank_min ? (
            <p className="income-warning">
              This purchase leaves {money(after, currency)} after commitments,
              below your preferred Bank minimum of{" "}
              {money(data.settings.bank_min, currency)}. You can still save it.
            </p>
          ) : null;
        })()}
      <ErrorMessage error={error} />
      <button className="button primary full" disabled={busy}>
        {busy
          ? "Saving…"
          : mode === "purchase_pay"
            ? "Record payment"
            : mode === "purchase_cancel"
              ? "Cancel purchase"
              : mode === "purchase_edit"
                ? "Save purchase"
                : "Add purchase"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
