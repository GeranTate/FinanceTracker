-- All test records roll back; existing owner data is untouched.
begin;
insert into auth.users(id,aud,role,email) values
('6f73b2ab-03db-4d60-9700-dff1c70e60a1','authenticated','authenticated','finance-emergency-test@example.invalid'),
('6f73b2ab-03db-4d60-9700-dff1c70e60b2','authenticated','authenticated','finance-emergency-isolation@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','6f73b2ab-03db-4d60-9700-dff1c70e60a1',true);
do $$
declare g uuid; s jsonb; before_total bigint; after_total bigint; today_on date:=(now() at time zone 'America/New_York')::date;
begin
 perform public.finance_command('initialize','{}',gen_random_uuid());
 perform public.finance_command('settings','{"display_name":"Synthetic","currency":"USD","timezone":"America/New_York","hourly_rate":0,"rate_type":"gross","pay_schedule":{"cadence":"weekly","weekday":5}}',gen_random_uuid());
 if public.finance_snapshot()->'settings'->'pay_schedule'->>'weekday'<>'5' then raise exception 'Pay schedule persistence failed.'; end if;
 perform public.finance_command('deposit','{"amount":10000}',gen_random_uuid());
 perform public.finance_command('emergency_deposit','{"amount":5000,"note":"Test reserve"}',gen_random_uuid());
 perform public.finance_command('emergency_transfer','{"amount":4000,"direction":"to_fund"}',gen_random_uuid());
 perform public.finance_command('emergency_spend','{"amount":2000,"note":"Synthetic emergency"}',gen_random_uuid());
 if (select coalesce(sum(e.amount),0) from public.entries e join public.accounts a on a.id=e.account_id where a.kind='emergency')<>7000 then raise exception 'Emergency account reconciliation failed.'; end if;
 g:=(public.finance_command('create_goal',jsonb_build_object('name','Synthetic reserve goal','category','Emergency','color','sage','opening',3000,'opening_source','new','milestones',jsonb_build_array(jsonb_build_object('name','Main','target',10000,'due_date',today_on+90,'is_primary',true))),gen_random_uuid())->>'goal_id')::uuid;
 select sum(amount) into before_total from public.entries;
 perform public.finance_command('emergency_from_goal',jsonb_build_object('goal_id',g),gen_random_uuid());
 select sum(amount) into after_total from public.entries;
 if after_total<>before_total or (select status from public.goals where id=g)<>'archived' then raise exception 'Goal conversion changed cash or failed to archive.'; end if;
 if (select emergency_target from public.profiles)<>10000 then raise exception 'Reserve target was not copied.'; end if;
 perform set_config('request.jwt.claim.sub','6f73b2ab-03db-4d60-9700-dff1c70e60b2',true);
 perform public.finance_command('initialize','{}',gen_random_uuid());
 s:=public.finance_snapshot();
 if jsonb_array_length(s->'entries')<>0 or jsonb_array_length(s->'goals')<>0 then raise exception 'Owner isolation failed.'; end if;
 if (select count(*) from public.accounts where kind='emergency')<>1 then raise exception 'Missing owner Emergency Fund account.'; end if;
end $$;
rollback;
select 'PASS: pay settings, separate Emergency Fund, transfers, emergency expenses, conversion preserves total cash and history, and owner isolation. All test records rolled back.' as result;
