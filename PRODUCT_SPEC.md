# Finance Tracker — draft product and architecture specification

Updated: November 12, 2026.

Status: first implementation completed locally. Supabase was selected and the initial schema was applied on November 12, 2026. Cloudflare hosting remains a separate step. See README.md for setup and verification.

## Scope

A simple online application for manually tracking savings toward dated goals, with cumulative milestones and an unallocated Bank balance.

The first version serves one person with sign-in and access across devices. Store ownership from day one so additional people can later have independent, private data. Shared household ownership is outside the initial scope.

No automatic bank connections, investment returns, or payment execution are needed. Acquiring a goal records a purchase the user has made; it does not initiate a payment.

## Recommended architecture

- Frontend: React, TypeScript, and Vite; responsive desktop and mobile layouts.
- Data: Supabase PostgreSQL, using relational tables and database migrations.
- Authentication: Supabase Auth, initially restricted to the owner. Public signup remains disabled until additional users are supported.
- Authorization: row-level security on every exposed user-owned table, with ownership checked on related records and database functions.
- Hosting: Cloudflare Workers Static Assets for the built frontend. Database operations use Supabase APIs and narrowly scoped database functions.
- Data authority: the hosted database. Browser storage may hold preferences or temporary form drafts, but is not the financial record.
- Portability: regular SQL schema, migrations, and an export of the user's records.

SQL is a good fit for the relationships between goals, milestones, allocations, and acquisitions. Firestore is a viable alternative, but a relational model is the preferred design for this application. JSON is useful for export, not the primary database.

Initial service costs can fit free tiers, subject to limits. Supabase Free currently pauses after a week of inactivity and excludes automatic backups; Pro starts at $25/month. Cloudflare currently serves static assets without request charges. Domain registration and any paid service upgrades are separate. Check pricing again before provisioning.

Sources checked November 12, 2026:

- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/pricing
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://firebase.google.com/docs/firestore/data-model

## Main screens

1. Overview: saved across goals, Bank available, combined cash balance, goal progress, and goals ahead or behind schedule.
2. Goal detail: shared saved balance, primary milestone, stretch milestones, original plan, catch-up requirements, dated contribution history, and acquisition action.
3. Add savings or transfer: clearly distinguish new money from reallocating money already in Bank.
4. Bank: deposits, allocations, withdrawals, unassigned spending, and acquisition adjustments.
5. Settings: hourly rate, usual weekly working hours, optional weekly savings budget, currency, and timezone.
6. History: acquired goals and transaction history.

## Goal and milestone behavior

Each goal has a name, a start date, one shared balance, and exactly one primary milestone. Every milestone has a cumulative target amount and a due date. Additional milestones can be intermediate or stretch targets.

Example: $30,000 primary by one date, $40,000 stretch by a later date, and $50,000 stretch by a still later date. These are cumulative balances, not three separate pots totaling $120,000. Reaching $30,000 leaves $10,000 more to reach $40,000.

Show a separate schedule and progress status for each milestone. The primary milestone determines the main goal card's status; after it is funded, show that status alongside the next unfinished milestone. Reaching a milestone does not spend money or automatically acquire the goal.

Targets must be positive and dates valid. Stretch targets and dates must increase beyond the preceding milestone. Validate intermediate milestones against the same chronological ordering. Goal starting balances must be backed by an opening-balance transaction or an allocation from Bank.

## Savings schedules

At creation, retain a baseline with the start date, starting balance, target, and due date for each milestone. All milestone baselines use the same goal balance; later milestone schedules represent extended cumulative plans.

For a milestone with starting balance B, target T, start date S, due date D, and current local date t:

    expected balance = B + max(0, T - B) × clamp((t - S) / (D - S), 0, 1)
    schedule difference = current goal balance - expected balance
    remaining amount = max(0, T - current goal balance)

Calendar day differences use the user's timezone. A due date represents a local calendar date, not a UTC timestamp boundary. Round displayed money to currency precision and use a one-minor-unit tolerance for on-track comparisons.

Show both the original planned contribution and the updated amount needed from today. Never silently reset the baseline after a contribution, because that would erase evidence of being ahead or behind. Explicit plan edits create a new baseline version while retaining history.

Use a daily linear rate to produce weekly and calendar-month contribution amounts, including partial periods. Round installments in minor units and reconcile the final installment to the exact target. Weekly and monthly views represent the same plan and must not be added together. Months are not assumed to have four weeks.

When a deadline has arrived, show funded or overdue with the remaining amount; do not divide by zero. If already funded, required future savings is zero. A new unfunded target needs a future due date; historical dates may be recorded through history rather than normal goal creation.

Backdated transactions affect the balance as of their effective date. Future-dated entries are outside the first version. Record both effective date and creation timestamp for auditability.

## Feasibility warnings

Hourly rate alone can express the work hours equivalent of a target, but cannot establish an affordable savings rate.

Keep hourly rate as requested. Also allow usual weekly working hours and an optional user-entered weekly savings budget. Display whether the hourly rate is gross or take-home; do not invent a tax or expense estimate.

Compare required savings with the explicit savings budget when available. Without it, hourly rate times working hours provides an income ceiling, not an affordability promise. With only hourly rate, show required work hours and label affordability as unknown.

Warn for an individual goal and for the combined plan across goals. For cumulative milestones within one goal, count shared money once. Evaluate upcoming deadline requirements against future savings capacity so overlapping goals and later stretch dates do not falsely appear affordable. Do not add all milestone rates together. Feasibility warnings permit the user to retain an ambitious goal.

## Bank and accounting

Interpret Bank as unallocated cash in the tracker. Unassigned spending reduces Bank; new unassigned savings increases Bank. The application tracks only amounts the user records.

    goal savings = sum of current goal balances
    total tracked cash = Bank balance + goal savings

Show these as separate overview figures. Historical deposits, total spent, and acquired-goal value are separate metrics, not current savings.

- New savings to a goal increases its balance and total cash.
- New savings to Bank increases Bank and total cash.
- Allocating Bank money to a goal transfers money; total cash stays the same.
- Returning goal money to Bank is also a transfer.
- Spending reduces total cash.
- Initial balances are recorded once as opening transactions, not added again as new deposits.

Represent each action with a transaction header and signed entries against Bank or goal accounts. Deposits have positive cash entries, purchases and withdrawals have negative entries, and internal transfer entries sum to zero. Derive balances from entries; any cached balance must be maintained within the same database transaction.

Store currency amounts as integer minor units, with one currency per user in version one and no exchange-rate conversion. Reject invalid amounts and cross-owner account references on the server. Correct posted transactions using reversals rather than silently overwriting history.

## Acquiring a goal

Once the primary milestone is funded, the user can record the actual purchase price. Preview the resulting Bank adjustment and remaining total cash before submission.

Let G be the complete goal balance and P the purchase price:

    Bank after acquisition = Bank before acquisition + G - P
    goal balance after acquisition = 0
    total cash after acquisition = total cash before acquisition - P

Examples with a $30,000 goal balance:

- Purchase at $28,000: transfer $2,000 to Bank.
- Purchase at $32,000: take the additional $2,000 from Bank.
- Purchase at $30,000: Bank is unchanged.

Proposed default: prevent acquisition if the resulting Bank would be negative. Record actual price, date, goal, and settlement transaction; retain all history.

Acquisition, surplus release or shortfall funding, and goal closure occur atomically in the database. Use an idempotency key and concurrency control so retries and simultaneous actions cannot spend the same money twice.

Proposed default: acquisition closes the entire goal, including unfinished stretch milestones. Before acquisition, the user can continue saving past the primary target. If stretch savings should continue after a purchase, that requires an explicit continuation rule rather than silently reusing a depleted balance.

## Proposed data entities

| Entity | Purpose |
| --- | --- |
| Auth user | Sign-in identity |
| Profile/settings | Owner, currency, timezone, hourly rate, weekly hours, savings budget |
| Goal | Owner, name, start date, primary milestone, active/acquired/archived status |
| Milestone | Owner, goal, cumulative amount, due date, ordering |
| Plan version | Owner, milestone, baseline dates, starting balance and target |
| Cash account | Owner, Bank or goal account; one Bank per owner |
| Transaction | Owner, type, effective date, creation time, note, idempotency key, reversal reference |
| Transaction entry | Owner, transaction, account, signed minor-unit amount |
| Acquisition | Owner, goal, actual price, acquisition date, settlement transaction |

Every owned record carries a user ID. Constraints and server authorization ensure linked records have the same owner. Enforce one primary milestone per goal and prevent changing a goal to an invalid state. Do not cascade-delete posted financial history when archiving a goal.

## Implementation sequence

1. Settle platform choices and the proposed acquisition/Bank semantics.
2. Implement and verify the money ledger and schedule calculations, including month boundaries, overdue dates, shared milestones, and acquisitions above/below savings.
3. Build the overview, goal editor, contribution flow, Bank, and settings.
4. Connect sign-in, ownership policies, atomic posting functions, migrations, and export.
5. Verify with two test identities for data isolation, plus transaction retries and concurrent spending, before storing live data.
6. Provision and deploy the selected hosting/database services.

Implemented defaults: Bank cannot be negative; acquisition closes all milestones; settings collect hourly rate, gross/take-home designation, optional weekly hours, and optional weekly savings budget. The initial Supabase migration and live integration checks are complete. Owner sign-in setup and Cloudflare deployment are documented separately.
