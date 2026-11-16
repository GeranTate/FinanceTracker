# Finance Tracker

A personal savings planner built with React, TypeScript, Vite, and Supabase PostgreSQL. Cloudflare hosting is a separate step.

## Run locally

Use Node 22+ (see .nvmrc). A project-local Node 22 runtime is also installed as a dev dependency, so npm scripts work on this machine's older default runtime.

    npm ci
    cp .env.example .env.local
    # Set VITE_SUPABASE_PUBLISHABLE_KEY in .env.local
    npm run dev

Open http://127.0.0.1:5173. The local environment file is already configured in the original working directory and is ignored by Git.

| Variable                      | Value                                    |
| ----------------------------- | ---------------------------------------- |
| VITE_SUPABASE_URL             | https://bravhgfuufazqhkymtrs.supabase.co |
| VITE_SUPABASE_PUBLISHABLE_KEY | Your project's publishable key           |

These VITE\_ values are included in the browser bundle. Use only a publishable key. The app needs no service-role key, secret key, database password, or management token.

The development sign-in page includes a **read-only sample-data demo**. Demo data stays in memory and never writes to Supabase. The demo button is omitted from production builds.

## Database

The initial migration is [supabase/migrations/20261112213024_initial_finance_tracker.sql](supabase/migrations/20261112213024_initial_finance_tracker.sql). It was applied to the linked Supabase project through the SQL Editor on November 12, 2026. **Do not run it a second time on that project.**

For a new empty project, run that file once in its SQL Editor as postgres. It runs in one transaction and creates:

- Profiles/settings, goals, milestones, previous plans, accounts, transaction headers, and signed ledger entries.
- Owner-only SELECT policies with RLS on every exposed table.
- Explicit SELECT grants for authenticated users; no anonymous reads or direct client writes.
- A public finance_command RPC with a private implementation, plus a read-only finance_snapshot RPC.
- Ownership checks, integer currency amounts, per-user transaction locking, idempotency keys, and dated overdraft validation.

The private command function uses SECURITY DEFINER with an empty search_path, checks auth.uid(), and is callable only by authenticated users. Public API wrappers use SECURITY INVOKER. Keep finance_private out of the Data API's exposed schemas.

The API settings should be Data API **on**, automatically expose new tables **off**, and automatic RLS **on**. Future migrations must explicitly include grants and RLS.

SQL Editor runs do not register CLI migration history. Before a future CLI deployment, verify the schema and reconcile the initial version as applied using the installed CLI's migration repair command. Do not blindly replay the initial migration.

## First sign-in

The app has no public registration screen. In the Supabase project:

The owner account has now been created, public signups are disabled, and live sign-in was verified. The following steps are retained for reference or adding future users.

1. Go to **Authentication → Users → Add user → Create new user**.
2. Enter your email and choose your own password. Enable **Auto Confirm User** for this manually created account when offered.
3. Disable **Allow new users to sign up** in **Authentication → Sign In / Providers** for the personal version.
4. Sign in locally. Your empty profile and Bank are created automatically.

Do not share your password in chat. Additional users can later be provisioned the same way; each has independent data.

Password reset uses Supabase email delivery. Allow the local URL http://127.0.0.1:5173 in Auth redirect settings before testing resets. When deploying, set the final HTTPS site URL and redirect allowlist. Normal password sign-in does not require redirects.

## Behavior

- Goals have one main milestone and optional intermediate/stretch milestones, all sharing one balance. Cumulative targets and dates increase together.
- Starting savings come from untracked cash or Bank. Moving Bank money does not count as new savings.
- Original weekly/monthly plans stay fixed. Catch-up schedules recalculate from today. Calendar months, partial periods, and exact-cent installment rounding are supported.
- Status compares saved money with the original baseline. Past deadlines show overdue.
- Settings include hourly rate, gross/take-home designation, optional weekly hours, and an optional weekly savings budget.
- Combined feasibility checks count cumulative milestones once and evaluate requirements at each deadline.
- Bank holds unallocated money. Unassigned spending reduces Bank.
- Acquisition requires a funded main milestone. The actual cost leaves the tracker, surplus returns to Bank, and a shortfall comes from Bank. Negative balances are blocked.
- Acquisition closes the whole goal, including stretch milestones, while preserving history.
- Editing a plan creates a new baseline at today's balance and preserves the previous plan in the export.
- Corrections append reversals on the original date. Dated overdrafts are rejected. Transactions involving closed goals and acquisitions cannot be reversed through the UI.
- Empty goals can be archived. JSON export includes transactions, goals, milestones, settings, and previous plans.

The overview separates goal savings, Bank, and total tracked cash. Acquired purchases are not current savings. Currency stays fixed after recording money. The app does not perform currency conversion or estimate taxes, expenses, interest, or investment returns.

## Verification

    npm test
    npm run build

Tests apply the actual migration to embedded PostgreSQL (PGlite), using two simulated authenticated identities. They cover transfers, acquisitions above/below savings, overdrafts, retries, reversals, owner isolation, direct-write restrictions, plan history, calendar boundaries, and shared milestones.

Live checks:

- [supabase/verify.sql](supabase/verify.sql) inspects grants, RLS, and function permissions.
- [supabase/smoke-test.sql](supabase/smoke-test.sql) exercises real auth helpers and ledger operations with synthetic records that roll back. No credentials or lasting test users are created.
- Check that the public key cannot read private data:

      ./node_modules/.bin/node --env-file=.env.local scripts/check-connection.mjs

The live smoke test and unauthenticated API checks passed on November 12, 2026. Tests validate sequential operations and SQL locking is present; a true simultaneous multi-connection load test has not been performed.

## Hosting later

Cloudflare Workers configuration is included in wrangler.jsonc. For the existing financetracker Worker, connect GeranTate/FinanceTracker on branch main with the repository root as the root directory, set the build command to npm run build, and set the deploy command to npx wrangler deploy.

The selected production domain is mypersonalfinancetracker.com, declared as a Worker Custom Domain in wrangler.jsonc. In Supabase Authentication → URL Configuration, set the Site URL to https://mypersonalfinancetracker.com and add that exact address to the redirect allowlist. Preserve the local redirect entry for local development.

Under **Settings → Builds → Build variables and secrets**, configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before building. These must be available during the Vite build, rather than only as Worker runtime variables. The .nvmrc pins the Node version; an explicit NODE_VERSION override is optional.

After publishing, add the chosen HTTPS application URL to Supabase Auth's Site URL and redirect allowlist for password reset. Keep Cloudflare Access enabled for this Worker. No Cloudflare D1, KV, R2, or Supabase service-role binding is needed.

Production output is dist/, created by npm run build. Configure Node 22+ and both VITE\_ variables when deploying. No Cloudflare resources or deployments are changed by the repository's scripts.

Supabase sign-in and RLS remain necessary when the frontend is behind Cloudflare Access.
