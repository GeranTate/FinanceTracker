import type { Dispatch, SetStateAction } from "react";
import type { IncomeSettings, Settings } from "./types";
import { incomeConfig, TAX_SOURCES, estimateIncome } from "./lib/income";
import { money, parseMoney } from "./lib/savings";
export type IncomeDraft = Omit<
  IncomeSettings,
  | "retirement_weekly"
  | "benefits_weekly"
  | "post_tax_weekly"
  | "actual_net_monthly"
> & {
  retirement_weekly: string;
  benefits_weekly: string;
  post_tax_weekly: string;
  actual_net_monthly: string;
};
export function incomeDraft(settings: Settings): IncomeDraft {
  const c = incomeConfig(settings);
  return {
    ...c,
    retirement_weekly: String(c.retirement_weekly / 100),
    benefits_weekly: String(c.benefits_weekly / 100),
    post_tax_weekly: String(c.post_tax_weekly / 100),
    actual_net_monthly:
      c.actual_net_monthly === null ? "" : String(c.actual_net_monthly / 100),
  };
}
export function parseIncomeDraft(d: IncomeDraft): IncomeSettings {
  return {
    ...d,
    retirement_weekly: parseMoney(d.retirement_weekly || "0"),
    benefits_weekly: parseMoney(d.benefits_weekly || "0"),
    post_tax_weekly: parseMoney(d.post_tax_weekly || "0"),
    actual_net_monthly:
      d.actual_net_monthly === "" ? null : parseMoney(d.actual_net_monthly),
  };
}
export default function IncomeFields({
  draft,
  setDraft,
  settings,
}: {
  draft: IncomeDraft;
  setDraft: Dispatch<SetStateAction<IncomeDraft>>;
  settings: Settings;
}) {
  let preview = null;
  try {
    preview = estimateIncome({
      ...settings,
      income_settings: parseIncomeDraft(draft),
    });
  } catch {
    /* Allow partial amounts while typing. */
  }
  const update = (key: keyof IncomeDraft, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <>
      <div className="settings-section">
        <h3>Your take-home estimate</h3>
        <p>
          What reaches your account, before your goal savings and purchase
          payments.
        </p>
      </div>
      <label>
        Income estimate source
        <select
          value={draft.mode}
          onChange={(e) => update("mode", e.target.value)}
        >
          <option value="georgia_2026">
            Estimate taxes · US / Georgia · 2026
          </option>
          <option value="actual">Use my actual monthly take-home pay</option>
        </select>
      </label>
      {draft.mode === "actual" ? (
        <label>
          Monthly take-home pay ({settings.currency})
          <input
            required
            inputMode="decimal"
            value={draft.actual_net_monthly}
            onChange={(e) => update("actual_net_monthly", e.target.value)}
            placeholder="After all payroll deductions"
          />
        </label>
      ) : settings.rate_type === "take_home" ? (
        <p className="form-note">
          Your hourly rate is already take-home. We won’t subtract taxes or
          payroll deductions a second time.
        </p>
      ) : (
        <>
          <label>
            Filing status
            <select
              value={draft.filing_status}
              onChange={(e) => update("filing_status", e.target.value)}
            >
              <option value="single">Single</option>
              <option value="married_joint">Married filing jointly</option>
              <option value="head_household">Head of household</option>
            </select>
          </label>
          <p className="fine-print">
            US / Georgia (Marietta / East Cobb), tax year 2026. Includes federal
            income tax, Georgia income tax, Social Security and Medicare, using
            standard deductions and this wage income only.
          </p>
          <details className="income-assumptions">
            <summary>Optional payroll deductions</summary>
            <div className="form-stack">
              <label>
                Traditional workplace retirement per week ({settings.currency})
                <input
                  inputMode="decimal"
                  value={draft.retirement_weekly}
                  onChange={(e) => update("retirement_weekly", e.target.value)}
                />
                <small>
                  Reduces estimated income taxes, but not Social Security or
                  Medicare.
                </small>
              </label>
              <label>
                Pre-tax health / Section 125 benefits per week (
                {settings.currency})
                <input
                  inputMode="decimal"
                  value={draft.benefits_weekly}
                  onChange={(e) => update("benefits_weekly", e.target.value)}
                />
                <small>Modeled as exempt from income tax and FICA.</small>
              </label>
              <label>
                Other after-tax payroll deductions per week ({settings.currency}
                )
                <input
                  inputMode="decimal"
                  value={draft.post_tax_weekly}
                  onChange={(e) => update("post_tax_weekly", e.target.value)}
                />
              </label>
            </div>
          </details>
        </>
      )}
      {preview?.ready && (
        <div className="plan-callout">
          <span className="eyebrow">Estimated take-home</span>
          <strong>
            {money(preview.monthly, settings.currency)}
            <small> / average month</small>
          </strong>
          <p>
            {money(preview.weekly, settings.currency)} / week · {preview.label}
          </p>
          {preview.annual < 0 && (
            <p>Deductions exceed income. Review the amounts above.</p>
          )}
        </div>
      )}
      <details className="income-assumptions">
        <summary>Estimate assumptions & sources</summary>
        <p>
          This is a planning estimate of annual taxes spread across 52 weeks /
          12 months, not a paycheck withholding calculation. It excludes other
          household income, tax credits, dependents, itemized deductions,
          age-related deductions, self-employment tax and special deductions.
          Contribution limits are not checked. Use actual take-home pay if your
          paystub is a better guide.
        </p>
        <ul>
          {TAX_SOURCES.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
