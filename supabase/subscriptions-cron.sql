-- Run once in Supabase SQL Editor after the subscriptions migration.
-- Creates bookkeeping records only. No external payment requests or credentials.
create extension if not exists pg_cron;
select cron.schedule('finance-subscription-charges','0 * * * *','select finance_private.sync_all_subscriptions();');
select jobname,schedule,active from cron.job where jobname='finance-subscription-charges';
