import type { Snapshot } from "./types";
import { money, today, dateLabel } from "./lib/savings";
import { bankReserves } from "./lib/recurring";
import { Stat } from "./components";
export default function BankReserves({ data }: { data: Snapshot }) {
  const r = bankReserves(data, today(data.settings.timezone)),
    c = data.settings.currency;
  const min = data.settings.bank_min,
    max = data.settings.bank_max;
  return (
    <section
      className="bank-reserves"
      aria-label="Bank after credit and subscriptions"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">CASH WITH COMMITMENTS COVERED</p>
          <h2>What’s available in Bank</h2>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          featured
          label="TOTAL BANK"
          value={money(r.bank, c)}
          caption="Your tracked cash before unpaid bills"
        />
        <Stat
          label="BANK − UNPAID CREDIT"
          value={money(r.afterCredit, c)}
          caption={`${money(r.credit, c)} reserved for everyday purchases, all due dates`}
        />
        <Stat
          label="BANK − CREDIT − SUBSCRIPTIONS"
          value={money(r.available, c)}
          caption={`${money(r.subscriptions, c)} in subscription commitments`}
        />
      </div>
      <p className="fine-print">
        Subscription commitments include {money(r.subscriptionCredit, c)} of
        issued unpaid charges plus {money(r.upcoming, c)} of renewals through{" "}
        {dateLabel(r.end, true)}. Once a renewal becomes a purchase, it stays in
        this subscription total and is counted once. Payments reduce cash and
        the matching obligation together.
      </p>
      {min != null && r.available < min && (
        <p className="bank-range-warning" role="status">
          Below your preferred minimum: {money(r.available, c)} available after
          commitments versus {money(min, c)} minimum. Consider reducing spending
          or adding to Bank. This is guidance only.
        </p>
      )}
      {max != null && r.available > max && (
        <p className="bank-range-opportunity" role="status">
          Room to save more: Bank is {money(r.available - max, c)} above your
          preferred maximum of {money(max, c)} after commitments. You can
          allocate more to goals if you want.
        </p>
      )}
      {r.available < 0 && (
        <p className="income-warning">
          Your reserved commitments exceed Bank by {money(-r.available, c)}.
        </p>
      )}
    </section>
  );
}
