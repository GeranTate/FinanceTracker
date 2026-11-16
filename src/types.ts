export type IncomeSettings = {
  mode: "georgia_2026" | "actual";
  filing_status: "single" | "married_joint" | "head_household";
  retirement_weekly: number;
  benefits_weekly: number;
  post_tax_weekly: number;
  actual_net_monthly: number | null;
};
export type Settings = {
  user_id: string;
  display_name: string;
  currency: string;
  timezone: string;
  hourly_rate: number;
  rate_type: "gross" | "take_home";
  weekly_hours: number | null;
  weekly_budget: number | null;
  income_settings?: IncomeSettings;
  credit_due_day?: number | null;
  bank_min?: number | null;
  bank_max?: number | null;
};
export type Goal = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  category: string;
  color: string;
  start_date: string;
  status: "active" | "acquired" | "archived";
  created_at: string;
  actual_cost: number | null;
  acquired_on: string | null;
};
export type Milestone = {
  id: string;
  goal_id: string;
  user_id: string;
  name: string;
  target: number;
  due_date: string;
  is_primary: boolean;
  baseline_date: string;
  baseline_balance: number;
};
export type Account = {
  id: string;
  user_id: string;
  goal_id: string | null;
  kind: "bank" | "goal";
};
export type Transaction = {
  id: string;
  user_id: string;
  kind: string;
  effective_date: string;
  created_at: string;
  note: string;
  reversal_of: string | null;
  purchase_id?: string | null;
};
export type Subscription = {
  id: string;
  user_id: string;
  name: string;
  card: string;
  amount: number;
  cadence: "week" | "month" | "year";
  anchor_date: string;
  next_charge_date: string;
  occurrence: number;
  status: "active" | "paused";
  created_at: string;
};
export type Purchase = {
  subscription_id?: string | null;
  subscription_charge_date?: string | null;
  id: string;
  user_id: string;
  name: string;
  card: string;
  amount: number;
  purchased_on: string;
  due_date: string;
  notes: string;
  status: "active" | "cancelled";
  created_at: string;
};
export type Entry = {
  id: string;
  user_id: string;
  transaction_id: string;
  account_id: string;
  amount: number;
};
export type Snapshot = {
  settings: Settings;
  goals: Goal[];
  milestones: Milestone[];
  accounts: Account[];
  transactions: Transaction[];
  entries: Entry[];
  purchases?: Purchase[];
  subscriptions?: Subscription[];
};
export type CommandPayload = Record<string, unknown>;
