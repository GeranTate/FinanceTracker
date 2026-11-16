import { useState } from "react";
import { ArrowRight, AlertCircle, Wallet } from "lucide-react";
import type { Snapshot } from "./types";
import { incomeCommitments } from "./lib/recurring";
import { estimateIncome, incomeConfig } from "./lib/income";
import {
  money,
  addDays,
  primarySavings,
  dateLabel,
  today,
} from "./lib/savings";
export default function IncomeOverview({
  data,
  onSettings,
  onPurchases,
}: {
  data: Snapshot;
  onSettings: () => void;
  onPurchases: () => void;
}) {
  const [cadence, setCadence] = useState<"week" | "month">("month");
  const on = today(data.settings.timezone),
    net = estimateIncome(data.settings),
    main = primarySavings(data, on),
    bills = incomeCommitments(data, on, cadence),
    currency = data.settings.currency;
  const commitments = bills.amount;
  const income = cadence === "week" ? net.weekly : net.monthly,
    saving = cadence === "week" ? main.weekly : main.monthly,
    remaining = income - saving - commitments;
  const config = incomeConfig(data.settings),
    taxAnnual = net.federal + net.georgia + net.socialSecurity + net.medicare;
  return (
    <section
      className="income-overview"
      aria-label="Income after savings and purchases"
    >
      <div className="income-header">
        <div>
          <p className="eyebrow">WHAT’S LEFT AFTER YOUR PLANS</p>
          <h2>What’s left after your plans.</h2>
        </div>
        <div className="segmented">
          <button
            className={cadence === "week" ? "selected" : ""}
            onClick={() => setCadence("week")}
          >
            Weekly
          </button>
          <button
            className={cadence === "month" ? "selected" : ""}
            onClick={() => setCadence("month")}
          >
            Monthly
          </button>
        </div>
      </div>
      {!net.ready ? (
        <div className="income-setup">
          <Wallet size={25} />
          <div>
            <h3>Start with what you take home.</h3>
            <p>
              Add your hourly rate and weekly hours, or enter your actual
              monthly take-home pay.
            </p>
          </div>
          <button className="button primary" onClick={onSettings}>
            Set up income
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="income-equation">
            <div>
              <span>Estimated take-home</span>
              <strong>{money(income, currency)}</strong>
              <small>After taxes & payroll deductions</small>
            </div>
            <span className="equation-sign">−</span>
            <div>
              <span>Main-goal savings</span>
              <strong>{money(saving, currency)}</strong>
              <small>
                {main.rows.length} current main milestone
                {main.rows.length === 1 ? "" : "s"} · from today’s balances
              </small>
            </div>
            <span className="equation-sign">−</span>
            <button className="income-bills" onClick={onPurchases}>
              <span>Credit due & subscription charges</span>
              <strong>{money(commitments, currency)}</strong>
              <small>
                Credit due + renewals through{" "}
                {dateLabel(addDays(bills.end, -1), true)}
              </small>
            </button>
            <span className="equation-sign">=</span>
            <div
              className={`income-remaining ${remaining < 0 ? "negative" : ""}`}
            >
              <span>
                {remaining < 0
                  ? "Over your estimated income"
                  : "Left after savings & purchases"}
              </span>
              <strong>{money(remaining, currency)}</strong>
              <small>
                {cadence === "month" ? "Average monthly" : "Weekly"} planning
                estimate · before living expenses
              </small>
            </div>
          </div>
          {remaining < 0 && (
            <p className="income-warning">
              <AlertCircle size={16} />
              Your current savings pace and purchase payments exceed estimated
              take-home by {money(-remaining, currency)}. Adjust amounts or
              dates to make room.
            </p>
          )}
          {main.scheduled > 0 && (
            <p className="fine-print">
              {main.scheduled} scheduled goal
              {main.scheduled === 1 ? " begins" : "s begin"} later. Savings
              deductions start on each goal’s start date.
            </p>
          )}
          <details className="income-details">
            <summary>See the breakdown and assumptions</summary>
            <div className="income-detail-grid">
              <div>
                <h3>Income estimate</h3>
                <p>
                  {net.label}
                  {config.mode === "georgia_2026" &&
                  data.settings.rate_type === "gross"
                    ? " · " + config.filing_status.replaceAll("_", " ")
                    : ""}
                </p>
                {net.gross !== null && (
                  <p>Annual rate-based income: {money(net.gross, currency)}</p>
                )}
                {taxAnnual > 0 && (
                  <>
                    <p>Federal: {money(net.federal, currency)} / year</p>
                    <p>Georgia: {money(net.georgia, currency)} / year</p>
                    <p>
                      Social Security + Medicare:{" "}
                      {money(net.socialSecurity + net.medicare, currency)} /
                      year
                    </p>
                  </>
                )}
                <button className="text-button" onClick={onSettings}>
                  Adjust income settings
                  <ArrowRight size={14} />
                </button>
              </div>
              <div>
                <h3>Required main savings</h3>
                {main.rows.length ? (
                  main.rows.map((r) => (
                    <p key={r.goal.id}>
                      {r.goal.name}
                      <strong>
                        {money(
                          cadence === "week" ? r.weekly : r.monthly,
                          currency,
                        )}
                      </strong>
                    </p>
                  ))
                ) : (
                  <p>No current main contributions required.</p>
                )}
                <p className="fine-print">
                  Each main target is counted once. Catch-up amounts use today’s
                  balance; funded and future-start targets add zero. Stretch
                  targets are optional and excluded.
                </p>
              </div>
            </div>
            <p className="fine-print">
              Monthly income uses annual income ÷ 12. Monthly goal pace uses
              daily catch-up × 7 × 52 ÷ 12, capped at the remaining target;
              overdue targets require their full remainder. Credit includes
              unpaid balances due by {dateLabel(bills.end, true)}, including
              overdue amounts. Subscription charges during the selected week or
              month are reserved even when their credit payment is due later. A
              charge already counted as due credit is included once. Recording
              payments reduces Bank and the unpaid obligation. Living expenses
              and interest are not included.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
