export type Settings = {
  user_id: string;
  display_name: string;
  currency: string;
  timezone: string;
  hourly_rate: number;
  rate_type: "gross" | "take_home";
  weekly_hours: number | null;
  weekly_budget: number | null;
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
};
export type CommandPayload = Record<string, unknown>;
