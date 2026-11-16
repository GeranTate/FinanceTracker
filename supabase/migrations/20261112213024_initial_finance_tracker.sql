-- Finance Tracker. Run once in your project's SQL Editor as postgres.
begin;
create schema if not exists finance_private;
revoke all on schema finance_private from public, anon, authenticated;
grant usage on schema finance_private to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id),
  display_name text not null default '' check (length(display_name) <= 80),
  currency text not null default 'USD' check (currency in ('USD','CAD','GBP','EUR','AUD')),
  timezone text not null default 'America/New_York',
  hourly_rate bigint not null default 0 check (hourly_rate between 0 and 9000000000000),
  rate_type text not null default 'gross' check (rate_type in ('gross','take_home')),
  weekly_hours numeric check (weekly_hours between 0 and 168),
  weekly_budget bigint check (weekly_budget between 0 and 9000000000000),
  created_at timestamptz not null default now()
);
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  name text not null check (length(trim(name)) between 1 and 100),
  description text not null default '' check (length(description) <= 1000),
  category text not null default 'Other' check (category in ('Home','Travel','Transport','Education','Emergency','Other')),
  color text not null default 'sage' check (color in ('sage','sand','blue','rose')),
  start_date date not null,
  status text not null default 'active' check (status in ('active','acquired','archived')),
  actual_cost bigint check (actual_cost > 0 and actual_cost <= 9000000000000),
  acquired_on date,
  created_at timestamptz not null default now(),
  unique (id,user_id),
  check ((status = 'acquired') = (actual_cost is not null and acquired_on is not null))
);
create index goals_owner on public.goals(user_id);
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  goal_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  target bigint not null check (target between 1 and 9000000000000),
  due_date date not null,
  is_primary boolean not null default false,
  baseline_date date not null,
  baseline_balance bigint not null default 0 check (baseline_balance >= 0),
  foreign key (goal_id,user_id) references public.goals(id,user_id),
  check (due_date > baseline_date)
);
create index milestones_owner_goal on public.milestones(user_id,goal_id);
create unique index one_primary_milestone on public.milestones(goal_id) where is_primary;
create table public.plan_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  goal_id uuid not null,
  previous_plan jsonb not null,
  changed_at timestamptz not null default now(),
  foreign key (goal_id,user_id) references public.goals(id,user_id)
);
create index plan_history_owner_goal on public.plan_history(user_id,goal_id);
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  goal_id uuid,
  kind text not null check (kind in ('bank','goal')),
  unique(id,user_id), unique(goal_id),
  foreign key (goal_id,user_id) references public.goals(id,user_id),
  check ((kind = 'bank' and goal_id is null) or (kind = 'goal' and goal_id is not null))
);
create index accounts_owner on public.accounts(user_id);
create unique index one_bank_per_user on public.accounts(user_id) where kind = 'bank';
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  kind text not null check (kind in ('deposit','opening','transfer','spend','acquire','reversal')),
  effective_date date not null,
  note text not null default '' check (length(note) <= 500),
  reversal_of uuid unique,
  created_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (reversal_of,user_id) references public.transactions(id,user_id)
);
create index transactions_owner_date on public.transactions(user_id,effective_date);
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  transaction_id uuid not null,
  account_id uuid not null,
  amount bigint not null check (amount <> 0 and amount between -9000000000000 and 9000000000000),
  foreign key (transaction_id,user_id) references public.transactions(id,user_id),
  foreign key (account_id,user_id) references public.accounts(id,user_id)
);
create index entries_owner_account on public.entries(user_id,account_id);
create index entries_transaction on public.entries(transaction_id,user_id);
create table finance_private.requests (
  user_id uuid not null references public.profiles(user_id),
  request_id uuid not null,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table finance_private.requests enable row level security;

-- Only reads are granted. Financial writes go through the atomic command.
do $$
declare tbl text;
begin
  foreach tbl in array array['profiles','goals','milestones','plan_history','accounts','transactions','entries'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on table public.%I from public, anon, authenticated',tbl);
    execute format('grant select on table public.%I to authenticated',tbl);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',tbl);
  end loop;
end $$;

create function finance_private.command(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  local_today date;
  previous finance_private.requests%rowtype;
  profile public.profiles%rowtype;
  goal public.goals%rowtype;
  bank uuid; account uuid; destination uuid; gid uuid; tx uuid;
  amount bigint; opening bigint; balance bigint; bank_balance bigint; primary_target bigint;
  effective date; start_on date; milestone jsonb; last_date date; last_target bigint := 0;
  nprimary integer := 0; result jsonb := '{}'::jsonb; oldtx public.transactions%rowtype;
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid request.';
  end if;
  -- One lock per owner serializes competing transfers/acquisitions. No lost updates.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if p_action = 'initialize' then
    insert into public.profiles(user_id) values(uid) on conflict do nothing;
    insert into public.accounts(user_id,kind) values(uid,'bank') on conflict do nothing;
    return '{}'::jsonb;
  end if;
  select * into profile from public.profiles where user_id = uid;
  if not found then raise exception 'Initialize your profile first.'; end if;
  select * into previous from finance_private.requests where user_id = uid and request_id = p_request_id;
  if found then
    if previous.action <> p_action or previous.payload <> p_payload then raise exception 'Request ID already used for a different action.'; end if;
    return previous.result;
  end if;
  local_today := (now() at time zone profile.timezone)::date;
  effective := coalesce((p_payload->>'date')::date, local_today);
  if effective > local_today or effective < date '2000-01-01' then raise exception 'Choose a date between January 1, 2000 and today.'; end if;
  select id into bank from public.accounts where user_id = uid and kind = 'bank';
  if p_action = 'settings' then
    if not exists(select 1 from pg_catalog.pg_timezone_names where name = p_payload->>'timezone') then raise exception 'Choose a valid timezone.'; end if;
    if p_payload->>'currency' <> profile.currency and exists(select 1 from public.entries where user_id = uid) then
      raise exception 'Currency cannot change after recording money. Export your data first.';
    end if;
    update public.profiles set display_name = trim(p_payload->>'display_name'),
      currency = p_payload->>'currency', timezone = p_payload->>'timezone',
      hourly_rate = (p_payload->>'hourly_rate')::bigint, rate_type = p_payload->>'rate_type',
      weekly_hours = nullif(p_payload->>'weekly_hours','')::numeric,
      weekly_budget = nullif(p_payload->>'weekly_budget','')::bigint where user_id = uid;
  elsif p_action in ('create_goal','replan') then
    start_on := coalesce((p_payload->>'start_date')::date, local_today);
    if start_on > local_today or start_on < date '2000-01-01' then raise exception 'Goal start date must be today or earlier.'; end if;
    if p_action = 'create_goal' then
      insert into public.goals(user_id,name,description,category,color,start_date)
      values(uid,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),p_payload->>'category',p_payload->>'color',start_on)
      returning id into gid;
      insert into public.accounts(user_id,goal_id,kind) values(uid,gid,'goal') returning id into account;
      opening := coalesce((p_payload->>'opening')::bigint,0);
      if opening < 0 or opening > 9000000000000 then raise exception 'Invalid opening balance.'; end if;
      if opening > 0 then
        insert into public.transactions(user_id,kind,effective_date,note) values(uid,'opening',start_on,'Opening savings') returning id into tx;
        insert into public.entries(user_id,transaction_id,account_id,amount) values(uid,tx,account,opening);
        if p_payload->>'opening_source' = 'bank' then
          insert into public.entries(user_id,transaction_id,account_id,amount) values(uid,tx,bank,-opening);
        elsif coalesce(p_payload->>'opening_source','new') <> 'new' then raise exception 'Invalid opening balance source.'; end if;
      end if;
      balance := opening;
    else
      select * into goal from public.goals where id = (p_payload->>'goal_id')::uuid and user_id = uid and status = 'active';
      if not found then raise exception 'Active goal not found.'; end if;
      gid := goal.id;
      select a.id,coalesce(sum(e.amount),0) into account,balance from public.accounts a left join public.entries e on e.account_id = a.id
        where a.user_id = uid and a.goal_id = gid group by a.id;
      insert into public.plan_history(user_id,goal_id,previous_plan)
        select uid,gid,jsonb_build_object('goal',to_jsonb(goal),'milestones',jsonb_agg(to_jsonb(m))) from public.milestones m where m.goal_id = gid;
      delete from public.milestones where user_id = uid and goal_id = gid;
      update public.goals set name = trim(p_payload->>'name'),description = coalesce(p_payload->>'description',''),
        category = p_payload->>'category',color = p_payload->>'color' where id = gid;
      start_on := local_today;
    end if;
    if jsonb_typeof(p_payload->'milestones') <> 'array' or jsonb_array_length(p_payload->'milestones') not between 1 and 20 then
      raise exception 'Add between 1 and 20 milestones.';
    end if;
    for milestone in select value from jsonb_array_elements(p_payload->'milestones') order by (value->>'due_date')::date loop
      if (milestone->>'target')::bigint <= last_target or (milestone->>'due_date')::date <= coalesce(last_date,start_on)
        or (milestone->>'due_date')::date <= local_today
        or (milestone->>'due_date')::date > local_today + 36525 then raise exception 'Milestone amounts and future dates must increase together (within 100 years).'; end if;
      insert into public.milestones(user_id,goal_id,name,target,due_date,is_primary,baseline_date,baseline_balance)
        values(uid,gid,trim(milestone->>'name'),(milestone->>'target')::bigint,(milestone->>'due_date')::date,
          coalesce((milestone->>'is_primary')::boolean,false),start_on,balance);
      if (milestone->>'is_primary')::boolean then nprimary := nprimary + 1; end if;
      last_date := (milestone->>'due_date')::date; last_target := (milestone->>'target')::bigint;
    end loop;
    if nprimary <> 1 then raise exception 'Select exactly one primary milestone.'; end if;
    result := jsonb_build_object('goal_id',gid);
  elsif p_action in ('deposit','transfer','spend','acquire','archive') then
    if nullif(p_payload->>'goal_id','') is not null then
      select * into goal from public.goals where id = (p_payload->>'goal_id')::uuid and user_id = uid and status = 'active';
      if not found then raise exception 'Active goal not found.'; end if;
      gid := goal.id;
      select id into account from public.accounts where user_id = uid and goal_id = gid;
      if effective < goal.start_date then raise exception 'The entry date cannot be before the goal starts.'; end if;
    else account := bank; end if;
    select coalesce(sum(e.amount),0) into balance from public.entries e where e.user_id = uid and e.account_id = account;
    if p_action = 'archive' then
      if gid is null or balance <> 0 then raise exception 'Return this goal''s savings to Bank before archiving.'; end if;
      update public.goals set status = 'archived' where id = gid;
    else
      amount := (p_payload->>'amount')::bigint;
      if amount is null or amount <= 0 or amount > 9000000000000 then raise exception 'Enter a positive amount.'; end if;
      if p_action = 'acquire' then
        if gid is null then raise exception 'Choose a goal.'; end if;
        if effective <> local_today then raise exception 'Record acquisitions on today''s date.'; end if;
        select target into primary_target from public.milestones where goal_id = gid and is_primary;
        if balance < primary_target then raise exception 'Fund the primary milestone before acquiring this goal.'; end if;
        select coalesce(sum(e.amount),0) into bank_balance from public.entries e where e.user_id = uid and e.account_id = bank;
        if bank_balance + balance < amount then raise exception 'Bank does not have enough to cover this purchase.'; end if;
      elsif p_action = 'spend' and gid is not null then raise exception 'Record unassigned spending from Bank.';
      end if;
      insert into public.transactions(user_id,kind,effective_date,note)
        values(uid,p_action,effective,coalesce(nullif(trim(p_payload->>'note'),''),case when gid is not null then goal.name else 'Bank' end)) returning id into tx;
      if p_action = 'deposit' then
        insert into public.entries(user_id,transaction_id,account_id,amount) values(uid,tx,account,amount);
      elsif p_action = 'spend' then
        insert into public.entries(user_id,transaction_id,account_id,amount) values(uid,tx,bank,-amount);
      elsif p_action = 'transfer' then
        if gid is null then raise exception 'Choose a goal for this transfer.'; end if;
        if p_payload->>'direction' = 'to_goal' then destination := account; account := bank;
        elsif p_payload->>'direction' = 'to_bank' then destination := bank;
        else raise exception 'Choose a transfer direction.'; end if;
        insert into public.entries(user_id,transaction_id,account_id,amount) values(uid,tx,account,-amount),(uid,tx,destination,amount);
      elsif p_action = 'acquire' then
        insert into public.entries(user_id,transaction_id,account_id,amount) values(uid,tx,account,-balance);
        if balance <> amount then insert into public.entries(user_id,transaction_id,account_id,amount) values(uid,tx,bank,balance-amount); end if;
        update public.goals set status = 'acquired',actual_cost = amount,acquired_on = effective where id = gid;
      end if;
      result := jsonb_build_object('transaction_id',tx);
    end if;
  elsif p_action = 'reverse' then
    select * into oldtx from public.transactions where id = (p_payload->>'transaction_id')::uuid and user_id = uid;
    if not found or oldtx.kind in ('acquire','reversal') then raise exception 'This transaction cannot be reversed.'; end if;
    if exists(select 1 from public.transactions where reversal_of = oldtx.id) then raise exception 'This transaction was already reversed.'; end if;
    if exists(select 1 from public.entries e join public.accounts a on a.id = e.account_id join public.goals g on g.id = a.goal_id
      where e.transaction_id = oldtx.id and g.status <> 'active') then raise exception 'Transactions for closed goals are retained as history.'; end if;
    insert into public.transactions(user_id,kind,effective_date,note,reversal_of)
      values(uid,'reversal',oldtx.effective_date,'Reversal: ' || left(oldtx.note,480),oldtx.id) returning id into tx;
    insert into public.entries(user_id,transaction_id,account_id,amount)
      select uid,tx,account_id,-e.amount from public.entries e where transaction_id = oldtx.id and user_id = uid;
    result := jsonb_build_object('transaction_id',tx);
  else raise exception 'Unknown action.';
  end if;
  -- Validate every dated balance, so a backdated withdrawal cannot borrow from future deposits.
  if exists(
    select 1 from (
      select sum(daily.amount) over(partition by daily.account_id order by daily.effective_date) as running
      from (
        select e.account_id,t.effective_date,sum(e.amount) as amount from public.entries e
        join public.transactions t on t.id = e.transaction_id where e.user_id = uid group by e.account_id,t.effective_date
      ) daily
    ) balances where running < 0 or running > 9000000000000
  ) then raise exception 'This would overdraw an account on its recorded date, or exceed the balance limit.'; end if;
  insert into finance_private.requests(user_id,request_id,action,payload,result) values(uid,p_request_id,p_action,p_payload,result);
  return result;
end $$;
revoke all on function finance_private.command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function finance_private.command(text,jsonb,uuid) to authenticated;

create function public.finance_command(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select finance_private.command(p_action,p_payload,p_request_id);
$$;
revoke all on function public.finance_command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.finance_command(text,jsonb,uuid) to authenticated;

create function public.finance_snapshot() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'settings',(select to_jsonb(p) from public.profiles p where p.user_id = (select auth.uid())),
    'goals',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from public.goals g where g.user_id = (select auth.uid())),'[]'::jsonb),
    'milestones',coalesce((select jsonb_agg(to_jsonb(m) order by m.due_date) from public.milestones m where m.user_id = (select auth.uid())),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(to_jsonb(a)) from public.accounts a where a.user_id = (select auth.uid())),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(to_jsonb(t) order by t.effective_date desc,t.created_at desc) from public.transactions t where t.user_id = (select auth.uid())),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(to_jsonb(e)) from public.entries e where e.user_id = (select auth.uid())),'[]'::jsonb),
    'plan_history',coalesce((select jsonb_agg(to_jsonb(h) order by h.changed_at) from public.plan_history h where h.user_id = (select auth.uid())),'[]'::jsonb)
  );
$$;
revoke all on function public.finance_snapshot() from public,anon,authenticated;
grant execute on function public.finance_snapshot() to authenticated;
notify pgrst,'reload schema';
commit;
