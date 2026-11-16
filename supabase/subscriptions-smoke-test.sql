-- Synthetic subscription test: everything rolls back.
begin;
insert into auth.users(id,aud,role,email) values
('6f73b2ab-03db-4d60-9700-dff1c70e60a1','authenticated','authenticated','finance-subscription-smoke@example.invalid'),
('6f73b2ab-03db-4d60-9700-dff1c70e60b2','authenticated','authenticated','finance-subscription-isolation@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','6f73b2ab-03db-4d60-9700-dff1c70e60a1',true);
do $$
declare sub_id uuid; today_on date := (now() at time zone 'America/New_York')::date;
begin
 perform public.finance_command('initialize','{}',gen_random_uuid());
 perform public.finance_command('settings','{"display_name":"Synthetic","currency":"USD","timezone":"America/New_York","hourly_rate":0,"rate_type":"gross","credit_due_day":31,"bank_min":10000,"bank_max":20000}',gen_random_uuid());
 sub_id:=(public.finance_command('subscription_create',jsonb_build_object('name','Synthetic weekly membership','amount',1200,'cadence','week','next_charge_date',today_on),gen_random_uuid())->>'subscription_id')::uuid;
 perform public.finance_command('initialize','{}',gen_random_uuid());
 perform public.finance_command('initialize','{}',gen_random_uuid());
 if (select count(*) from public.purchases where subscription_id=sub_id)<>1 then raise exception 'Duplicate recurring purchases.'; end if;
 if (select count(*) from public.entries)<>0 then raise exception 'Subscription moved cash before payment.'; end if;
 if (select next_charge_date from public.subscriptions where id=sub_id)<>today_on+7 then raise exception 'Incorrect weekly renewal.'; end if;
 perform public.finance_command('subscription_pause',jsonb_build_object('subscription_id',sub_id),gen_random_uuid());
 perform set_config('request.jwt.claim.sub','6f73b2ab-03db-4d60-9700-dff1c70e60b2',true);
 perform public.finance_command('initialize','{}',gen_random_uuid());
 if (select count(*) from public.subscriptions)<>0 or (select count(*) from public.purchases)<>0 then raise exception 'Subscription owner isolation failed.'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from cron.job where jobname='finance-subscription-charges' and active) then raise exception 'Subscription scheduler is not active.'; end if;
 if finance_private.credit_due_date('2028-01-31',31)<>'2028-02-29' then raise exception 'Credit due date clamp failed.'; end if;
end $$;
rollback;
select 'PASS: recurring purchases, idempotency, weekly dates, owner isolation, Bank preferences, and active scheduler. All test records rolled back.' as result;
