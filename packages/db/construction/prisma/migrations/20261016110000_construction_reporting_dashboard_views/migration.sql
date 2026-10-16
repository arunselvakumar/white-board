-- CM-902 (ADR CM-0021 §4): the dashboard's headline counts as SQL in the
-- reporting schema, so a KPI tile, the Company Dashboard and a report never
-- disagree. Reporting is a read model: these objects SELECT from other
-- contexts' schemas and never write to them. Plain views and SQL functions,
-- not materialised: the counts are cheap and must be live. Tombstoned rows
-- (`deleted_at` set) are left out everywhere.

-- ---------------------------------------------------------------------------
-- project_pending_approvals: documents waiting for a decision, per Project
-- and module. The same status rules as each module's list with "Pending"
-- chosen: approval_status = 'pending' on a live row. A Purchase Order counts
-- on the Project it is for, a Material Transfer on the Project it leaves (it
-- approves the transfer), a settlement on its live invoice's Project.
-- ---------------------------------------------------------------------------
CREATE VIEW "construction_reporting"."project_pending_approvals" AS
SELECT workspace_id, project_id, 'purchase_requests'::text AS module, count(*)::int AS pending
FROM "construction_procurement"."purchase_requests"
WHERE approval_status = 'pending' AND deleted_at IS NULL
GROUP BY workspace_id, project_id
UNION ALL
SELECT workspace_id, location_id, 'purchase_orders', count(*)::int
FROM "construction_procurement"."purchase_orders"
WHERE location_kind = 'project' AND approval_status = 'pending' AND deleted_at IS NULL
GROUP BY workspace_id, location_id
UNION ALL
SELECT workspace_id, from_id, 'material_transfers', count(*)::int
FROM "construction_procurement"."material_transfers"
WHERE from_kind = 'project' AND approval_status = 'pending' AND deleted_at IS NULL
GROUP BY workspace_id, from_id
UNION ALL
SELECT workspace_id, project_id, 'worksheets', count(*)::int
FROM "construction_site_work"."worksheets"
WHERE approval_status = 'pending' AND deleted_at IS NULL
GROUP BY workspace_id, project_id
UNION ALL
SELECT workspace_id, project_id, 'equipment_usage_sheets', count(*)::int
FROM "construction_site_work"."equipment_usage_sheets"
WHERE approval_status = 'pending' AND deleted_at IS NULL
GROUP BY workspace_id, project_id
UNION ALL
SELECT workspace_id, project_id, 'transactions', count(*)::int
FROM "construction_finance"."transactions"
WHERE project_id IS NOT NULL AND approval_status = 'pending' AND deleted_at IS NULL
GROUP BY workspace_id, project_id
UNION ALL
SELECT workspace_id, project_id, 'account_transfers', count(*)::int
FROM "construction_finance"."account_transfers"
WHERE project_id IS NOT NULL AND approval_status = 'pending' AND deleted_at IS NULL
GROUP BY workspace_id, project_id
UNION ALL
SELECT workspace_id, project_id, 'petty_cash_vouchers', count(*)::int
FROM "construction_finance"."petty_cash_vouchers"
WHERE project_id IS NOT NULL AND approval_status = 'pending' AND deleted_at IS NULL
GROUP BY workspace_id, project_id
UNION ALL
SELECT workspace_id, project_id, 'other_expenses', count(*)::int
FROM "construction_finance"."other_expenses"
WHERE approval_status = 'pending' AND deleted_at IS NULL
GROUP BY workspace_id, project_id
UNION ALL
SELECT s.workspace_id, i.project_id, 'invoice_settlements', count(*)::int
FROM "construction_finance"."settlements" s
JOIN "construction_finance"."invoices" i ON i.id = s.invoice_id
WHERE i.project_id IS NOT NULL AND i.deleted_at IS NULL
  AND s.approval_status = 'pending' AND s.deleted_at IS NULL
GROUP BY s.workspace_id, i.project_id;

COMMENT ON VIEW "construction_reporting"."project_pending_approvals" IS
'CM-902 (ADR CM-0021 §4). Live documents with approval_status pending, per Company, Project and module (purchase_requests, purchase_orders, material_transfers, worksheets, equipment_usage_sheets, transactions, account_transfers, petty_cash_vouchers, other_expenses, invoice_settlements). Readers: the Project Dashboard''s Material Approvals tile (GET /api/construction/procurement/dashboard) and Payment Approvals tile (GET /api/construction/finance/dashboard), and the Company Dashboard''s approvals waiting (GET /api/construction/reporting/company-dashboard), all through src/reporting/infrastructure/prisma-dashboard-source.ts. Each count shows only to a member with that module''s Approve flag on the Project.';

-- ---------------------------------------------------------------------------
-- project_pending_tracking: per Project, pending and delayed Issues & Snags
-- and Inspection Requests pending a decision. Delayed is M8's rule
-- (`issueStatusSql`, ADR CM-0019 §7): open with a due date before the
-- Company's today, which the caller passes. Issues follow the duration by
-- Issue Date and inspections by Inspection Date (both ends counted; null for
-- no bound). Without View all on Issues & Snags the caller passes its user
-- and Team Member: only issues it created or is assigned count (CM-803).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "construction_reporting"."project_pending_tracking"(
  p_workspace_id text,
  p_today date,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_own_user_id text DEFAULT NULL,
  p_own_member_id uuid DEFAULT NULL
)
RETURNS TABLE (
  project_id uuid,
  pending_issues int,
  delayed_issues int,
  pending_inspections int
)
LANGUAGE sql STABLE
AS $$
  SELECT t.project_id,
         COALESCE(sum(t.pending_issues), 0)::int,
         COALESCE(sum(t.delayed_issues), 0)::int,
         COALESCE(sum(t.pending_inspections), 0)::int
  FROM (
    SELECT i.project_id,
           count(*) FILTER (
             WHERE NOT (i.due_date IS NOT NULL AND i.due_date < p_today)
           ) AS pending_issues,
           count(*) FILTER (
             WHERE i.due_date IS NOT NULL AND i.due_date < p_today
           ) AS delayed_issues,
           0 AS pending_inspections
    FROM "construction_tracking"."issues" i
    WHERE i.workspace_id = p_workspace_id
      AND i.deleted_at IS NULL
      AND i.status = 'open'
      AND (p_from IS NULL OR i.issue_date >= p_from)
      AND (p_to IS NULL OR i.issue_date <= p_to)
      AND (p_own_user_id IS NULL
        OR i.created_by = p_own_user_id
        OR (p_own_member_id IS NOT NULL AND i.assignee_member_id = p_own_member_id))
    GROUP BY i.project_id
    UNION ALL
    SELECT r.project_id, 0, 0, count(*)
    FROM "construction_tracking"."inspections" r
    WHERE r.workspace_id = p_workspace_id
      AND r.deleted_at IS NULL
      AND r.status = 'pending'
      AND (p_from IS NULL OR r.inspection_date >= p_from)
      AND (p_to IS NULL OR r.inspection_date <= p_to)
    GROUP BY r.project_id
  ) t
  GROUP BY t.project_id
$$;

COMMENT ON FUNCTION "construction_reporting"."project_pending_tracking"(text, date, date, date, text, uuid) IS
'CM-902 (ADR CM-0021 §4, CM-0019 §7). Per Project of a Company: open Issues & Snags not delayed (pending), open ones past their due date on p_today (delayed), and Inspection Requests pending a decision, within an optional Issue / Inspection Date range; p_own_user_id / p_own_member_id limit issues to the caller''s own and assigned (no View all). Readers: the Project Dashboard''s Pending Issues & Snags and Pending Inspections tiles (GET /api/construction/tracking/dashboard) and the Company Dashboard (GET /api/construction/reporting/company-dashboard), through src/reporting/infrastructure/prisma-dashboard-source.ts.';

-- ---------------------------------------------------------------------------
-- party_dues_on: what is owed on invoices per Project and party, as on a
-- day. The finance rule (ADR CM-0017 §7, `loadDueInvoices` + `partyDues`):
--   allocated   Σ live allocations whose payment is live, paid by p_as_on;
--   written off Σ write-off entries by p_as_on (− on a bill from the party);
--   settled     settled_at set by p_as_on (in India's time, as finance does);
--   balance     0 for a settled invoice without a write-off entry, else
--               amount − allocated − written off, never below zero;
--   overdue     the balance of an unsettled invoice due before p_as_on.
-- Invoices dated after p_as_on are left out. p_as_on null: everything, and
-- nothing is overdue. Amounts are bigint paise.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "construction_reporting"."party_dues_on"(
  p_workspace_id text,
  p_as_on date
)
RETURNS TABLE (
  project_id uuid,
  store_id uuid,
  direction text,
  party_type text,
  party_id uuid,
  invoiced bigint,
  paid bigint,
  written_off bigint,
  due bigint,
  overdue bigint,
  open_invoices int
)
LANGUAGE sql STABLE
AS $$
  WITH figures AS (
    SELECT i.project_id, i.store_id, i.direction::text AS direction,
           i.party_type::text AS party_type, i.party_id, i.amount, i.due_date,
           COALESCE((
             SELECT sum(a.amount)
             FROM "construction_finance"."payment_allocations" a
             JOIN "construction_finance"."party_payments" p ON p.id = a.payment_id
             WHERE a.invoice_id = i.id AND a.deleted_at IS NULL
               AND p.deleted_at IS NULL
               AND (p_as_on IS NULL OR p.payment_date <= p_as_on)
           ), 0)::bigint AS allocated,
           (CASE WHEN i.direction = 'payable' THEN -1 ELSE 1 END) * COALESCE((
             SELECT sum(e.amount)
             FROM "construction_finance"."party_entries" e
             WHERE e.invoice_id = i.id AND e.kind = 'write_off'
               AND (p_as_on IS NULL OR e.entry_date <= p_as_on)
           ), 0)::bigint AS written_off,
           (i.settled_at IS NOT NULL
             AND (p_as_on IS NULL
               OR (i.settled_at AT TIME ZONE 'Asia/Kolkata')::date <= p_as_on)) AS settled
    FROM "construction_finance"."invoices" i
    WHERE i.workspace_id = p_workspace_id
      AND i.deleted_at IS NULL
      AND (p_as_on IS NULL OR i.invoice_date <= p_as_on)
  ),
  balances AS (
    SELECT f.*,
           CASE WHEN f.settled AND f.written_off = 0 THEN 0::bigint
                ELSE GREATEST(f.amount - f.allocated - f.written_off, 0)::bigint
           END AS balance,
           CASE WHEN f.settled AND f.written_off = 0
                  THEN GREATEST(f.amount - f.allocated, 0)::bigint
                ELSE f.written_off
           END AS shown_written_off
    FROM figures f
  )
  SELECT b.project_id, b.store_id, b.direction, b.party_type, b.party_id,
         sum(b.amount)::bigint,
         sum(b.allocated)::bigint,
         sum(b.shown_written_off)::bigint,
         sum(b.balance)::bigint,
         COALESCE(sum(b.balance) FILTER (
           WHERE b.due_date IS NOT NULL AND b.due_date < p_as_on
             AND NOT b.settled AND b.balance > 0
         ), 0)::bigint,
         (count(*) FILTER (WHERE b.balance > 0))::int
  FROM balances b
  GROUP BY b.project_id, b.store_id, b.direction, b.party_type, b.party_id
$$;

COMMENT ON FUNCTION "construction_reporting"."party_dues_on"(text, date) IS
'CM-902 (ADR CM-0021 §4, CM-0017 §7). Per Project (or Store), direction and party of a Company: invoiced, paid (allocated, money and TDS), written off, due and overdue as on p_as_on, bigint paise; the rule of the Due Payments widget and report. Readers: the Project Dashboard''s Due Payments widget (GET /api/construction/finance/dashboard, as on the duration''s last day) through src/reporting/infrastructure/prisma-dashboard-source.ts, and the party_dues view.';

-- ---------------------------------------------------------------------------
-- party_dues: party_dues_on as on each Company's today (its profile's time
-- zone, India by default). Filter by workspace_id: the filter reaches the
-- inner list of Companies, so only that Company's invoices are read.
-- ---------------------------------------------------------------------------
CREATE VIEW "construction_reporting"."party_dues" AS
SELECT w.workspace_id, w.as_on,
       d.project_id, d.store_id, d.direction, d.party_type, d.party_id,
       d.invoiced, d.paid, d.written_off, d.due, d.overdue, d.open_invoices
FROM (
  SELECT c.workspace_id,
         (now() AT TIME ZONE COALESCE(p.timezone, 'Asia/Kolkata'))::date AS as_on
  FROM (SELECT DISTINCT workspace_id FROM "construction_finance"."invoices") c
  LEFT JOIN "construction_organization"."company_profiles" p
    ON p.workspace_id = c.workspace_id
) w
CROSS JOIN LATERAL "construction_reporting"."party_dues_on"(w.workspace_id, w.as_on) d;

COMMENT ON VIEW "construction_reporting"."party_dues" IS
'CM-902 (ADR CM-0021 §4). party_dues_on as on each Company''s today: per Company, Project (or Store), direction and party, invoiced, paid, written off, due and overdue, bigint paise. Readers: the Company Dashboard''s amount due (GET /api/construction/reporting/company-dashboard, payables, Payments Read on the Project) through src/reporting/infrastructure/prisma-dashboard-source.ts.';
