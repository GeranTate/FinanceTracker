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
  bank_amount bigint; goal_amount bigint;
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
  perform set_config('request.jwt.claim.sub','6f73b2ab-03db-4d60-9700-dff1c70e60b2',true);
  perform public.finance_command('initialize','{}',gen_random_uuid());
  s := public.finance_snapshot();
  if jsonb_array_length(s->'goals') <> 0 or jsonb_array_length(s->'entries') <> 0 then raise exception 'Owner isolation check failed.'; end if;
end $$;
rollback;
select 'PASS: acquisition, shared milestones, idempotency and owner isolation. All synthetic records rolled back.' as result;
