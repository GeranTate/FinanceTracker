import type { IncomeSettings, Settings } from "../types";

export const INCOME_DEFAULTS: IncomeSettings = {
  mode: "georgia_2026",
  filing_status: "single",
  retirement_weekly: 0,
  benefits_weekly: 0,
  post_tax_weekly: 0,
  actual_net_monthly: null,
};
export const TAX_SOURCES = [
  {
    name: "2026 federal brackets & standard deductions",
    url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
  },
  {
    name: "Georgia 2026 income tax updates",
    url: "https://dor.georgia.gov/taxes/important-tax-updates",
  },
  {
    name: "Social Security wage base & employee rate",
    url: "https://www.ssa.gov/OACT/COLA/cbb.html",
  },
  {
    name: "Medicare & Additional Medicare",
    url: "https://www.irs.gov/taxtopics/tc560",
  },
];
// Tax-year-specific tables, checked against the sources above on 2026-11-16.
const TABLES = {
  single: {
    deduction: 16100,
    thresholds: [12400, 50400, 105700, 201775, 256225, 640600],
    gaDeduction: 15000,
    additionalMedicare: 200000,
  },
  married_joint: {
    deduction: 32200,
    thresholds: [24800, 100800, 211400, 403550, 512450, 768700],
    gaDeduction: 30000,
    additionalMedicare: 250000,
  },
  head_household: {
    deduction: 24150,
    thresholds: [17700, 67450, 105700, 201750, 256200, 640600],
    gaDeduction: 15000,
    additionalMedicare: 200000,
  },
} as const;
export function incomeConfig(settings: Settings): IncomeSettings {
  return { ...INCOME_DEFAULTS, ...settings.income_settings };
}
export function federalIncomeTax(
  taxableCents: number,
  status: IncomeSettings["filing_status"],
) {
  const thresholds = [...TABLES[status].thresholds, Infinity];
  const rates = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  let last = 0,
    tax = 0;
  thresholds.forEach((top, i) => {
    tax += Math.max(0, Math.min(taxableCents, top * 100) - last) * rates[i];
    last = top * 100;
  });
  return Math.round(tax);
}
export function estimateIncome(settings: Settings) {
  const config = incomeConfig(settings);
  const gross =
    settings.weekly_hours === null
      ? null
      : Math.round(settings.hourly_rate * settings.weekly_hours * 52);
  const base = {
    gross,
    federal: 0,
    georgia: 0,
    socialSecurity: 0,
    medicare: 0,
    retirement: 0,
    benefits: 0,
    postTax: 0,
  };
  if (config.mode === "actual" && config.actual_net_monthly !== null) {
    const annual = config.actual_net_monthly * 12;
    return {
      ...base,
      annual,
      weekly: Math.round(annual / 52),
      monthly: config.actual_net_monthly,
      ready: true,
      label: "Your entered take-home pay",
      warning: null,
    };
  }
  if (gross === null || settings.hourly_rate <= 0)
    return {
      ...base,
      annual: 0,
      weekly: 0,
      monthly: 0,
      ready: false,
      label: "Add your income in Settings",
      warning: null,
    };
  if (settings.rate_type === "take_home") {
    return {
      ...base,
      annual: gross,
      weekly: Math.round(gross / 52),
      monthly: Math.round(gross / 12),
      ready: true,
      label: "From your take-home hourly rate",
      warning: null,
    };
  }
  if (settings.currency !== "USD")
    return {
      ...base,
      annual: 0,
      weekly: 0,
      monthly: 0,
      ready: false,
      label: "Enter actual take-home pay for this currency",
      warning: null,
    };
  const t = TABLES[config.filing_status];
  const benefits = config.benefits_weekly * 52,
    retirement = config.retirement_weekly * 52,
    postTax = config.post_tax_weekly * 52;
  const incomeWages = Math.max(0, gross - benefits - retirement),
    ficaWages = Math.max(0, gross - benefits);
  const federal = federalIncomeTax(
    Math.max(0, incomeWages - t.deduction * 100),
    config.filing_status,
  );
  const georgia = Math.round(
    Math.max(0, incomeWages - t.gaDeduction * 100) * 0.0499,
  );
  const socialSecurity = Math.round(Math.min(ficaWages, 18450000) * 0.062);
  const medicare = Math.round(
    ficaWages * 0.0145 +
      Math.max(0, ficaWages - t.additionalMedicare * 100) * 0.009,
  );
  const annual =
    gross -
    benefits -
    retirement -
    postTax -
    federal -
    georgia -
    socialSecurity -
    medicare;
  return {
    gross,
    federal,
    georgia,
    socialSecurity,
    medicare,
    retirement,
    benefits,
    postTax,
    annual,
    weekly: Math.round(annual / 52),
    monthly: Math.round(annual / 12),
    ready: true,
    label: `Georgia · ${config.filing_status === "single" ? "Single" : config.filing_status === "married_joint" ? "Married jointly" : "Head of household"} · 2026 estimate`,
    warning:
      annual < 0
        ? "Your payroll deductions exceed your estimated take-home income."
        : null,
  };
}
