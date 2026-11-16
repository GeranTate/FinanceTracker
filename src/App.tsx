import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  Wallet,
  X,
  AlertCircle,
  History,
  CreditCard,
  Undo2,
} from "lucide-react";
import type { Goal, Snapshot } from "./types";
import { command, configured, loadSnapshot, supabase } from "./lib/api";
import {
  bankBalance,
  capacity,
  dateLabel,
  goalBalance,
  money,
  plan,
  requiredWeekly,
  today,
} from "./lib/savings";
import { makeDemo } from "./lib/demo";
import {
  downloadJson,
  Empty,
  GoalIcon,
  Modal,
  Stat,
  Status,
} from "./components";
import { GoalForm, MoneyForm, SettingsForm, type SaveCommand } from "./forms";
import Chart from "./Chart";
import IncomeOverview from "./IncomeOverview";
import Purchases, { PurchaseForm } from "./Purchases";
import GoalDetail from "./GoalDetail";

type Page =
  | "overview"
  | "goals"
  | "bank"
  | "purchases"
  | "history"
  | "settings";
type DialogState = {
  kind:
    | "purchase_create"
    | "purchase_edit"
    | "purchase_pay"
    | "purchase_cancel"
    | "create"
    | "detail"
    | "edit"
    | "deposit"
    | "transfer"
    | "spend"
    | "acquire"
    | "reverse"
    | "archive"
    | "help";
  id?: string;
} | null;
const pages = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "goals", label: "My goals", icon: Target },
  { id: "bank", label: "Bank", icon: Wallet },
  { id: "purchases", label: "Purchases", icon: CreditCard },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
] as const;
function Brand() {
  return (
    <div className="brand">
      <span>
        <BarChart3 size={23} />
      </span>
      <div>
        Finance Tracker<small>A LITTLE MORE INTENTION</small>
      </div>
    </div>
  );
}

function Login({
  onDemo,
  recovery,
}: {
  onDemo: () => void;
  recovery: boolean;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reset, setReset] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!configured)
        throw new Error(
          "Add the Supabase URL and publishable key to .env.local, then restart the app.",
        );
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        window.history.replaceState(null, "", window.location.pathname);
        window.location.reload();
      } else if (reset) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setNotice(
          "If this account exists, a password reset link is on its way.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <section className="login-story">
        <Brand />
        <div>
          <p className="eyebrow">SMALL STEPS. REAL POSSIBILITIES.</p>
          <h1>
            Make room for
            <br />
            what <em>matters.</em>
          </h1>
          <p>
            A place of your own. A long-awaited trip.
            <br />A little more peace of mind.
          </p>
          <p>Give your savings a purpose, and a plan.</p>
          <div className="login-art" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <i>
              <Sparkles size={33} strokeWidth={1.1} />
            </i>
          </div>
        </div>
        <p className="login-footer">
          Your pace. Your priorities. Your next chapter.
        </p>
      </section>
      <main className="login-panel">
        <div className="login-card">
          <span className="login-mark">
            <ShieldCheck size={25} strokeWidth={1.5} />
          </span>
          <p className="eyebrow">YOUR PERSONAL SAVINGS SPACE</p>
          <h2>
            {recovery
              ? "A fresh start."
              : reset
                ? "Let’s get you back in."
                : "Welcome back."}
          </h2>
          <p className="muted">
            {recovery
              ? "Choose a new password for your account."
              : reset
                ? "Enter your email to request a reset link."
                : "A little closer to your goals starts here."}
          </p>
          <form className="form-stack" onSubmit={submit}>
            {!recovery && (
              <label>
                Email address
                <input
                  autoFocus
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            )}
            {(!reset || recovery) && (
              <label>
                {recovery ? "New password" : "Password"}
                <input
                  type="password"
                  autoComplete={recovery ? "new-password" : "current-password"}
                  minLength={recovery ? 8 : undefined}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="form-success" role="status">
                {notice}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "One moment…"
                : recovery
                  ? "Save password"
                  : reset
                    ? "Send reset link"
                    : "Sign in"}
              <ArrowRight size={17} />
            </button>
            {!recovery && (
              <button
                type="button"
                className="text-button centered"
                onClick={() => {
                  setReset(!reset);
                  setError("");
                  setNotice("");
                }}
              >
                {reset ? "Back to sign in" : "Forgot your password?"}
              </button>
            )}
          </form>
          <div className="login-note">
            <ShieldCheck size={15} />
            <span>Private by design. Your goals belong to you.</span>
          </div>
          {import.meta.env.DEV && (
            <button className="demo-button" onClick={onDemo}>
              Explore a read-only demo <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
function GoalCard({
  goal,
  data,
  onOpen,
  onDeposit,
}: {
  goal: Goal;
  data: Snapshot;
  onOpen: () => void;
  onDeposit: () => void;
}) {
  const m = data.milestones.find((m) => m.goal_id === goal.id && m.is_primary);
  if (!m) return null;
  const balance = goalBalance(data, goal.id),
    p = plan(m, balance, today(data.settings.timezone)),
    currency = data.settings.currency;
  const stretch = data.milestones
    .filter((m) => m.goal_id === goal.id && !m.is_primary && m.target > balance)
    .sort((a, b) => a.target - b.target)[0];
  return (
    <article className="goal-card">
      <div className="goal-card-top">
        <GoalIcon category={goal.category} color={goal.color} />
        <Status
          value={
            goal.status === "active"
              ? p.status
              : goal.status === "acquired"
                ? "Acquired"
                : "Archived"
          }
        />
      </div>
      <button className="goal-title" onClick={onOpen}>
        <h3>{goal.name}</h3>
        <ChevronRight size={18} />
      </button>
      <p className="goal-description">
        {goal.description ||
          `A little closer to your next ${goal.category.toLowerCase()} goal.`}
      </p>
      <div className="goal-amount">
        <strong>
          {money(
            goal.status === "acquired" ? goal.actual_cost || 0 : balance,
            currency,
          )}
        </strong>
        <span>
          {goal.status === "acquired"
            ? "actual purchase price"
            : `of ${money(m.target, currency, true)}`}
        </span>
      </div>
      <div className="progress-track">
        <span
          style={{
            width: `${goal.status === "acquired" ? 100 : p.progress}%`,
            background: `var(--${goal.color})`,
          }}
        />
      </div>
      <div className="progress-caption">
        <span>
          {goal.status === "acquired"
            ? "Made it yours"
            : `${Math.round(p.progress)}% saved`}
        </span>
        <span>{dateLabel(goal.acquired_on || m.due_date, true)}</span>
      </div>
      <div className="goal-card-footer">
        <div>
          <strong>
            {goal.status !== "active"
              ? "History preserved"
              : p.status === "Scheduled"
                ? dateLabel(goal.start_date, true)
                : p.funded
                  ? stretch
                    ? money(
                        plan(stretch, balance, today(data.settings.timezone))
                          .weekly,
                        currency,
                      )
                    : "Ready to acquire"
                  : p.daysLeft <= 0
                    ? "Past due date"
                    : money(p.weekly, currency)}
          </strong>
          <span>
            {goal.status !== "active"
              ? "View this goal’s story"
              : p.status === "Scheduled"
                ? "Saving starts then"
                : p.funded
                  ? stretch
                    ? "/ week to next milestone"
                    : "You made it happen"
                  : "/ week from today"}
          </span>
        </div>
        <button
          className="icon-button add-goal-saving"
          aria-label={
            goal.status === "active"
              ? `Add savings to ${goal.name}`
              : `View ${goal.name}`
          }
          disabled={goal.status === "active" && p.status === "Scheduled"}
          title={
            p.status === "Scheduled"
              ? `Saving starts ${dateLabel(goal.start_date)}`
              : undefined
          }
          onClick={onDeposit}
        >
          {goal.status === "active" ? (
            <Plus size={20} />
          ) : (
            <ChevronRight size={20} />
          )}
        </button>
      </div>
      {data.milestones.filter((m) => m.goal_id === goal.id).length > 1 && (
        <button className="milestone-link" onClick={onOpen}>
          <Sparkles size={13} />
          {data.milestones.filter((m) => m.goal_id === goal.id).length}{" "}
          milestones, one shared balance
          <ArrowRight size={13} />
        </button>
      )}
    </article>
  );
}
function Activity({
  data,
  limit,
  bankOnly = false,
  onReverse,
}: {
  data: Snapshot;
  limit?: number;
  bankOnly?: boolean;
  onReverse: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [visible, setVisible] = useState(30);
  const currency = data.settings.currency,
    bank = data.accounts.find((a) => a.kind === "bank");
  const reversed = new Set(
    data.transactions.map((t) => t.reversal_of).filter(Boolean),
  );
  const rows = data.transactions
    .filter(
      (t) =>
        (!bankOnly ||
          data.entries.some(
            (e) => e.transaction_id === t.id && e.account_id === bank?.id,
          )) &&
        (!query ||
          (t.note + " " + t.kind).toLowerCase().includes(query.toLowerCase())),
    )
    .sort(
      (a, b) =>
        b.effective_date.localeCompare(a.effective_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  return (
    <>
      {!limit && (
        <label className="search-field">
          <span className="sr-only">Search transactions</span>
          <input
            type="search"
            placeholder="Search your activity…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(30);
            }}
          />
        </label>
      )}
      {!rows.length ? (
        <Empty title="A fresh page">
          Your savings, transfers, and purchases will appear here.
        </Empty>
      ) : (
        <div className="activity-list">
          {rows.slice(0, limit || visible).map((t) => {
            const entries = data.entries.filter(
              (e) => e.transaction_id === t.id,
            );
            const amount = bankOnly
              ? entries
                  .filter((e) => e.account_id === bank?.id)
                  .reduce((s, e) => s + e.amount, 0)
              : entries.reduce((s, e) => s + e.amount, 0);
            const isTransfer =
              t.kind === "transfer" || (t.kind === "opening" && amount === 0);
            const closed = entries.some((e) => {
              const a = data.accounts.find((a) => a.id === e.account_id);
              return (
                a?.goal_id &&
                data.goals.find((g) => g.id === a.goal_id)?.status !== "active"
              );
            });
            const Icon = isTransfer
              ? ArrowRightLeft
              : t.kind === "acquire"
                ? ShoppingBag
                : amount < 0
                  ? ArrowUpRight
                  : ArrowDownLeft;
            return (
              <div className="activity-row" key={t.id}>
                <span
                  className={`activity-icon ${amount < 0 ? "outgoing" : ""}`}
                >
                  <Icon size={18} />
                </span>
                <div className="activity-description">
                  <strong>{t.note || t.kind}</strong>
                  <span>
                    {t.kind[0].toUpperCase() + t.kind.slice(1)}
                    {reversed.has(t.id) ? " · reversed" : ""}
                    {isTransfer ? " · moved between accounts" : ""}
                  </span>
                </div>
                <time dateTime={t.effective_date}>
                  {dateLabel(t.effective_date, true)}
                </time>
                <strong
                  className={`activity-amount ${amount > 0 ? "positive" : ""}`}
                >
                  {isTransfer && !bankOnly
                    ? "↔ " +
                      money(
                        Math.max(0, ...entries.map((e) => e.amount)),
                        currency,
                      )
                    : (amount > 0 ? "+" : "") + money(amount, currency)}
                </strong>
                {!limit &&
                  !reversed.has(t.id) &&
                  !closed &&
                  !["acquire", "reversal"].includes(t.kind) && (
                    <button
                      className="icon-button"
                      aria-label={`Reverse ${t.note || t.kind}`}
                      onClick={() => onReverse(t.id)}
                    >
                      <Undo2 size={15} />
                    </button>
                  )}
              </div>
            );
          })}
        </div>
      )}
      {!limit && rows.length > visible && (
        <button
          className="text-button"
          onClick={() => setVisible(visible + 30)}
        >
          Show more activity
        </button>
      )}
    </>
  );
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(false),
    [recovery, setRecovery] = useState(false);
  const [data, setData] = useState<Snapshot | null>(null),
    [demo, setDemo] = useState(false),
    [page, setPage] = useState<Page>("overview"),
    [dialog, setDialog] = useState<DialogState>(null);
  const [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(""),
    [toast, setToast] = useState(""),
    [filter, setFilter] = useState("active");
  const generation = useRef(0);
  const closeDialog = useCallback(() => setDialog(null), []);
  useEffect(() => {
    let alive = true;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (alive) {
          setSession(data.session);
          setAuthReady(true);
          if (error) setLoadError(error.message);
        }
      })
      .catch((e) => {
        if (alive) {
          setAuthReady(true);
          setLoadError(e.message);
        }
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, current) => {
      if (alive) {
        setSession(current);
        setAuthReady(true);
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setLoadError("");
    try {
      const snapshot = await loadSnapshot();
      if (request === generation.current) setData(snapshot);
    } catch (e) {
      if (request === generation.current) setLoadError((e as Error).message);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (session && !demo) void refresh();
    else if (!demo) {
      generation.current++;
      setData(null);
    }
  }, [session?.user.id, demo, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!session || demo) return;
    const recheck = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    const timer = setInterval(() => void refresh(), 60000);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
      clearInterval(timer);
    };
  }, [session?.user.id, demo, refresh]);
  const save: SaveCommand = async (action, payload, id) => {
    if (demo)
      throw new Error(
        "This is a read-only demo. Sign in to save your own goals.",
      );
    await command(action, payload, id);
    const snapshot = await loadSnapshot();
    setData(snapshot);
    setDialog(null);
    setToast(
      action === "settings"
        ? "Settings saved."
        : action === "acquire"
          ? "Made it yours. Your Bank balance has been settled."
          : action === "reverse"
            ? "Transaction reversed. History preserved."
            : "Saved. One step closer.",
    );
  };
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) setToast(error.message);
  }
  if (!authReady)
    return (
      <div className="loading-screen">
        <Brand />
        <p>Making a little space…</p>
      </div>
    );
  if ((!session && !demo) || recovery)
    return (
      <Login
        recovery={recovery}
        onDemo={() => {
          setDemo(true);
          setData(makeDemo());
        }}
      />
    );
  if (!data)
    return (
      <div className="loading-screen">
        <Brand />
        {loadError ? (
          <>
            <div className="setup-error" role="alert">
              <h2>We couldn’t load your savings.</h2>
              <p>{loadError}</p>
              <p>
                If this is your first visit, make sure the database setup has
                been run in Supabase.
              </p>
            </div>
            <div className="button-row">
              <button className="button primary" onClick={() => void refresh()}>
                Try again
              </button>
              <button
                className="button secondary"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          <p>Getting your goals together…</p>
        )}
      </div>
    );
  const currency = data.settings.currency,
    now = today(data.settings.timezone),
    active = data.goals.filter((g) => g.status === "active");
  const balances = Object.fromEntries(
      data.goals.map((g) => [g.id, goalBalance(data, g.id)]),
    ),
    saved = Object.values(balances).reduce((s, b) => s + b, 0),
    bank = bankBalance(data);
  const requirement = requiredWeekly(
      data.goals,
      data.milestones.filter((m) => m.is_primary),
      balances,
      now,
    ),
    limit = capacity(data.settings);
  const behind = active.filter((g) => {
    const m = data.milestones.find((m) => m.goal_id === g.id && m.is_primary);
    return (
      m && ["Behind", "Overdue"].includes(plan(m, balances[g.id], now).status)
    );
  }).length;
  const selected = dialog?.id
    ? data.goals.find((g) => g.id === dialog.id)
    : undefined;
  const acquired = data.goals.filter((g) => g.status === "acquired");
  const onAction = (action: string, id: string) =>
    setDialog({ kind: action as NonNullable<DialogState>["kind"], id });
  const heading =
    page === "overview"
      ? data.settings.display_name
        ? `Your next chapter, ${data.settings.display_name}.`
        : "Your next chapter starts here."
      : page === "goals"
        ? "Good things take a little planning."
        : page === "purchases"
          ? "Make room for everyday life."
          : page === "bank"
            ? "A little room for possibility."
            : page === "history"
              ? "Look how far you’ve come."
              : "A plan that fits your life.";
  const subheading =
    page === "overview"
      ? "Every little bit adds up. Here’s where you stand."
      : page === "goals"
        ? "Give what matters a place in your plans."
        : page === "purchases"
          ? "Know what you owe, and when it needs a place in your budget."
          : page === "bank"
            ? "Your unallocated savings, ready for whatever comes next."
            : page === "history"
              ? "Every contribution, every decision, every milestone."
              : "Set your pace. We’ll help you keep it realistic.";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav aria-label="Main navigation">
          {pages.map((p) => (
            <button
              key={p.id}
              className={page === p.id ? "active" : ""}
              onClick={() => setPage(p.id)}
            >
              <p.icon size={19} strokeWidth={1.7} />
              {p.label}
              {p.id === "goals" && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={18} />
            </span>
            <strong>Progress, at your pace.</strong>
            <p>A small step today is still a step forward.</p>
          </div>
          <button
            className="help-button"
            onClick={() => setDialog({ kind: "help" })}
          >
            <CircleHelp size={17} />A little guidance
            <ArrowUpRight size={14} />
          </button>
          <div className="user-profile">
            <span>
              {(data.settings.display_name ||
                session?.user.email ||
                "G")[0].toUpperCase()}
            </span>
            <div>
              <strong>{data.settings.display_name || "My workspace"}</strong>
              <small>
                {demo ? "Sample data · read only" : "Personal account"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={demo ? "Leave demo" : "Sign out"}
              onClick={() => {
                if (demo) {
                  setDemo(false);
                  setData(null);
                } else void signOut();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            My workspace <ChevronRight size={13} />
            <strong>{pages.find((p) => p.id === page)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="private-label">
              <ShieldCheck size={14} />
              {demo ? "DEMO WORKSPACE" : "PRIVATE & PERSONAL"}
            </span>
            <button
              className={`icon-button ${loading ? "refreshing" : ""}`}
              aria-label="Refresh savings"
              onClick={() =>
                demo
                  ? setToast("Demo balances are sample data.")
                  : void refresh()
              }
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            You’re exploring sample data. Nothing here is connected to your real
            savings.
            <button
              onClick={() => {
                setDemo(false);
                setData(null);
              }}
            >
              Back to sign in <ArrowRight size={14} />
            </button>
          </div>
        )}
        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === "overview"
                  ? "THE BIG PICTURE"
                  : page === "goals"
                    ? "SOMETHING TO LOOK FORWARD TO"
                    : page === "purchases"
                      ? "EVERYDAY SPENDING"
                      : page === "bank"
                        ? "YOUR EVERYDAY RESERVE"
                        : page === "history"
                          ? "EVERY STEP COUNTS"
                          : "MAKE IT YOURS"}
              </p>
              <h1>{heading}</h1>
              <p>{subheading}</p>
            </div>
            {page !== "settings" && (
              <button
                className="button primary"
                onClick={() =>
                  setDialog({
                    kind:
                      page === "purchases"
                        ? "purchase_create"
                        : page === "bank"
                          ? "deposit"
                          : "create",
                  })
                }
              >
                <Plus size={17} />
                {page === "purchases"
                  ? "Add purchase"
                  : page === "bank"
                    ? "Add savings"
                    : "New goal"}
              </button>
            )}
          </div>
          {loadError && (
            <div className="inline-alert" role="alert">
              <AlertCircle size={17} />
              <span>
                Could not refresh: {loadError}. Displayed balances may be out of
                date.
              </span>
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {(page === "overview" || page === "bank") && (
            <div className="stats-grid">
              <Stat
                featured
                label={
                  page === "bank" ? "AVAILABLE IN BANK" : "SAVED TOWARD GOALS"
                }
                value={money(page === "bank" ? bank : saved, currency)}
                caption={
                  page === "bank"
                    ? "Ready to allocate or spend"
                    : `Across ${active.length} active goal${active.length === 1 ? "" : "s"}`
                }
              />
              <Stat
                label={
                  page === "bank" ? "ALLOCATED TO GOALS" : "AVAILABLE IN BANK"
                }
                value={money(page === "bank" ? saved : bank, currency)}
                caption={
                  page === "bank"
                    ? "Working toward what matters"
                    : "A little flexibility for what’s next"
                }
              />
              <Stat
                label="TOTAL TRACKED CASH"
                value={money(saved + bank, currency)}
                caption="Goal savings + your Bank balance"
              />
            </div>
          )}
          {page === "purchases" && (
            <Purchases
              data={data}
              onAction={(kind, id) => setDialog({ kind, id })}
            />
          )}
          {page === "overview" && (
            <>
              <IncomeOverview
                data={data}
                onSettings={() => setPage("settings")}
                onPurchases={() => setPage("purchases")}
              />
              <div className="overview-grid">
                <section className="panel chart-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Your savings, taking shape</h2>
                      <p>Today’s small steps. Tomorrow’s possibilities.</p>
                    </div>
                  </div>
                  <Chart data={data} />
                </section>
                <section className="pace-panel">
                  <span className="pace-decoration" aria-hidden="true">
                    <Sparkles size={42} strokeWidth={0.8} />
                  </span>
                  <p className="eyebrow">A PACE WITH PURPOSE</p>
                  <h2>
                    {money(requirement.weekly, currency)}
                    <span>per week</span>
                  </h2>
                  <p>
                    Peak pace for main milestones across your goals, including
                    future starts. Stretch milestones stay optional.
                  </p>
                  <div className="pace-divider" />
                  {limit ? (
                    <div
                      className={`pace-status ${requirement.weekly > limit.amount ? "needs-attention" : ""}`}
                    >
                      {requirement.weekly > limit.amount ? (
                        <AlertCircle size={18} />
                      ) : (
                        <Check size={18} />
                      )}
                      <span>
                        {requirement.weekly > limit.amount
                          ? "A little beyond your budget"
                          : "Within your current limit"}
                        <small>
                          {money(limit.amount, currency)} {limit.label}
                        </small>
                      </span>
                    </div>
                  ) : (
                    <button
                      className="pace-settings"
                      onClick={() => setPage("settings")}
                    >
                      Set your savings budget
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {requirement.overdue > 0 && (
                    <p className="overdue-note">
                      {money(requirement.overdue, currency)} remains on overdue
                      milestones.
                    </p>
                  )}
                </section>
              </div>
              {behind > 0 && (
                <div className="gentle-notice">
                  <span className="notice-dot" />
                  <p>
                    <strong>
                      {behind} goal{behind === 1 ? " needs" : "s need"} a little
                      attention.
                    </strong>{" "}
                    A catch-up contribution or a new date can help you find your
                    pace.
                  </p>
                  <button onClick={() => setPage("goals")}>
                    View goals
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <div className="section-heading">
                <div>
                  <p className="eyebrow">WHAT YOU’RE WORKING TOWARD</p>
                  <h2>
                    A future worth saving for <span>{active.length}</span>
                  </h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => setPage("goals")}
                >
                  All goals
                  <ArrowRight size={16} />
                </button>
              </div>
              {active.length ? (
                <div className="goals-grid">
                  {active.slice(0, 3).map((g) => (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      data={data}
                      onOpen={() => setDialog({ kind: "detail", id: g.id })}
                      onDeposit={() => setDialog({ kind: "deposit", id: g.id })}
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  title="What’s your next chapter?"
                  action={
                    <button
                      className="button primary"
                      onClick={() => setDialog({ kind: "create" })}
                    >
                      <Plus size={17} />
                      Create your first goal
                    </button>
                  }
                >
                  Start with something that matters to you. We’ll help turn it
                  into a weekly plan.
                </Empty>
              )}
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-header">
                    <h2>The latest little steps</h2>
                    <button
                      className="text-button"
                      onClick={() => setPage("history")}
                    >
                      All activity
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <Activity
                    data={data}
                    limit={4}
                    onReverse={(id) => setDialog({ kind: "reverse", id })}
                  />
                </section>
                <section className="bank-callout">
                  <span className="bank-symbol">
                    <Wallet size={25} strokeWidth={1.3} />
                  </span>
                  <p className="eyebrow">A LITTLE BREATHING ROOM</p>
                  <h2>Meet your Bank.</h2>
                  <p>
                    Money without a goal still has a place. Keep it here until
                    you know what’s next.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setPage("bank")}
                  >
                    Go to Bank
                    <ArrowRight size={16} />
                  </button>
                </section>
              </div>
            </>
          )}
          {page === "goals" && (
            <>
              <div className="filter-bar">
                <div className="segmented">
                  {["active", "acquired", "archived"].map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "selected" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f[0].toUpperCase() + f.slice(1)}{" "}
                      <span>
                        {data.goals.filter((g) => g.status === f).length}
                      </span>
                    </button>
                  ))}
                </div>
                <span className="muted">
                  One plan. A little progress at a time.
                </span>
              </div>
              {data.goals.some((g) => g.status === filter) ? (
                <div className="goals-grid">
                  {data.goals
                    .filter((g) => g.status === filter)
                    .map((g) => (
                      <GoalCard
                        key={g.id}
                        goal={g}
                        data={data}
                        onOpen={() => setDialog({ kind: "detail", id: g.id })}
                        onDeposit={() =>
                          setDialog({
                            kind: g.status === "active" ? "deposit" : "detail",
                            id: g.id,
                          })
                        }
                      />
                    ))}
                </div>
              ) : (
                <Empty
                  title={
                    filter === "active"
                      ? "Give your savings a purpose."
                      : filter === "acquired"
                        ? "Your future wins live here."
                        : "A place for paused plans."
                  }
                >
                  {filter === "active"
                    ? "Create a goal with an amount and a date to see your plan."
                    : "Your goal history will be kept here when you’re ready."}
                </Empty>
              )}
            </>
          )}
          {page === "bank" && (
            <>
              <div className="bank-toolbar">
                <div>
                  <h2>Ready when you are.</h2>
                  <p>
                    Allocate existing savings or record spending from your Bank.
                  </p>
                </div>
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() => setDialog({ kind: "transfer" })}
                  >
                    <ArrowRightLeft size={16} />
                    Transfer
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setDialog({ kind: "spend" })}
                  >
                    <ArrowUpRight size={16} />
                    Record spending
                  </button>
                </div>
              </div>
              <section className="panel">
                <div className="panel-header">
                  <h2>Bank activity</h2>
                  <span className="muted">Deposits, transfers & spending</span>
                </div>
                <Activity
                  data={data}
                  bankOnly
                  onReverse={(id) => setDialog({ kind: "reverse", id })}
                />
              </section>
            </>
          )}
          {page === "history" && (
            <>
              <div className="history-summary">
                <ShoppingBag size={21} />
                <span>
                  <strong>
                    {acquired.length} goal{acquired.length === 1 ? "" : "s"}{" "}
                    acquired
                  </strong>{" "}
                  ·{" "}
                  {money(
                    acquired.reduce((sum, g) => sum + (g.actual_cost || 0), 0),
                    currency,
                  )}{" "}
                  in recorded purchases
                </span>
                <button
                  className="text-button"
                  onClick={() => downloadJson(data)}
                >
                  <Download size={15} />
                  Export my data
                </button>
              </div>
              <section className="panel">
                <div className="panel-header">
                  <h2>Your savings story</h2>
                  <span className="muted">Full transaction history</span>
                </div>
                <Activity
                  data={data}
                  onReverse={(id) => setDialog({ kind: "reverse", id })}
                />
              </section>
            </>
          )}
          {page === "settings" && (
            <div className="settings-layout">
              <section className="panel">
                <SettingsForm
                  key={JSON.stringify(data.settings)}
                  data={data}
                  save={save}
                />
              </section>
              <aside className="settings-aside">
                <ShieldCheck size={25} strokeWidth={1.4} />
                <h3>A space of your own.</h3>
                <p>
                  Your settings and savings belong to your signed-in account.
                  Every goal keeps a history of its contributions and plans.
                </p>
                <button
                  className="button secondary"
                  onClick={() => downloadJson(data)}
                >
                  <Download size={16} />
                  Export my data
                </button>
                <p className="fine-print">
                  Export includes your balances, transaction entries, goals,
                  milestones, purchases, income settings and previous plans.
                </p>
              </aside>
            </div>
          )}
          <footer className="page-footer">
            <span>Made for the things that matter.</span>
            <span>
              <span className="connection-dot" />
              {demo
                ? "Demo data · nothing is saved"
                : loading
                  ? "Refreshing your savings…"
                  : "Connected to your savings"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {dialog && (
        <Modal
          title={
            dialog.kind === "purchase_create"
              ? "Plan for a purchase."
              : dialog.kind === "purchase_edit"
                ? "Update this purchase."
                : dialog.kind === "purchase_pay"
                  ? "Record a payment."
                  : dialog.kind === "purchase_cancel"
                    ? "Cancel this purchase?"
                    : dialog.kind === "create"
                      ? "Something to look forward to."
                      : dialog.kind === "detail"
                        ? selected?.name || "Your goal"
                        : dialog.kind === "edit"
                          ? "Find a new pace."
                          : dialog.kind === "deposit"
                            ? "A little closer."
                            : dialog.kind === "transfer"
                              ? "Give your savings a direction."
                              : dialog.kind === "spend"
                                ? "Record a little of life."
                                : dialog.kind === "acquire"
                                  ? "Make it yours."
                                  : dialog.kind === "reverse"
                                    ? "Correct this entry?"
                                    : dialog.kind === "archive"
                                      ? "Make room for a new plan?"
                                      : "A little guidance."
          }
          eyebrow={
            dialog.kind === "detail"
              ? selected?.category
              : "YOUR SAVINGS, WITH INTENTION"
          }
          onClose={closeDialog}
        >
          {dialog.kind.startsWith("purchase_") && (
            <PurchaseForm
              data={data}
              purchase={data.purchases?.find((p) => p.id === dialog.id)}
              mode={dialog.kind as import("./Purchases").PurchaseAction}
              save={save}
            />
          )}
          {dialog.kind === "create" && <GoalForm data={data} save={save} />}
          {dialog.kind === "edit" && selected && (
            <GoalForm data={data} goal={selected} save={save} />
          )}
          {dialog.kind === "detail" && selected && (
            <GoalDetail data={data} goal={selected} onAction={onAction} />
          )}
          {["deposit", "transfer", "spend", "acquire"].includes(
            dialog.kind,
          ) && (
            <MoneyForm
              data={data}
              mode={dialog.kind as "deposit" | "transfer" | "spend" | "acquire"}
              goalId={selected?.id}
              save={save}
            />
          )}
          {(dialog.kind === "reverse" || dialog.kind === "archive") && (
            <ConfirmAction action={dialog.kind} id={dialog.id!} save={save} />
          )}
          {dialog.kind === "help" && (
            <div className="help-content">
              <h3>A goal gives your savings a destination.</h3>
              <p>
                Add an amount and a future date. Your main milestone defines
                success; extra milestones are cumulative targets with their own
                deadlines.
              </p>
              <h3>New money or money already here?</h3>
              <p>
                Use Add savings for money not yet recorded. Use Transfer to move
                existing money between Bank and a goal. Transfers never increase
                total cash.
              </p>
              <h3>Your plan keeps its starting point.</h3>
              <p>
                Ahead and behind compare your balance with the original plan.
                “From today” shows how much to save to catch up. Edit a plan to
                set a new baseline; previous plans stay in your export.
              </p>
              <h3>Ready to make it yours?</h3>
              <p>
                Once the main milestone is funded, record the actual purchase
                price. Leftovers return to Bank; shortfalls come from Bank.
                Acquiring closes the whole goal, including stretch milestones.
              </p>
              <h3>A realistic pace.</h3>
              <p>
                Set an hourly rate and weekly savings budget in Settings. The
                combined plan counts each goal’s balance once, even when it has
                several milestones. The overview estimates take-home pay using
                your income settings, then subtracts main savings and upcoming
                unpaid purchases. Living expenses, interest and investment
                returns are not included.
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function ConfirmAction({
  action,
  id,
  save,
}: {
  action: "reverse" | "archive";
  id: string;
  save: SaveCommand;
}) {
  const key = useRef(crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="form-stack">
      <p>
        {action === "reverse"
          ? "This adds an opposite entry on the original date. The original stays in history. A reversal is allowed only if it keeps all dated balances nonnegative."
          : "This archives the empty goal and preserves its plans and history."}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button
        className="button primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await save(
              action,
              action === "reverse" ? { transaction_id: id } : { goal_id: id },
              key.current,
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Saving…"
          : action === "reverse"
            ? "Reverse transaction"
            : "Archive goal"}
      </button>
    </div>
  );
}
