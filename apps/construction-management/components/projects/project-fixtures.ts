import type { ProjectList, ProjectResponse } from "@/src/queries/projects";

/** Story fixtures for the Project screens. */
const AT = "2026-10-08T06:30:00.000Z";

export function project(
  overrides: Partial<ProjectResponse> = {},
): ProjectResponse {
  return {
    id: "0199c4a0-0000-7000-8000-000000000001",
    name: "Kumari Heights",
    status: "ongoing",
    address: "Plot 12, Survey No. 45, Vadasery, Nagercoil 629001",
    startDate: "2026-04-01",
    endDate: "2027-03-31",
    clientName: null,
    clientPhone: null,
    tenderRef: null,
    quotationNo: null,
    quotationDate: null,
    loaNo: null,
    loaDate: null,
    clientOrderNo: null,
    clientOrderDate: null,
    agreementNo: null,
    agreementDate: null,
    orderValue: null,
    customFields: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

/** A Project with its contract details filled in (CM-413). */
export const KUMARI = project({
  clientName: "Sri Balaji Developers",
  clientPhone: "+919843122110",
  tenderRef: "SBD/T/2026/031",
  quotationNo: "SBD/Q/2026/114",
  quotationDate: "2026-02-10",
  loaNo: "SBD/LOA/2026/022",
  loaDate: "2026-03-05",
  clientOrderNo: "SBD/WO/2026/057",
  clientOrderDate: "2026-03-12",
  agreementNo: "SBD/AGR/2026/009",
  agreementDate: "2026-03-20",
  // ₹4,85,00,000 excluding GST, in paise.
  orderValue: 4_85_00_000_00,
  customFields: [
    { label: "Site engineer", value: "Prabhu Saravanan" },
    { label: "Client architect", value: "Meenakshi Associates, Madurai" },
  ],
});

/** A Coimbatore job with a Quotation, a Work Order and two custom fields. */
export const ANUGRAHA = project({
  id: "0199c4a0-0000-7000-8000-000000000006",
  name: "Anugraha Residency",
  address: "Plot 12, Survey No. 45, Saravanampatti, Coimbatore 641035",
  clientName: "Sri Balaji Developers",
  clientPhone: "+919843122110",
  quotationNo: "SBD/Q/2026/114",
  quotationDate: "2026-02-12",
  clientOrderNo: "WO/2026/031",
  clientOrderDate: "2026-03-02",
  // ₹1,84,50,000 excluding GST, in paise.
  orderValue: 1_84_50_000_00,
  customFields: [
    { label: "Site engineer", value: "Prabhu Saravanan" },
    { label: "Architect", value: "Meenakshi Associates, Madurai" },
  ],
});

export const STORY_PROJECTS: ProjectResponse[] = [
  project({
    id: "0199c4a0-0000-7000-8000-000000000002",
    name: "Asaripallam Tower",
    address: null,
    startDate: "2026-06-15",
    endDate: null,
  }),
  KUMARI,
  project({
    id: "0199c4a0-0000-7000-8000-000000000003",
    name: "Vadasery Plots",
    status: "not_started",
    address: null,
    startDate: null,
    endDate: null,
  }),
  project({
    id: "0199c4a0-0000-7000-8000-000000000004",
    name: "Parvathipuram Row Houses",
    status: "on_hold",
    address: "Parvathipuram, Nagercoil",
  }),
  project({
    id: "0199c4a0-0000-7000-8000-000000000005",
    name: "Zen Villas",
    status: "completed",
    startDate: "2024-04-01",
    endDate: "2026-03-31",
  }),
];

export function projectList(items: ProjectResponse[]): ProjectList {
  const count = (status: ProjectResponse["status"]) =>
    items.filter((item) => item.status === status).length;
  return {
    items,
    total: items.length,
    counts: {
      all: items.length,
      ongoing: count("ongoing"),
      not_started: count("not_started"),
      on_hold: count("on_hold"),
      completed: count("completed"),
    },
  };
}
