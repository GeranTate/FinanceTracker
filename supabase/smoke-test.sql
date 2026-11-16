-- Run in the Supabase SQL Editor as postgres. All synthetic records roll back.
-- No test password, token, email delivery, or persistent auth account is created.
begin;
insert into auth.users(id,aud,role,email) values
  ('6f73b2ab-03db-4d60-9700-dff1c70e60a1','authenticated','authenticated','finance-tracker-smoke-a@example.invalid'),
  ('6f73b2ab-03db-4d60-9700-dff1c70e60b2','authenticated','authenticated','finance-tracker-smoke-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','6f73b2ab-03db-4d60-9700-dff1c70e60a1',true);
do $$
declare
  g uuid; s jsonb; result jsonb; request uuid := gen_random_uuid();
  due_on date := (now() at time zone 'America/New_York')::date + 60;
  bank_amount bigint; goal_amount bigint; purchase_key uuid; payment_id uuid; scheduled_id uuid;
begin
  perform public.finance_command('initialize','{}',gen_random_uuid());
  result := public.finance_command('create_goal',jsonb_build_object(
    'name','Synthetic smoke test','category','Other','color','sage','opening',10000,'opening_source','new',
    'milestones',jsonb_build_array(
      jsonb_build_object('name','Main','target',10000,'due_date',due_on,'is_primary',true),
      jsonb_build_object('name','Stretch','target',20000,'due_date',due_on+60,'is_primary',false)
    )),gen_random_uuid());
  g := (result->>'goal_id')::uuid;
  perform public.finance_command('deposit','{"amount":5000,"note":"Synthetic Bank deposit"}',request);
  perform public.finance_command('deposit','{"amount":5000,"note":"Synthetic Bank deposit"}',request);
  perform public.finance_command('acquire',jsonb_build_object('goal_id',g,'amount',12000),gen_random_uuid());
  select coalesce(sum(e.amount),0) into bank_amount from public.entries e
    join public.accounts a on a.id=e.account_id where a.kind='bank';
  select coalesce(sum(e.amount),0) into goal_amount from public.entries e
    join public.accounts a on a.id=e.account_id where a.goal_id=g;
  if bank_amount <> 3000 or goal_amount <> 0 then raise exception 'Acquisition or idempotency check failed.'; end if;
  if (select count(*) from public.milestones where goal_id=g) <> 2 then raise exception 'Shared milestones check failed.'; end if;
  perform public.finance_command('settings','{"display_name":"Synthetic","currency":"USD","timezone":"America/New_York","hourly_rate":2500,"rate_type":"gross","weekly_hours":40,"weekly_budget":null,"income_settings":{"mode":"georgia_2026","filing_status":"single","retirement_weekly":0,"benefits_weekly":0,"post_tax_weekly":0,"actual_net_monthly":null}}',gen_random_uuid());
  if public.finance_snapshot()->'settings'->'income_settings'->>'filing_status' <> 'single' then raise exception 'Income settings check failed.'; end if;
  result := public.finance_command('create_goal',jsonb_build_object('name','Synthetic scheduled goal','category','Other','color','sage','start_date',due_on-30,'opening',0,'milestones',jsonb_build_array(jsonb_build_object('name','Main','target',10000,'due_date',due_on,'is_primary',true))),gen_random_uuid());
  scheduled_id := (result->>'goal_id')::uuid;
  begin
    perform public.finance_command('deposit',jsonb_build_object('goal_id',scheduled_id,'amount',100),gen_random_uuid());
    raise exception 'Future goal incorrectly accepted savings.';
  exception when others then
    if sqlerrm not like '%before the goal starts%' then raise; end if;
  end;
  result := public.finance_command('purchase_create',jsonb_build_object('name','Synthetic purchase','amount',1000,'purchased_on',due_on-60,'due_date',due_on-40),gen_random_uuid());
  purchase_key := (result->>'purchase_id')::uuid;
  result := public.finance_command('purchase_pay',jsonb_build_object('purchase_id',purchase_key,'amount',400),gen_random_uuid());
  payment_id := (result->>'transaction_id')::uuid;
  select coalesce(sum(e.amount),0) into bank_amount from public.entries e join public.accounts a on a.id=e.account_id where a.kind='bank';
  if bank_amount <> 2600 then raise exception 'Purchase payment check failed.'; end if;
  perform public.finance_command('reverse',jsonb_build_object('transaction_id',payment_id),gen_random_uuid());
  select coalesce(sum(e.amount),0) into bank_amount from public.entries e join public.accounts a on a.id=e.account_id where a.kind='bank';
  if bank_amount <> 3000 then raise exception 'Purchase reversal check failed.'; end if;
  if not exists(select 1 from public.transactions where reversal_of=payment_id and public.transactions.purchase_id=purchase_key) then raise exception 'Purchase reversal link check failed.'; end if;
  perform set_config('request.jwt.claim.sub','6f73b2ab-03db-4d60-9700-dff1c70e60b2',true);
  perform public.finance_command('initialize','{}',gen_random_uuid());
  s := public.finance_snapshot();
  if jsonb_array_length(s->'goals') <> 0 or jsonb_array_length(s->'entries') <> 0 or jsonb_array_length(s->'purchases') <> 0 then raise exception 'Owner isolation check failed.'; end if;
end $$;
rollback;
select 'PASS: income settings, future starts, purchases, reversals, acquisition, idempotency and owner isolation. All synthetic records rolled back.' as result;
