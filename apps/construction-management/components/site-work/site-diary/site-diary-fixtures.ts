import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import {
  SITE_WORK_ACCESS_MENUS,
  type SiteWorkAccessMenu,
} from "@/app/api/construction/site-work/access/access-models";
import { mockSiteWorkDocumentApi } from "@/components/site-work/documents/site-work-document-fixtures";
import { localToday } from "@/components/procurement/inventory/inventory-format";
import { menuByKey, type Flag } from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { addDays } from "@/src/shared-kernel/calendar-date";
import type { SiteDiary, SiteDiaryDays } from "@/src/queries/site-diary";

/** Story fixtures for the Site Diary (CM-607). */

export const SITE_DIARY_API = "/api/construction/site-work/site-diary";
export const DIARY_PROJECT_ID = "0199c4a0-0000-7000-8000-0000000e0001";
/** Yesterday, so the stepper can go a day forward; dates follow the clock. */
export const DIARY_DATE = addDays(localToday(), -1);
/** Another diary earlier in the same month list. */
export const EARLIER_DATE = addDays(DIARY_DATE, -2);

const KARTHIK = { userId: "user-karthik", name: "Karthik R" };

/** What the viewer may do in site work (every supported flag unless given). */
export function siteWorkAccess(
  projectId: string | null,
  flags: Partial<Record<SiteWorkAccessMenu, Flag[]>> = {},
) {
  return {
    projectId,
    menus: Object.fromEntries(
      SITE_WORK_ACCESS_MENUS.map((menu) => [
        menu,
        flags[menu] ?? fromMask(menuByKey(menu)?.supported ?? 0),
      ]),
    ),
  };
}

export function siteDiary(extra: Partial<SiteDiary> = {}): SiteDiary {
  return {
    id: "0199c4a0-0000-7000-8000-0000000e1001",
    projectId: DIARY_PROJECT_ID,
    diaryDate: DIARY_DATE,
    weatherMorning: "sunny",
    weatherAfternoon: "light_rain",
    rainfallMm: "4.5",
    siteCondition: "Slushy near the ramp; access road usable.",
    notes: "Slab pour moved to Monday because of the afternoon rain.",
    visitors: [
      {
        name: "Ravi Shankar",
        organisation: "Client",
        purpose: "Slab reinforcement inspection",
        timeIn: "10:00",
        timeOut: "11:30",
      },
      {
        name: "Meena Iyer",
        organisation: "Structural consultant",
        purpose: null,
        timeIn: "15:00",
        timeOut: null,
      },
    ],
    instructions: [
      {
        givenBy: "Architect",
        givenTo: "Site Engineer",
        instruction: "Add chairs under the top mesh at 1 m spacing.",
        actionTaken: "Done before the pour",
      },
    ],
    createdBy: KARTHIK,
    updatedBy: KARTHIK,
    createdAt: "2026-10-10T12:00:00.000Z",
    updatedAt: "2026-10-10T12:00:00.000Z",
    actions: { edit: true, delete: true, print: true },
    ...extra,
  };
}

export const DIARY_DAYS: SiteDiaryDays = {
  items: [
    {
      id: "0199c4a0-0000-7000-8000-0000000e1001",
      diaryDate: DIARY_DATE,
      weatherMorning: "sunny",
      weatherAfternoon: "light_rain",
      rainfallMm: "4.5",
      visitorCount: 2,
      instructionCount: 1,
    },
    {
      id: "0199c4a0-0000-7000-8000-0000000e1002",
      diaryDate: EARLIER_DATE,
      weatherMorning: "cloudy",
      weatherAfternoon: null,
      rainfallMm: null,
      visitorCount: 0,
      instructionCount: 0,
    },
  ],
};

export type SiteDiaryApiOptions = {
  /** Diaries by date; dates not here have none. */
  diaries?: Record<string, SiteDiary>;
  flags?: Partial<Record<SiteWorkAccessMenu, Flag[]>>;
  /** Refuse create with SITE_DIARY_EXISTS. */
  exists?: boolean;
};

/** Answers the Site Diary screens' reads and writes for one story. */
export function siteDiaryHandler(
  options: SiteDiaryApiOptions = {},
): (call: ApiCall) => Response | undefined {
  const diaries = options.diaries ?? { [DIARY_DATE]: siteDiary() };
  const documents = mockSiteWorkDocumentApi();
  return (call) => {
    const thread = documents(call);
    if (thread != null) return thread;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (path === "/api/construction/site-work/access")
      return Response.json(
        siteWorkAccess(url.searchParams.get("projectId"), options.flags),
      );
    if (call.method === "GET" && path === `${SITE_DIARY_API}/by-date`) {
      const date = url.searchParams.get("date") ?? "";
      return Response.json({ date, diary: diaries[date] ?? null });
    }
    if (call.method === "GET" && path === SITE_DIARY_API) {
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      return Response.json({
        items: DIARY_DAYS.items.filter(
          (day) => day.diaryDate >= from && day.diaryDate <= to,
        ),
      } satisfies SiteDiaryDays);
    }
    if (call.method === "POST" && path === SITE_DIARY_API) {
      if (options.exists === true)
        return Response.json(
          {
            code: "SITE_DIARY_EXISTS",
            message:
              "This Project already has a Site Diary for that date. Open it and edit it instead.",
          },
          { status: 409 },
        );
      return Response.json(
        siteDiary({ ...(call.body as Partial<SiteDiary>) }),
        { status: 201 },
      );
    }
    const item =
      /^\/api\/construction\/site-work\/site-diary\/([^/]+)(?:\/([a-z]+))?$/.exec(
        path,
      );
    if (item != null) {
      const [, id, action] = item;
      const found =
        Object.values(diaries).find((diary) => diary.id === id) ?? siteDiary();
      if (call.method === "GET" && action == null) return Response.json(found);
      if (call.method === "POST" && action === "update")
        return Response.json({
          ...found,
          ...(call.body as Partial<SiteDiary>),
        });
      if (call.method === "POST" && action === "delete")
        return new Response(null, { status: 204 });
    }
    return undefined;
  };
}

export function mockSiteDiaryApi(options: SiteDiaryApiOptions = {}) {
  return mockApi(siteDiaryHandler(options));
}
