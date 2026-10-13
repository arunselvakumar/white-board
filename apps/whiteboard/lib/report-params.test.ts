import { describe, expect, it } from "vitest";

import { reportHref, reportQueryString } from "@/src/queries/reports";

import {
  missingCustomDates,
  missingReportSubject,
  reportParamsFromSearch,
  withReportParam,
} from "./report-params";

const STUDENT = "880e8400-e29b-41d4-a716-446655440001";
const BATCH = "660e8400-e29b-41d4-a716-446655440001";

describe("report parameters", () => {
  it("reads only report parameters from the URL and drops blanks", () => {
    expect(
      reportParamsFromSearch(
        new URLSearchParams("period=last_month&studentId=&utm=x&sort=percent"),
      ),
    ).toEqual({ period: "last_month", sort: "percent" });
  });

  it("sets and removes one parameter", () => {
    const params = withReportParam({}, "batchId", BATCH);
    expect(params).toEqual({ batchId: BATCH });
    expect(withReportParam(params, "batchId", null)).toEqual({});
    expect(withReportParam(params, "batchId", "")).toEqual({});
  });

  it("writes a stable query string, so equal filters share a URL", () => {
    expect(reportQueryString({ sort: "percent", batchId: BATCH })).toBe(
      `batchId=${BATCH}&sort=percent`,
    );
    expect(reportHref("dues")).toBe("/reports/dues");
    expect(reportHref("monthly-review", { month: "2026-09" })).toBe(
      "/reports/monthly-review?month=2026-09",
    );
  });
});

describe("missingReportSubject", () => {
  it("asks staff for a Student or a Batch before building those reports", () => {
    expect(missingReportSubject("student-attendance", "owner", {})).toBe(
      "student",
    );
    expect(
      missingReportSubject("student-attendance", "teacher", {
        studentId: STUDENT,
      }),
    ).toBeNull();
    expect(missingReportSubject("attendance-register", "teacher", {})).toBe(
      "batch",
    );
    expect(missingReportSubject("monthly-student", "owner", {})).toBe(
      "studentOrBatch",
    );
    expect(
      missingReportSubject("monthly-student", "owner", { batchId: BATCH }),
    ).toBeNull();
    expect(missingReportSubject("dues", "owner", {})).toBeNull();
  });

  it("never asks families: they always have a Student", () => {
    expect(missingReportSubject("student-attendance", "parent", {})).toBeNull();
    expect(missingReportSubject("monthly-student", "student", {})).toBeNull();
  });
});

it("waits for both dates of a custom range", () => {
  expect(missingCustomDates({ period: "custom", from: "2026-10-01" })).toBe(
    true,
  );
  expect(
    missingCustomDates({
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-31",
    }),
  ).toBe(false);
  expect(missingCustomDates({ period: "this_month" })).toBe(false);
});
