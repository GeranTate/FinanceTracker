import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { addDays, today } from "../src/lib/savings";
const db = new PGlite();
const alice = "00000000-0000-4000-8000-000000000001",
  bob = "00000000-0000-4000-8000-000000000002";
const now = today("America/New_York");
async function asUser(id: string) {
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function cmd(
  action: string,
  payload: Record<string, unknown> = {},
  id = crypto.randomUUID(),
) {
  const r = await db.query<{ result: Record<string, string> }>(
    "select public.finance_command($1,$2::jsonb,$3::uuid) as result",
    [action, JSON.stringify(payload), id],
  );
  return r.rows[0].result;
}
async function snapshot() {
  return (
    await db.query<{ data: any }>("select public.finance_snapshot() as data")
  ).rows[0].data;
}
function total(s: any) {
  return s.entries.reduce((sum: number, e: any) => sum + e.amount, 0);
}
function balance(s: any, goal: string | null) {
  const a = s.accounts.find((a: any) => a.goal_id === goal);
  return s.entries
    .filter((e: any) => e.account_id === a.id)
    .reduce((sum: number, e: any) => sum + e.amount, 0);
}
async function goal(name: string, opening = 0, target = 10000) {
  return (
    await cmd("create_goal", {
      name,
      category: "Other",
      color: "sage",
      start_date: addDays(now, -60),
      opening,
      opening_source: "new",
      milestones: [
        { name: "Main", target, due_date: addDays(now, 60), is_primary: true },
        {
          name: "Stretch",
          target: target * 2,
          due_date: addDays(now, 180),
          is_primary: false,
        },
      ],
    })
  ).goal_id;
}
before(async () => {
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${alice}'),('${bob}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(name, dir), "utf8"));
  await asUser(alice);
  await cmd("initialize");
});
after(async () => {
  await db.close();
});
test("income settings persist and reject invalid payroll amounts", async () => {
  await asUser(alice);
  await cmd("settings", {
    display_name: "Alice",
    currency: "USD",
    timezone: "America/New_York",
    hourly_rate: 2500,
    rate_type: "gross",
    weekly_hours: 40,
    weekly_budget: null,
    income_settings: {
      mode: "georgia_2026",
      filing_status: "single",
      retirement_weekly: 5000,
      benefits_weekly: 1000,
      post_tax_weekly: 0,
      actual_net_monthly: null,
    },
  });
  assert.equal(
    (await snapshot()).settings.income_settings.retirement_weekly,
    5000,
  );
  await assert.rejects(
    () =>
      cmd("settings", {
        display_name: "Alice",
        currency: "USD",
        timezone: "America/New_York",
        hourly_rate: 2500,
        rate_type: "gross",
        income_settings: {
          mode: "actual",
          filing_status: "single",
          retirement_weekly: -1,
          benefits_weekly: 0,
          post_tax_weekly: 0,
        },
      }),
    /nonnegative/,
  );
});
test("future goals reserve no money and reject deposits until their start date", async () => {
  const payload = {
    name: "Scheduled",
    category: "Other",
    color: "sage",
    start_date: addDays(now, 30),
    opening: 0,
    milestones: [
      {
        name: "Main",
        target: 10000,
        due_date: addDays(now, 90),
        is_primary: true,
      },
    ],
  };
  const gid = (await cmd("create_goal", payload)).goal_id;
  await assert.rejects(
    () => cmd("deposit", { goal_id: gid, amount: 100 }),
    /before the goal starts/,
  );
  await assert.rejects(
    () => cmd("create_goal", { ...payload, opening: 100 }),
    /savings before/,
  );
  await cmd("replan", {
    ...payload,
    goal_id: gid,
    start_date: addDays(now, 40),
  });
  assert.equal(
    (await snapshot()).goals.find((g: any) => g.id === gid).start_date,
    addDays(now, 40),
  );
  await assert.rejects(
    () => cmd("transfer", { goal_id: gid, amount: 100, direction: "to_goal" }),
    /before the goal starts/,
  );
  await cmd("replan", { ...payload, goal_id: gid, start_date: now });
  await cmd("deposit", { goal_id: gid, amount: 100 });
  const empty = (await cmd("create_goal", payload)).goal_id;
  await cmd("archive", { goal_id: empty });
  assert.equal(
    (await snapshot()).goals.find((g: any) => g.id === empty).status,
    "archived",
  );
  const a = await goal("Same deadline A"),
    b = await goal("Same deadline B");
  assert.notEqual(a, b);
});
test("purchases do not move cash until paid; partial payments and reversals reconcile", async () => {
  await cmd("deposit", { amount: 50000, note: "Payment funds" });
  const before = total(await snapshot());
  const p = (
    await cmd("purchase_create", {
      name: "Test purchase",
      card: "Visa",
      amount: 10000,
      purchased_on: now,
      due_date: addDays(now, 20),
    })
  ).purchase_id;
  assert.equal(total(await snapshot()), before);
  const tx = (await cmd("purchase_pay", { purchase_id: p, amount: 3000 }))
    .transaction_id;
  assert.equal(total(await snapshot()), before - 3000);
  await cmd("purchase_edit", {
    purchase_id: p,
    name: "Edited purchase",
    amount: 12000,
    purchased_on: now,
    due_date: addDays(now, 25),
  });
  await assert.rejects(
    () => cmd("purchase_pay", { purchase_id: p, amount: 10000 }),
    /outstanding/,
  );
  await assert.rejects(
    () => cmd("purchase_cancel", { purchase_id: p }),
    /Reverse/,
  );
  await cmd("reverse", { transaction_id: tx });
  assert.equal(total(await snapshot()), before);
  assert.equal(
    (await snapshot()).transactions.find((t: any) => t.reversal_of === tx)
      .purchase_id,
    p,
  );
  await cmd("purchase_cancel", { purchase_id: p });
  assert.equal(
    (await snapshot()).purchases.find((r: any) => r.id === p).status,
    "cancelled",
  );
  await asUser(bob);
  await cmd("initialize");
  assert.equal((await snapshot()).purchases.length, 0);
  assert.equal(
    (await db.query("select * from public.purchases")).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      db.exec(
        "insert into public.purchases(user_id,name,amount,purchased_on,due_date) values (auth.uid(),'Forbidden',100,current_date,current_date)",
      ),
    /permission denied/,
  );
  await assert.rejects(
    () => cmd("purchase_pay", { purchase_id: p, amount: 1 }),
    /Purchase not found/,
  );
  await asUser(alice);
});
test("deposits and transfers preserve ledger totals and prevent overdrafts", async () => {
  await asUser(alice);
  const gid = await goal("Transfer test");
  await cmd("deposit", { amount: 100000, note: "Bank deposit" });
  const before = await snapshot();
  await cmd("transfer", { goal_id: gid, amount: 25000, direction: "to_goal" });
  const after = await snapshot();
  assert.equal(total(before), total(after));
  assert.equal(balance(after, gid), 25000);
  await assert.rejects(
    () =>
      cmd("transfer", {
        goal_id: gid,
        amount: total(after) + 1,
        direction: "to_goal",
      }),
    /overdraw/i,
  );
  assert.equal(total(await snapshot()), total(after));
});
test("request retries are idempotent and cannot be reused for a changed payload", async () => {
  const id = crypto.randomUUID(),
    payload = { amount: 1000, note: "Retry" };
  const a = await cmd("deposit", payload, id),
    b = await cmd("deposit", payload, id);
  assert.deepEqual(a, b);
  assert.equal(
    (await snapshot()).transactions.filter((t: any) => t.note === "Retry")
      .length,
    1,
  );
  await assert.rejects(
    () => cmd("deposit", { amount: 2000 }, id),
    /different action/i,
  );
});
test("acquisition returns surplus, covers shortfalls, clears goals, and records actual cash outflow", async () => {
  const under = await goal("Under budget", 12000);
  const before = await snapshot(),
    bankBefore = balance(before, null);
  await cmd("acquire", { goal_id: under, amount: 9000 });
  const after = await snapshot();
  assert.equal(balance(after, under), 0);
  assert.equal(balance(after, null), bankBefore + 3000);
  assert.equal(total(after), total(before) - 9000);
  assert.equal(after.goals.find((g: any) => g.id === under).status, "acquired");
  await assert.rejects(
    () => cmd("acquire", { goal_id: under, amount: 9000 }),
    /Active goal not found/,
  );
  const over = await goal("Over budget", 10000),
    s = await snapshot(),
    b = balance(s, null);
  await cmd("acquire", { goal_id: over, amount: 13000 });
  const done = await snapshot();
  assert.equal(balance(done, null), b - 3000);
  assert.equal(total(done), total(s) - 13000);
});
test("insufficient Bank and unfunded milestones cannot be acquired", async () => {
  const gid = await goal("Too expensive", 10000),
    before = await snapshot();
  await assert.rejects(
    () => cmd("acquire", { goal_id: gid, amount: 9000000000000 }),
    /not have enough/,
  );
  assert.equal(balance(await snapshot(), gid), 10000);
  assert.equal(total(await snapshot()), total(before));
  const unfunded = await goal("Not funded");
  await assert.rejects(
    () => cmd("acquire", { goal_id: unfunded, amount: 100 }),
    /Fund the primary/,
  );
});
test("backdated withdrawals cannot spend future deposits", async () => {
  const gid = await goal("Historical");
  await cmd("deposit", { goal_id: gid, amount: 10000, date: now });
  await assert.rejects(
    () =>
      cmd("transfer", {
        goal_id: gid,
        amount: 100,
        direction: "to_bank",
        date: addDays(now, -1),
      }),
    /overdraw/i,
  );
});
test("reversals preserve audit history and reject corrections that would overdraw", async () => {
  const gid = await goal("Corrections");
  const tx = await cmd("deposit", {
    goal_id: gid,
    amount: 1000,
    note: "Correct me",
  });
  await cmd("reverse", { transaction_id: tx.transaction_id });
  assert.equal(balance(await snapshot(), gid), 0);
  await assert.rejects(
    () => cmd("reverse", { transaction_id: tx.transaction_id }),
    /already reversed/,
  );
  const second = await cmd("deposit", { goal_id: gid, amount: 1000 });
  await cmd("transfer", { goal_id: gid, amount: 1000, direction: "to_bank" });
  await assert.rejects(
    () => cmd("reverse", { transaction_id: second.transaction_id }),
    /overdraw/i,
  );
});
test("malformed milestone plans roll back goal creation; replans preserve previous baseline", async () => {
  const count = (await snapshot()).goals.length;
  await assert.rejects(
    () =>
      cmd("create_goal", {
        name: "Invalid",
        category: "Other",
        color: "sage",
        milestones: [
          {
            name: "A",
            target: 100,
            due_date: addDays(now, 10),
            is_primary: false,
          },
        ],
      }),
    /exactly one/,
  );
  assert.equal((await snapshot()).goals.length, count);
  const gid = await goal("Replan", 100);
  await cmd("replan", {
    goal_id: gid,
    name: "Replanned",
    category: "Home",
    color: "sand",
    milestones: [
      {
        name: "New main",
        target: 20000,
        due_date: addDays(now, 90),
        is_primary: true,
      },
    ],
  });
  const s = await snapshot();
  assert.equal(
    s.milestones.find((m: any) => m.goal_id === gid).baseline_balance,
    100,
  );
  assert.equal(
    s.plan_history.find((p: any) => p.goal_id === gid).previous_plan.milestones
      .length,
    2,
  );
});
test("ownership policies isolate users and reject foreign IDs and direct ledger writes", async () => {
  const foreign = (await snapshot()).goals[0].id;
  await asUser(bob);
  await cmd("initialize");
  const bobData = await snapshot();
  assert.equal(bobData.goals.length, 0);
  assert.equal(bobData.entries.length, 0);
  assert.equal(bobData.settings.user_id, bob);
  await assert.rejects(
    () => cmd("deposit", { goal_id: foreign, amount: 1000 }),
    /Active goal not found/,
  );
  await assert.rejects(
    () => db.query("update public.profiles set display_name='intruder'"),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into public.entries(user_id,transaction_id,account_id,amount) values($1,$2,$3,1)",
        [bob, crypto.randomUUID(), crypto.randomUUID()],
      ),
    /permission denied/,
  );
  await db.exec("reset role;set role anon");
  await assert.rejects(
    () => db.query("select public.finance_snapshot()"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("select * from public.entries"),
    /permission denied/,
  );
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(() => cmd("initialize"), /Please sign in/);
  await asUser(alice);
});

test("subscriptions create credit charges once, catch up while closed, and preserve month-end anchors", async () => {
  await asUser(alice);
  const draft = {
    name: "Membership",
    amount: 1200,
    card: "Visa",
    cadence: "month",
    next_charge_date: now,
  };
  await assert.rejects(() => cmd("subscription_create", draft), /due day/);
  await cmd("settings", { ...(await snapshot()).settings, credit_due_day: 31 });
  const cash = total(await snapshot());
  const id = (await cmd("subscription_create", draft)).subscription_id;
  const issued = (await snapshot()).purchases.filter(
    (p: any) => p.subscription_id === id,
  );
  assert.equal(issued.length, 1);
  assert.equal(issued[0].amount, 1200);
  assert.equal(total(await snapshot()), cash);
  await cmd("initialize");
  await cmd("initialize");
  assert.equal(
    (await snapshot()).purchases.filter((p: any) => p.subscription_id === id)
      .length,
    1,
  );
  await cmd("subscription_pause", { subscription_id: id });
  await assert.rejects(
    async () =>
      cmd("settings", { ...(await snapshot()).settings, credit_due_day: 32 }),
    /between 1 and 31/,
  );
  const future = (
    await cmd("subscription_create", {
      ...draft,
      name: "Month end",
      next_charge_date: addDays(now, 60),
    })
  ).subscription_id;
  await db.exec("reset role");
  await db.query(
    "update public.subscriptions set anchor_date='2026-01-31',next_charge_date='2026-01-31',occurrence=0 where id=$1",
    [future],
  );
  await db.exec("select finance_private.sync_all_subscriptions()");
  await asUser(alice);
  const charges = (await snapshot()).purchases
    .filter((p: any) => p.subscription_id === future)
    .sort((a: any, b: any) => a.purchased_on.localeCompare(b.purchased_on));
  assert.deepEqual(
    charges.slice(0, 3).map((p: any) => p.purchased_on),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
  );
  assert.equal(charges[0].due_date, "2026-02-28");
  assert.equal(
    (await snapshot()).subscriptions.find((s: any) => s.id === future)
      .next_charge_date,
    "2026-11-30",
  );
  await assert.rejects(
    () => db.exec("select finance_private.sync_all_subscriptions()"),
    /permission denied/,
  );
  await asUser(bob);
  assert.equal((await snapshot()).subscriptions.length, 0);
  await assert.rejects(
    () => cmd("subscription_edit", { ...draft, subscription_id: id }),
    /not found/,
  );
  await asUser(alice);
});

test('Bank min/max preferences persist without restricting ledger actions',async()=>{
 await asUser(alice);
 await cmd('settings',{...(await snapshot()).settings,bank_min:1000000000,bank_max:2000000000});
 assert.equal((await snapshot()).settings.bank_min,1000000000);
 await cmd('deposit',{amount:1,note:'Below preferred minimum is allowed'});
 await assert.rejects(async()=>cmd('settings',{...(await snapshot()).settings,bank_min:200,bank_max:100}),/bank_preference_range/);
});
