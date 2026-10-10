import type {
  TestingItem,
  TestingReport,
} from "@/src/queries/project-testing-reports";

import { mockApi } from "../../../.storybook/mocks/api";

/** Story fixtures for Testing Reports (CM-409). */
export const TESTING_PROJECT_ID = "0199c4a0-0000-7000-8000-0000000000b2";

export const TESTING_API = `/api/construction/projects/projects/${TESTING_PROJECT_ID}/testing-reports`;

const LOADED_AT = "2026-09-01T05:00:00.000Z";

function itemId(n: number): string {
  return `0199c4a0-0000-7000-8000-0000000e${String(n).padStart(4, "0")}`;
}

function reportId(n: number): string {
  return `0199c4a0-0000-7000-8000-0000000f${String(n).padStart(4, "0")}`;
}

/** The four every Project starts with, by name. */
export const BRICKS_ID = itemId(1);
export const CEMENT_ID = itemId(2);
export const RCC_CUBE_ID = itemId(3);
export const STEEL_ID = itemId(4);

const SEEDS: { id: string; name: string }[] = [
  { id: BRICKS_ID, name: "Bricks" },
  { id: CEMENT_ID, name: "Cement" },
  { id: RCC_CUBE_ID, name: "Rcc cube" },
  { id: STEEL_ID, name: "Steel" },
];

/** A report; a `.pdf` name is a PDF, anything else a JPEG photo of the sheet. */
export function testingReport(
  n: number,
  item: string,
  name: string,
  reportDate: string,
  extra: Partial<TestingReport> = {},
): TestingReport {
  const id = reportId(n);
  const fileName = extra.fileName ?? `${name}.pdf`;
  const pdf = fileName.toLowerCase().endsWith(".pdf");
  return {
    id,
    itemId: item,
    name,
    reportDate,
    remark: null,
    fileName,
    contentType: pdf ? "application/pdf" : "image/jpeg",
    bytes: 640 * 1024,
    viewable: true,
    url: `${TESTING_API}/reports/${id}/file`,
    thumbUrl: null,
    createdAt: `${reportDate}T06:30:00.000Z`,
    updatedAt: `${reportDate}T06:30:00.000Z`,
    createdBy: "user-karthik",
    createdByName: "Karthik R",
    ...extra,
  };
}

/** 30 cube tests, one every few days back from 4 Mar 2026: two pages of 25. */
function cubeTests(): TestingReport[] {
  const start = Date.UTC(2026, 2, 4);
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(start - index * 3 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const pour = 30 - index;
    return testingReport(
      100 + index,
      RCC_CUBE_ID,
      `Cube test – pour ${String(pour)}`,
      date,
      index === 0
        ? {
            remark:
              "28-day strength 31.2 N/mm² against M25. Passed. Lab: Sri Ganesh Testing Lab, Tirunelveli.",
          }
        : {},
    );
  });
}

/** A Bricks report with a remark, for editing. */
export const COMPRESSIVE_LOT_1 = testingReport(
  1,
  BRICKS_ID,
  "Compressive strength – lot 1",
  "2026-02-12",
  { remark: "Average 4.1 N/mm². Class B." },
);

/** The Project's reports, any order (the mock sorts them as the API does). */
export const TESTING_REPORTS: TestingReport[] = [
  COMPRESSIVE_LOT_1,
  testingReport(2, BRICKS_ID, "Water absorption – lot 1", "2026-02-14", {
    fileName: "Water absorption lot 1.jpg",
    createdByName: null,
  }),
  testingReport(3, CEMENT_ID, "Setting time – UltraTech 53", "2026-01-20"),
  testingReport(4, CEMENT_ID, "Fineness – UltraTech 53", "2026-01-20"),
  testingReport(5, CEMENT_ID, "Soundness – Ramco 53", "2026-02-02", {
    remark: "Le Chatelier 2 mm.",
  }),
  ...cubeTests(),
];

type StoryError = { status: number; code: string; message: string };

function refuse(error: StoryError): Response {
  return Response.json(
    { code: error.code, message: error.message },
    { status: error.status },
  );
}

/** Pages are `o<offset>` cursors over the sorted list. */
const PAGE = 25;

/**
 * A Testing Reports API that remembers adds, renames, edits and deletes
 * for one story. Files go up on the `app` path (pair with
 * `mockXhrUploads`). `saveError` refuses adding or editing a report with
 * that error (a back-dated refusal, say).
 */
export function mockTestingReportsApi(
  options: {
    items?: { id: string; name: string }[];
    reports?: TestingReport[];
    saveError?: StoryError;
  } = {},
) {
  let items = (options.items ?? SEEDS).map((item) => ({
    ...item,
    isSeed: SEEDS.some((seed) => seed.id === item.id),
    updatedAt: LOADED_AT,
  }));
  let reports = [...(options.reports ?? TESTING_REPORTS)];
  const keys = new Map<string, { fileName: string; bytes: number }>();
  let next = 500;

  const withCount = (item: (typeof items)[number]): TestingItem => ({
    ...item,
    reportCount: reports.filter((report) => report.itemId === item.id).length,
  });
  const nameTaken = (name: string, except?: string) =>
    items.some(
      (item) =>
        item.id !== except &&
        item.name.toLowerCase() === name.trim().toLowerCase(),
    );
  const nameInUse = () =>
    refuse({
      status: 409,
      code: "TESTING_ITEM_NAME_IN_USE",
      message: "A testing material with this name is already on the Project.",
    });

  return mockApi((call) => {
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (!path.startsWith(TESTING_API)) return undefined;
    const rest = path.slice(TESTING_API.length);

    if (rest === "/items" && call.method === "GET")
      return Response.json({
        items: [...items]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(withCount),
      });
    if (rest === "/items" && call.method === "POST") {
      const { name } = call.body as { name: string };
      if (nameTaken(name)) return nameInUse();
      next += 1;
      const added = {
        id: itemId(next),
        name: name.trim(),
        isSeed: false,
        updatedAt: "2026-10-09T06:30:00.000Z",
      };
      items = [...items, added];
      return Response.json(withCount(added), { status: 201 });
    }

    const itemRoute = /^\/items\/([^/]+)(\/.*)?$/.exec(rest);
    if (itemRoute != null) {
      const id = itemRoute[1];
      const action = itemRoute[2] ?? "";
      const item = items.find((candidate) => candidate.id === id);
      if (item == null)
        return refuse({
          status: 404,
          code: "TESTING_ITEM_NOT_FOUND",
          message: "This testing material is not on the Project.",
        });
      if (action === "/update" && call.method === "POST") {
        const body = call.body as { name: string; updatedAt: string };
        if (body.updatedAt !== item.updatedAt)
          return refuse({
            status: 409,
            code: "TESTING_ITEM_CHANGED",
            message:
              "Someone changed this testing material since you opened it. Reload and try again.",
          });
        if (nameTaken(body.name, item.id)) return nameInUse();
        const renamed = {
          ...item,
          name: body.name.trim(),
          updatedAt: "2026-10-09T06:31:00.000Z",
        };
        items = items.map((candidate) =>
          candidate.id === item.id ? renamed : candidate,
        );
        return Response.json(withCount(renamed));
      }
      if (action === "/delete" && call.method === "POST") {
        const count = withCount(item).reportCount;
        if (count > 0)
          return Response.json(
            {
              code: "TESTING_ITEM_NOT_EMPTY",
              message: "This testing material has reports. Delete them first.",
              details: { reports: count },
            },
            { status: 409 },
          );
        items = items.filter((candidate) => candidate.id !== item.id);
        return new Response(null, { status: 204 });
      }
      if (action === "/reports" && call.method === "GET") {
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        const matching = reports
          .filter(
            (report) =>
              report.itemId === item.id &&
              report.name.toLowerCase().includes(q),
          )
          .sort(
            (a, b) =>
              b.reportDate.localeCompare(a.reportDate) ||
              b.createdAt.localeCompare(a.createdAt),
          );
        const after = url.searchParams.get("after");
        const before = url.searchParams.get("before");
        const start =
          before != null
            ? Math.max(0, Number(before.slice(1)) - PAGE)
            : Number(after?.slice(1) ?? 0);
        const page = matching.slice(start, start + PAGE);
        const last = start + page.length;
        return Response.json({
          item: withCount(item),
          items: page,
          nextCursor: last < matching.length ? `o${String(last)}` : null,
          prevCursor: start > 0 ? `o${String(start)}` : null,
          total: matching.length,
        });
      }
      if (action === "/reports" && call.method === "POST") {
        if (options.saveError != null) return refuse(options.saveError);
        const body = call.body as {
          name: string;
          reportDate: string;
          remark: string | null;
          key: string;
          fileName: string;
        };
        next += 1;
        const added = testingReport(next, item.id, body.name, body.reportDate, {
          remark: body.remark,
          fileName: body.fileName,
          bytes: keys.get(body.key)?.bytes ?? 0,
          createdAt: "2026-10-09T06:30:00.000Z",
          updatedAt: "2026-10-09T06:30:00.000Z",
        });
        reports = [added, ...reports];
        return Response.json(added, { status: 201 });
      }
    }

    if (rest === "/uploads" && call.method === "POST") {
      const body = call.body as { fileName: string; bytes: number };
      next += 1;
      const key = `companies/w1/testing-reports/${TESTING_PROJECT_ID}/${String(next)}.bin`;
      keys.set(key, body);
      return Response.json(
        {
          key,
          fileName: body.fileName,
          upload: {
            via: "app",
            url: `${TESTING_API}/uploads/app?key=${encodeURIComponent(key)}`,
          },
        },
        { status: 201 },
      );
    }

    const reportRoute = /^\/reports\/([^/]+)\/(update|delete)$/.exec(rest);
    if (reportRoute != null && call.method === "POST") {
      const report = reports.find(
        (candidate) => candidate.id === reportRoute[1],
      );
      if (report == null)
        return refuse({
          status: 404,
          code: "TESTING_REPORT_NOT_FOUND",
          message: "This report is not on the Project.",
        });
      if (reportRoute[2] === "delete") {
        reports = reports.filter((candidate) => candidate.id !== report.id);
        return new Response(null, { status: 204 });
      }
      if (options.saveError != null) return refuse(options.saveError);
      const body = call.body as {
        name: string;
        reportDate: string;
        remark: string | null;
        updatedAt: string;
        file?: { key: string; fileName: string } | null;
      };
      if (body.updatedAt !== report.updatedAt)
        return refuse({
          status: 409,
          code: "TESTING_REPORT_CHANGED",
          message:
            "Someone changed this report since you opened it. Reload and try again.",
        });
      const file = body.file;
      const edited: TestingReport = {
        ...report,
        name: body.name,
        reportDate: body.reportDate,
        remark: body.remark,
        updatedAt: "2026-10-09T06:31:00.000Z",
        ...(file == null
          ? {}
          : {
              fileName: file.fileName,
              contentType: file.fileName.toLowerCase().endsWith(".pdf")
                ? "application/pdf"
                : "image/jpeg",
              bytes: keys.get(file.key)?.bytes ?? 0,
            }),
      };
      reports = reports.map((candidate) =>
        candidate.id === report.id ? edited : candidate,
      );
      return Response.json(edited);
    }
    return undefined;
  });
}
