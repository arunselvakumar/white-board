import type {
  ProjectActivityEntry,
  ProjectActivityPage,
} from "@/src/queries/activity";

/** What "Today" is in the stories: 11 Nov 2026, noon in India. */
export const STORY_NOW = new Date("2026-11-11T06:30:00Z");

export const PROJECT_ID = "0199a1b2-0000-7000-8000-00000000a001";
const GREEN_PARK = {
  id: "0199a1b2-0000-7000-8000-00000000a002",
  name: "Green Park",
  canOpen: true,
};
const by = "Arun Selva Kumar";

function at(date: string, time = "10:15"): string {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

function labour(n: number, name: string, canOpen = true) {
  return {
    id: `0199a1b2-0000-7000-8000-0000000b${String(n).padStart(4, "0")}`,
    name,
    labourCode: `L-${String(n).padStart(3, "0")}`,
    labourCategory: n % 2 === 0 ? "Helper" : "Mason",
    canOpen,
  };
}

const BATCH = [
  "Arul",
  "Bala",
  "Chandran",
  "Dinesh",
  "Ezhil",
  "Ganesh",
  "Hari",
  "Ilango",
  "Jeeva",
  "Kumar",
  "Mani",
  "Naveen",
].map((name, index) => labour(index + 10, name));

/** One of each kind, a batch of 12 among them, newest first. */
export const PROJECT_ENTRIES: ProjectActivityEntry[] = [
  {
    id: "site_engineer_added:1",
    kind: "site_engineer_added",
    date: "2026-11-11",
    recordedAt: at("2026-11-11", "11:20"),
    by,
    siteEngineer: {
      id: "0199a1b2-0000-7000-8000-00000000e001",
      name: "Karthik Raja",
      canOpen: true,
    },
  },
  {
    id: "site_engineer_removed:1",
    kind: "site_engineer_removed",
    date: "2026-11-11",
    recordedAt: at("2026-11-11", "11:00"),
    by,
    siteEngineer: { id: null, name: "Meena", canOpen: false },
  },
  {
    id: "labour_removed:1",
    kind: "labour_removed",
    date: "2026-11-10",
    recordedAt: at("2026-11-11", "09:30"),
    by,
    labours: [labour(1, "Dhuresh Nawin")],
    remark: "Work finished",
  },
  {
    id: "transferred_out:1",
    kind: "transferred_out",
    date: "2026-11-08",
    recordedAt: at("2026-11-08"),
    by,
    labours: [labour(2, "Selvi", false)],
    toProject: GREEN_PARK,
    remark: null,
  },
  {
    id: "transferred_in:1",
    kind: "transferred_in",
    date: "2026-11-05",
    recordedAt: at("2026-11-04"),
    by,
    labours: [labour(3, "Ravi"), labour(4, "Murugan")],
    fromProject: { ...GREEN_PARK, canOpen: false },
    remark: "Slab casting",
  },
  {
    id: "labour_added:1",
    kind: "labour_added",
    date: "2026-11-01",
    recordedAt: at("2026-11-01"),
    by,
    labours: BATCH,
    remark: "New gang",
  },
];

export function projectActivityPage(
  items: ProjectActivityEntry[],
  nextCursor: string | null = null,
): ProjectActivityPage {
  return { items, nextCursor, timeZone: "Asia/Kolkata" };
}

/** `count` single additions back from 10 Nov 2026, newest first. */
export function additions(count: number, offset = 0): ProjectActivityEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const n = offset + index;
    const date = new Date(Date.UTC(2026, 10, 10 - n))
      .toISOString()
      .slice(0, 10);
    return {
      id: `labour_added:${String(n)}`,
      kind: "labour_added" as const,
      date,
      recordedAt: at(date),
      by,
      labours: [labour(100 + n, `Labour ${String(n + 1)}`)],
      remark: null,
    };
  });
}
