# CM-0004 — Balances are the sum of immutable ledger entries

- Status: accepted
- Date: 2026-10-08
- Ticket: CM-201

The legacy app kept running figures: a labourer's opening balance was an editable number, and payment screens worked out "Previous Balance" and "To Pay" from whatever the tables held at that moment. Edit a wage, an opening balance or an old attendance day and every past figure silently changed, with no record of what it used to be. Indian compliance (wage registers, TDS, RERA accounts, stock registers) needs the opposite: every amount traceable to the event that caused it, and old periods that stay closed.

## Decision

**Every balance is derived from append-only ledger entries; no balance column exists.** That covers labour and vendor balances now (M2), and petty cash, bank and cash accounts, party balances and stock later (M5, M7).

- **An entry is immutable.** It has a party, an optional Project, a date, a kind, a signed amount in integer paise (ADR CM-0001's Money), and the source that wrote it (`source_type`, `source_id`). Rows are never updated or deleted.
- **The opening balance is an entry** (`kind = opening`), dated the party's joining date. It is not a field on the party.
- **A change writes a reversal and a new entry.** Re-marking an attendance day, changing an opening balance or cancelling a payment writes one entry that negates the old one (`reverses_entry_id`, unique, so nothing is reversed twice), then the replacement if there is one. The history shows what was owed, when and why.
- **Sign convention for labour and vendors:** positive means the Company owes the party (opening owed, wages earned, overtime); payments and advances are negative. A negative opening balance is an advance given before the app.
- **Reports read balances from entries.** The balance on a date is the sum of entries up to that date. A period summary is: opening (before the period), earned, overtime, advances, payments, closing. The legacy labour payment figures map onto it: Previous Balance = opening; To Pay = earned + overtime; Advance = advances; Final Amount = closing.
- **Amounts are snapshots.** An attendance row keeps the wage rate it was priced at and its earned amount; a vendor attendance line keeps the rate card it was priced at. Changing a labourer's wage or a vendor's rates changes future days, never past ones.
- **Amounts fit a 32-bit column; sums are 64-bit.** One entry or payment is at most 2,147,483,647 paise (`AMOUNT_TOO_LARGE` above it; payments and wages cap at ₹2 crore). Every sum of money is computed in SQL as `SUM(amount)::bigint`, so totals past ₹2.14 crore stay exact.
- **A party cannot be deleted while it is being paid or marked.** Writers lock the Labour or Vendor row `FOR SHARE` and a delete locks it `FOR UPDATE`, checking for records inside the same transaction.
- **The entry is written in the same transaction as its source row**, so a saved attendance day always has its money and vice versa.

## Consequences

- Balance queries are `SUM(amount)` over an indexed `(workspace_id, party_type, party_id, entry_date)` range. That is fast enough at site scale; a snapshot table can be added later without changing the rule.
- The Financial Closing Date (CM-113) and back-dated limits stop edits that would reverse entries in closed periods; the ledger itself stays append-only.
- Code that "fixes" a balance must post an entry. There is nothing else to update.

## Considered options

- **Stored running balance updated on every write:** fast reads, but edits rewrite history and concurrent writes race. Rejected.
- **Recomputing balances from attendance and payments on every read, with no ledger:** a wage change would reprice the past, and there is no audit trail. Rejected.
