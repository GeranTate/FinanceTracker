-- Add recurring obligations without changing existing cash balances or purchase dates.
begin;
alter table public.profiles add column credit_due_day smallint check(credit_due_day between 1 and 31);
alter table public.profiles add column bank_min bigint check(bank_min between 0 and 9000000000000);
alter table public.profiles add column bank_max bigint check(bank_max between 0 and 9000000000000);
alter table public.profiles add constraint bank_preference_range check(bank_min is null or bank_max is null or bank_min<=bank_max);
create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id),
 name text not null check(length(trim(name)) between 1 and 100), card text not null default '' check(length(card)<=80),
 amount bigint not null check(amount between 1 and 9000000000000),
 cadence text not null check(cadence in ('week','month','year')),
 anchor_date date not null, next_charge_date date not null, occurrence integer not null default 0 check(occurrence>=0),
 status text not null default 'active' check(status in ('active','paused')), created_at timestamptz not null default now(), unique(id,user_id)
);
create index subscriptions_owner_next on public.subscriptions(user_id,next_charge_date) where status='active';
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public,anon,authenticated;
grant select on public.subscriptions to authenticated;
create policy owner_read on public.subscriptions for select to authenticated using((select auth.uid())=user_id);
alter table public.purchases add column subscription_id uuid;
alter table public.purchases add column subscription_charge_date date;
alter table public.purchases add foreign key(subscription_id,user_id) references public.subscriptions(id,user_id);
alter table public.purchases add constraint subscription_charge_link check((subscription_id is null)=(subscription_charge_date is null));
create unique index purchases_subscription_occurrence on public.purchases(subscription_id,subscription_charge_date) where subscription_id is not null;

create function finance_private.credit_due_date(p_date date,p_day integer) returns date language sql immutable set search_path='' as $$
 select (date_trunc('month',p_date)::date+interval '1 month')::date +
   (least(p_day,extract(day from date_trunc('month',p_date)+interval '2 months - 1 day')::integer)-1);
$$;
create function finance_private.subscription_date(p_anchor date,p_cadence text,p_occurrence integer) returns date language sql immutable set search_path='' as $$
 select case when p_cadence='week' then p_anchor+p_occurrence*7 else
   (date_trunc('month',p_anchor)::date+make_interval(months=>p_occurrence*case when p_cadence='year' then 12 else 1 end))::date+
   (least(extract(day from p_anchor)::integer,extract(day from date_trunc('month',p_anchor)+make_interval(months=>p_occurrence*case when p_cadence='year' then 12 else 1 end)+interval '1 month - 1 day')::integer)-1) end;
$$;
create function finance_private.sync_subscriptions(p_uid uuid) returns void language plpgsql security definer set search_path='' as $$
declare sub public.subscriptions%rowtype; local_today date; due_day integer; next_on date; occurrence_index integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_uid::text,0));
 select (now() at time zone p.timezone)::date,p.credit_due_day into local_today,due_day from public.profiles p where p.user_id=p_uid;
 if due_day is null then return; end if;
 for sub in select * from public.subscriptions where user_id=p_uid and status='active' and next_charge_date<=local_today order by id loop
   next_on:=sub.next_charge_date; occurrence_index:=sub.occurrence;
   while next_on<=local_today loop
     insert into public.purchases(user_id,name,card,amount,purchased_on,due_date,notes,subscription_id,subscription_charge_date)
       values(p_uid,sub.name,sub.card,sub.amount,next_on,finance_private.credit_due_date(next_on,due_day),'Recurring subscription / membership',sub.id,next_on)
       on conflict(subscription_id,subscription_charge_date) where subscription_id is not null do nothing;
     occurrence_index:=occurrence_index+1;
     next_on:=finance_private.subscription_date(sub.anchor_date,sub.cadence,occurrence_index);
   end loop;
   update public.subscriptions set occurrence=occurrence_index,next_charge_date=next_on where id=sub.id;
 end loop;
end $$;
create function finance_private.sync_all_subscriptions() returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 for owner_id in select distinct s.user_id from public.subscriptions s join public.profiles p on p.user_id=s.user_id where s.status='active' and s.next_charge_date <= (now() at time zone p.timezone)::date loop
   perform finance_private.sync_subscriptions(owner_id);
 end loop;
end $$;
revoke all on function finance_private.credit_due_date(date,integer),finance_private.subscription_date(date,text,integer),finance_private.sync_subscriptions(uuid),finance_private.sync_all_subscriptions() from public,anon,authenticated;

create or replace function finance_private.command(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  income jsonb; income_key text; purchase public.purchases%rowtype; paid bigint; sub public.subscriptions%rowtype;
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
    perform finance_private.sync_subscriptions(uid);
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
    income := coalesce(p_payload->'income_settings',profile.income_settings);
    if jsonb_typeof(income) <> 'object' or octet_length(income::text) > 4096
      or coalesce(income->>'mode','') not in ('georgia_2026','actual')
      or coalesce(income->>'filing_status','') not in ('single','married_joint','head_household') then
      raise exception 'Invalid income settings.';
    end if;
    foreach income_key in array array['retirement_weekly','benefits_weekly','post_tax_weekly'] loop
      if coalesce((income->>income_key)::bigint,-1) not between 0 and 9000000000000 then raise exception 'Payroll deductions must be nonnegative amounts.'; end if;
    end loop;
    if income->>'actual_net_monthly' is not null and (income->>'actual_net_monthly')::bigint not between 0 and 9000000000000 then raise exception 'Invalid monthly take-home amount.'; end if;
    if income->>'mode' = 'actual' and income->>'actual_net_monthly' is null then raise exception 'Enter your actual monthly take-home pay.'; end if;
    if p_payload ? 'credit_due_day' then
      if nullif(p_payload->>'credit_due_day','')::integer not between 1 and 31 then raise exception 'Credit due day must be between 1 and 31.'; end if;
      if nullif(p_payload->>'credit_due_day','') is null and exists(select 1 from public.subscriptions where user_id=uid and status='active') then raise exception 'Keep a credit due day while subscriptions are active.'; end if;
      update public.profiles set credit_due_day=nullif(p_payload->>'credit_due_day','')::integer where user_id=uid;
    end if;
    if p_payload ? 'bank_min' or p_payload ? 'bank_max' then
      update public.profiles set bank_min=case when p_payload ? 'bank_min' then nullif(p_payload->>'bank_min','')::bigint else bank_min end,bank_max=case when p_payload ? 'bank_max' then nullif(p_payload->>'bank_max','')::bigint else bank_max end where user_id=uid;
    end if;
    update public.profiles set income_settings = income, display_name = trim(p_payload->>'display_name'),
      currency = p_payload->>'currency', timezone = p_payload->>'timezone',
      hourly_rate = (p_payload->>'hourly_rate')::bigint, rate_type = p_payload->>'rate_type',
      weekly_hours = nullif(p_payload->>'weekly_hours','')::numeric,
      weekly_budget = nullif(p_payload->>'weekly_budget','')::bigint where user_id = uid;
  elsif p_action in ('create_goal','replan') then
    start_on := coalesce((p_payload->>'start_date')::date, local_today);
    if start_on > local_today + 36525 or start_on < date '2000-01-01' then raise exception 'Choose a start date within the next 100 years.'; end if;
    if p_action = 'create_goal' then
      insert into public.goals(user_id,name,description,category,color,start_date)
      values(uid,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),p_payload->>'category',p_payload->>'color',start_on)
      returning id into gid;
      insert into public.accounts(user_id,goal_id,kind) values(uid,gid,'goal') returning id into account;
      opening := coalesce((p_payload->>'opening')::bigint,0);
      if opening < 0 or opening > 9000000000000 then raise exception 'Invalid opening balance.'; end if;
      if start_on > local_today and opening <> 0 then raise exception 'Scheduled goals cannot have savings before their start date.'; end if;
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
      if goal.start_date > local_today then
        if start_on < local_today then raise exception 'A scheduled goal must start today or later.'; end if;
        update public.goals set start_date = start_on where id = gid;
      else
        start_on := local_today;
      end if;
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
      if p_action <> 'archive' and effective < goal.start_date then raise exception 'The entry date cannot be before the goal starts.'; end if;
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
  elsif p_action in ('subscription_create','subscription_edit','subscription_pause') then
    if p_action <> 'subscription_create' then
      select * into sub from public.subscriptions where id=(p_payload->>'subscription_id')::uuid and user_id=uid;
      if not found then raise exception 'Subscription not found.'; end if;
    end if;
    perform finance_private.sync_subscriptions(uid);
    if p_action = 'subscription_pause' then
      update public.subscriptions set status='paused' where id=sub.id;
    else
      if profile.credit_due_day is null then raise exception 'Set your credit payment due day in Settings first.'; end if;
      start_on := (p_payload->>'next_charge_date')::date;
      if start_on is null or start_on < local_today or start_on > local_today+36525 then raise exception 'Choose a charge date on or after today, within 100 years.'; end if;
      amount := (p_payload->>'amount')::bigint;
      if p_action = 'subscription_create' then
        insert into public.subscriptions(user_id,name,card,amount,cadence,anchor_date,next_charge_date,status)
          values(uid,trim(p_payload->>'name'),coalesce(trim(p_payload->>'card'),''),amount,p_payload->>'cadence',start_on,start_on,coalesce(p_payload->>'status','active')) returning id into gid;
      else
        update public.subscriptions set name=trim(p_payload->>'name'),card=coalesce(trim(p_payload->>'card'),''),amount=(p_payload->>'amount')::bigint,cadence=p_payload->>'cadence',anchor_date=case when start_on=sub.next_charge_date and p_payload->>'cadence'=sub.cadence then sub.anchor_date else start_on end,next_charge_date=start_on,occurrence=case when start_on=sub.next_charge_date and p_payload->>'cadence'=sub.cadence then sub.occurrence else 0 end,status=coalesce(p_payload->>'status','active') where id=sub.id;
        gid := sub.id;
      end if;
      perform finance_private.sync_subscriptions(uid);
      result := jsonb_build_object('subscription_id',gid);
    end if;
  elsif p_action in ('purchase_create','purchase_edit','purchase_cancel','purchase_pay') then
    if p_action <> 'purchase_create' then
      select * into purchase from public.purchases where id = (p_payload->>'purchase_id')::uuid and user_id = uid and status = 'active';
      if not found then raise exception 'Purchase not found.'; end if;
      select coalesce(-sum(e.amount),0) into paid from public.entries e join public.transactions t on t.id=e.transaction_id where t.user_id=uid and t.purchase_id=purchase.id;
    else paid := 0;
    end if;
    if p_action in ('purchase_create','purchase_edit') then
      amount := (p_payload->>'amount')::bigint;
      if amount is null or amount <= 0 or amount > 9000000000000 or amount < paid then raise exception 'The purchase amount must be positive and cannot be below payments already recorded.'; end if;
      if (p_payload->>'purchased_on')::date is null or (p_payload->>'purchased_on')::date > local_today
        or (p_payload->>'purchased_on')::date < date '2000-01-01' then raise exception 'Choose a valid purchase date on or before today.'; end if;
      if (p_payload->>'due_date')::date is null or (p_payload->>'due_date')::date < (p_payload->>'purchased_on')::date
        or (p_payload->>'due_date')::date > local_today + 36525 then raise exception 'Payment due date must be on or after the purchase date and within 100 years.'; end if;
      if p_action = 'purchase_edit' and exists(
        select 1 from public.transactions t where t.user_id=uid and t.purchase_id=purchase.id
          and t.effective_date < (p_payload->>'purchased_on')::date) then
        raise exception 'The purchase date cannot be after a recorded payment.';
      end if;
      if p_action = 'purchase_create' then
        insert into public.purchases(user_id,name,card,amount,purchased_on,due_date,notes)
          values(uid,trim(p_payload->>'name'),coalesce(trim(p_payload->>'card'),''),amount,(p_payload->>'purchased_on')::date,(p_payload->>'due_date')::date,coalesce(p_payload->>'notes','')) returning id into gid;
      else
        update public.purchases set name=trim(p_payload->>'name'),card=coalesce(trim(p_payload->>'card'),''),amount=(p_payload->>'amount')::bigint,
          purchased_on=(p_payload->>'purchased_on')::date,due_date=(p_payload->>'due_date')::date,notes=coalesce(p_payload->>'notes','') where id=purchase.id;
        gid := purchase.id;
      end if;
      result := jsonb_build_object('purchase_id',gid);
    elsif p_action = 'purchase_cancel' then
      if paid <> 0 then raise exception 'Reverse this purchase''s payments before cancelling it.'; end if;
      update public.purchases set status='cancelled' where id=purchase.id;
    else
      amount := (p_payload->>'amount')::bigint;
      if amount is null or amount <= 0 or amount > purchase.amount-paid then raise exception 'Payment must be positive and no greater than the outstanding balance.'; end if;
      if effective < purchase.purchased_on then raise exception 'A payment cannot be dated before the purchase.'; end if;
      insert into public.transactions(user_id,kind,effective_date,note,purchase_id)
        values(uid,'spend',effective,'Card payment: ' || purchase.name,purchase.id) returning id into tx;
      insert into public.entries(user_id,transaction_id,account_id,amount) values(uid,tx,bank,-amount);
      result := jsonb_build_object('transaction_id',tx);
    end if;
  elsif p_action = 'reverse' then
    select * into oldtx from public.transactions where id = (p_payload->>'transaction_id')::uuid and user_id = uid;
    if not found or oldtx.kind in ('acquire','reversal') then raise exception 'This transaction cannot be reversed.'; end if;
    if exists(select 1 from public.transactions where reversal_of = oldtx.id) then raise exception 'This transaction was already reversed.'; end if;
    if exists(select 1 from public.entries e join public.accounts a on a.id = e.account_id join public.goals g on g.id = a.goal_id
      where e.transaction_id = oldtx.id and g.status <> 'active') then raise exception 'Transactions for closed goals are retained as history.'; end if;
    insert into public.transactions(user_id,kind,effective_date,note,reversal_of,purchase_id)
      values(uid,'reversal',oldtx.effective_date,'Reversal: ' || left(oldtx.note,480),oldtx.id,oldtx.purchase_id) returning id into tx;
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

create or replace function public.finance_snapshot() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'settings',(select to_jsonb(p) from public.profiles p where p.user_id = (select auth.uid())),
    'goals',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from public.goals g where g.user_id = (select auth.uid())),'[]'::jsonb),
    'milestones',coalesce((select jsonb_agg(to_jsonb(m) order by m.due_date) from public.milestones m where m.user_id = (select auth.uid())),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(to_jsonb(a)) from public.accounts a where a.user_id = (select auth.uid())),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(to_jsonb(t) order by t.effective_date desc,t.created_at desc) from public.transactions t where t.user_id = (select auth.uid())),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(to_jsonb(e)) from public.entries e where e.user_id = (select auth.uid())),'[]'::jsonb),
    'subscriptions',coalesce((select jsonb_agg(to_jsonb(s) order by s.next_charge_date) from public.subscriptions s where s.user_id=(select auth.uid())),'[]'::jsonb),
    'purchases',coalesce((select jsonb_agg(to_jsonb(p) order by p.due_date,p.created_at) from public.purchases p where p.user_id = (select auth.uid())),'[]'::jsonb),
    'plan_history',coalesce((select jsonb_agg(to_jsonb(h) order by h.changed_at) from public.plan_history h where h.user_id = (select auth.uid())),'[]'::jsonb)
  );
$$;

notify pgrst,'reload schema';
commit;
