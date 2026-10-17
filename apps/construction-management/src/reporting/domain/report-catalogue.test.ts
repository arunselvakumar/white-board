import { describe, expect, it } from "vitest";

import {
  catalogueEntry,
  entriesIn,
  REPORT_CATALOGUE,
} from "./report-catalogue";
import {
  CENTRAL_ONLY_KINDS,
  CENTRAL_REPORT_KINDS,
  FINANCE_REPORT_KINDS,
  isMoneyReport,
  isReportAvailable,
  printsAmounts,
  PROGRESS_REPORT_KINDS,
  REPORT_KINDS,
  REPORT_TITLES,
  reportFormats,
} from "./report-job";

const NEW_KINDS = [
  "purchase_requests",
  "purchase_orders",
  "material_received",
  "material_transfers",
  "stock_register",
  "labour_attendance_central",
] as const;

describe("the report catalogue (ADR CM-0021 §2)", () => {
  it("describes every kind of report job exactly once", () => {
    const kinds = REPORT_CATALOGUE.map((entry) => entry.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect([...kinds].sort()).toEqual([...REPORT_KINDS].sort());
    for (const entry of REPORT_CATALOGUE) {
      expect(entry.title, entry.kind).not.toBe("");
      expect(entry.description, entry.kind).not.toBe("");
      expect(entry.scopes.length, entry.kind).toBeGreaterThan(0);
      expect(entry.formats, entry.kind).toContain("pdf");
    }
  });

  it("titles every kind from the catalogue", () => {
    expect(REPORT_TITLES.muster_roll).toBe("Muster roll and wage register");
    expect(REPORT_TITLES.account_ledger).toBe("Ledger");
    expect(REPORT_TITLES.stock_register).toBe("Stock Register");
  });

  it("derives the central kinds the routes used to list by hand", () => {
    expect(CENTRAL_REPORT_KINDS).toEqual(
      expect.arrayContaining([
        "vendor_attendance",
        "equipment_maintenance",
        "equipment_transfers",
        "account_ledger",
        "tds_194c",
        "due_payments",
      ]),
    );
    expect(CENTRAL_REPORT_KINDS).not.toContain("labour_attendance");
    expect(CENTRAL_REPORT_KINDS).not.toContain("daily_progress_report");
    expect([...CENTRAL_ONLY_KINDS].sort()).toEqual([
      "account_ledger",
      "labour_attendance_central",
      "tds_194c",
    ]);
  });

  it("derives the Progress Reports and their PDF-only files", () => {
    expect(PROGRESS_REPORT_KINDS).toEqual([
      "daily_progress_report",
      "task_progress_report",
    ]);
    expect(reportFormats("daily_progress_report")).toEqual(["pdf"]);
    expect(reportFormats("task_progress_report")).toEqual(["pdf"]);
    expect(reportFormats("labour_attendance")).toEqual(["xlsx", "pdf"]);
    expect(catalogueEntry("daily_progress_report").request).toBe("create");
  });

  it("derives the finance kinds and the money rules", () => {
    expect([...FINANCE_REPORT_KINDS].sort()).toEqual([
      "account_ledger",
      "contractor_payments",
      "due_payments",
      "other_expenses",
      "petty_cash",
      "supplier_payments",
      "tds_194c",
      "transactions",
    ]);
    const about = REPORT_KINDS.filter(isMoneyReport);
    expect([...about].sort()).toEqual(
      ["labour_payment", "muster_roll", ...FINANCE_REPORT_KINDS].sort(),
    );
    const amountFree = REPORT_KINDS.filter((kind) => !printsAmounts(kind));
    expect(amountFree).toEqual(
      expect.arrayContaining([
        "labour_attendance",
        "daily_work",
        "owned_equipment_usage",
        "equipment_transfers",
        "issue_snag_report",
        "inspection_request_report",
        "task_progress_report",
      ]),
    );
    expect(printsAmounts("daily_progress_report")).toBe(true);
    expect(catalogueEntry("daily_progress_report").moneyMenu).toBe(
      "site_work.equipment_usage",
    );
  });

  it("catalogues the six CM-903 kinds as not available yet", () => {
    for (const kind of NEW_KINDS) expect(isReportAvailable(kind)).toBe(false);
    expect(
      REPORT_CATALOGUE.filter((entry) => !entry.available).map(
        (entry) => entry.kind,
      ),
    ).toEqual(expect.arrayContaining([...NEW_KINDS]));
    expect(REPORT_CATALOGUE.filter((entry) => !entry.available)).toHaveLength(
      NEW_KINDS.length,
    );
  });

  it("words central entries for the whole Company and keeps the Projects filter central", () => {
    const central = entriesIn("central");
    const project = entriesIn("project");
    const due = central.find((entry) => entry.kind === "due_payments");
    expect(due?.description).toMatch(/across Projects/);
    expect(
      project.find((entry) => entry.kind === "due_payments")?.description,
    ).toMatch(/on this Project/);
    expect(central.map((entry) => entry.kind)).not.toContain("muster_roll");
    expect(project.map((entry) => entry.kind)).not.toContain("tds_194c");
    const orders = (scope: typeof central) =>
      scope
        .find((entry) => entry.kind === "purchase_orders")
        ?.filters.map((filter) => filter.key);
    expect(orders(central)).toEqual(["supplier", "projects"]);
    expect(orders(project)).toEqual(["supplier"]);
  });

  it("lists the Project's finance cards in the Reports page's order", () => {
    expect(
      entriesIn("project")
        .filter((entry) => entry.group === "finance")
        .map((entry) => entry.kind),
    ).toEqual([
      "transactions",
      "petty_cash",
      "contractor_payments",
      "supplier_payments",
      "other_expenses",
      "due_payments",
    ]);
    expect(
      entriesIn("central")
        .filter((entry) => entry.group === "finance")
        .map((entry) => entry.kind),
    ).toEqual(["account_ledger", "tds_194c", "due_payments"]);
  });
});
