import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { FamilyAttendanceScreen } from "@/app/(app)/preschool/family/attendance/_components/family-attendance-screen";
import { FamilyChildScreen } from "@/app/(app)/preschool/family/child/_components/family-child-screen";
import { FamilyReportsScreen } from "@/app/(app)/preschool/family/daily-reports/_components/family-reports-screen";
import { FamilyFeesScreen } from "@/app/(app)/preschool/family/fees/_components/family-fees-screen";
import { FamilyReceiptScreen } from "@/app/(app)/preschool/family/receipts/[id]/_components/family-receipt-screen";
import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  expectFitsPhone,
  withPhoneFrame,
} from "@/app/(app)/preschool/_components/phone-frame";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiHandler,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type { DailyReportView } from "@/src/preschool/application/daily-report-views";
import type { PreschoolChildAttendanceMonth } from "@/src/queries/preschool/attendance";
import type { PreschoolChildProfile } from "@/src/queries/preschool/children";
import type {
  PreschoolFamilyChild,
  PreschoolFamilyHome,
} from "@/src/queries/preschool/family";
import type {
  PreschoolChildFeeAccount,
  PreschoolReceipt,
} from "@/src/queries/preschool/fees";

import { FamilyHomeScreen } from "./family-home-screen";

const id = (n: number) =>
  `fa0e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, "0")}`;
const AARAV = id(1);
const DIYA = id(2);

const me = (childIds: string[] = [AARAV, DIYA]) =>
  preschoolMe({
    role: "parent",
    userName: "Meena Kumar",
    hasSeveralCentres: false,
    centres: preschoolMe().centres.slice(0, 1),
    children: [
      {
        id: AARAV,
        centreId: CENTRE_IDS.annaNagar,
        firstName: "Aarav",
        lastName: "Kumar",
        photoUrl: null,
      },
      {
        id: DIYA,
        centreId: CENTRE_IDS.annaNagar,
        firstName: "Diya",
        lastName: "Kumar",
        photoUrl: null,
      },
    ].filter((child) => childIds.includes(child.id)),
  });

const REPORT = {
  meals: [
    { meal: "breakfast" as const, menu: "Idli, sambar", ate: "all" as const },
    { meal: "lunch" as const, menu: "Curd rice", ate: "some" as const },
  ],
  napFrom: "13:00",
  napTo: "14:30",
  toilet: [{ time: "10:30", kind: "potty" as const }],
  mood: "happy" as const,
  activities: ["Story time", "Art & craft"],
  note: "Aarav painted a lovely sun today.",
  photos: [],
};

function entry(
  childId: string,
  firstName: string,
  overrides: Partial<PreschoolFamilyChild> = {},
): PreschoolFamilyChild {
  return {
    child: {
      id: childId,
      name: `${firstName} Kumar`,
      firstName,
      photoUrl: null,
      ageText: "3 y 8 m",
      admissionNumber: "LSAN-0007",
      classroomName: "Nursery A",
      programmeName: "Nursery (Pre-KG)",
      centre: {
        id: CENTRE_IDS.annaNagar,
        name: "Little Steps Anna Nagar",
        phone: "04426201234",
      },
    },
    classTeachers: ["Meena R"],
    today: {
      status: "present",
      checkInTime: "09:05",
      checkOutTime: null,
      collectedBy: null,
    },
    latestDailyReport: {
      ...REPORT,
      date: "2026-11-25",
      publishedAt: "2026-11-25T10:10:00.000Z",
    },
    fees: {
      duePaise: 18_000_00,
      overduePaise: 0,
      nextDue: {
        dueOn: "2026-12-01",
        label: "December tuition",
        duePaise: 18_000_00,
      },
    },
    ...overrides,
  };
}

const AT_SCHOOL = entry(AARAV, "Aarav");
const DIYA_ABSENT = entry(DIYA, "Diya", {
  child: {
    ...AT_SCHOOL.child,
    id: DIYA,
    name: "Diya Kumar",
    firstName: "Diya",
    classroomName: "Playgroup A",
  },
  classTeachers: ["Kavya S", "Lakshmi P"],
  today: {
    status: "absent",
    checkInTime: null,
    checkOutTime: null,
    collectedBy: null,
  },
  latestDailyReport: null,
  fees: { duePaise: 50_500_00, overduePaise: 50_500_00, nextDue: null },
});

function home(children: PreschoolFamilyChild[]): PreschoolFamilyHome {
  return { date: "2026-11-25", children };
}

function api(routes: Record<string, PreschoolApiHandler>, childIds?: string[]) {
  return mockPreschoolApi({ me: me(childIds), routes });
}

const meta = {
  title: "Preschool/Family",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/family" } },
  },
  // Decorators run inside out: the 375 px frame wraps the provider too.
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
    withPhoneFrame,
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const AtSchool: Story = {
  beforeEach: () =>
    api({ "GET /family/home": () => ({ json: home([AT_SCHOOL]) }) }, [AARAV]),
  render: () => <FamilyHomeScreen />,
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Aarav's day" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Aarav is at school — checked in 9:05 am"),
    ).toBeVisible();
    await expect(canvas.getByText(/Class Teacher: Meena R/)).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Call Little Steps Anna Nagar/ }),
    ).toHaveAttribute("href", "tel:04426201234");
    await expect(
      canvas.getByRole("heading", { name: "Today's Daily Report" }),
    ).toBeVisible();
    await expect(canvas.getByText("Curd rice — ate some")).toBeVisible();
    await expect(canvas.getByText("1:00 pm – 2:30 pm")).toBeVisible();
    await expect(
      canvas.getByText("Aarav painted a lovely sun today."),
    ).toBeVisible();
    await expect(canvas.getByText("₹18,000 due by 1 Dec")).toBeVisible();
    await expect(
      canvas.queryByRole("radiogroup", { name: "Child" }),
    ).not.toBeInTheDocument();
    await expectFitsPhone(canvasElement);
  },
};

export const Collected: Story = {
  beforeEach: () =>
    api(
      {
        "GET /family/home": () => ({
          json: home([
            entry(AARAV, "Aarav", {
              today: {
                status: "present",
                checkInTime: "09:05",
                checkOutTime: "12:35",
                collectedBy: { name: "Lakshmi", relationship: "Grandmother" },
              },
              latestDailyReport: {
                ...REPORT,
                date: "2026-11-24",
                publishedAt: null,
              },
            }),
          ]),
        }),
      },
      [AARAV],
    ),
  render: () => <FamilyHomeScreen />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Collected at 12:35 pm by Lakshmi (Grandmother)"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: /Daily Report · .*24 Nov/ }),
    ).toBeVisible();
  },
};

/** Two Children: the switcher moves between them and keeps the choice in the URL. */
export const TwoChildren: Story = {
  beforeEach: () =>
    api({
      "GET /family/home": () => ({ json: home([AT_SCHOOL, DIYA_ABSENT]) }),
    }),
  render: () => <FamilyHomeScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const switcher = within(
      await canvas.findByRole("radiogroup", { name: "Child" }),
    );
    await expect(
      switcher.getByRole("radio", { name: /Aarav/ }),
    ).toHaveAttribute("aria-checked", "true");
    await userEvent.click(switcher.getByRole("radio", { name: /Diya/ }));
    await expect(
      await canvas.findByRole("heading", { name: "Diya's day" }),
    ).toBeVisible();
    await expect(canvas.getByText("Absent today")).toBeVisible();
    await expect(
      canvas.getByText(/Class Teachers: Kavya S, Lakshmi P/),
    ).toBeVisible();
    await expect(
      canvas.getByText("₹50,500 overdue — please pay at the Centre"),
    ).toBeVisible();
    await expect(canvas.getByText(/No Daily Report yet/)).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "View details" }),
    ).toHaveAttribute("href", `/preschool/family/fees?child=${DIYA}`);
    await expectFitsPhone(canvasElement);
  },
};

export const NotMarkedYet: Story = {
  beforeEach: () =>
    api(
      {
        "GET /family/home": () => ({
          json: home([
            entry(AARAV, "Aarav", {
              today: {
                status: null,
                checkInTime: null,
                checkOutTime: null,
                collectedBy: null,
              },
              fees: { duePaise: 0, overduePaise: 0, nextDue: null },
            }),
          ]),
        }),
      },
      [AARAV],
    ),
  render: () => <FamilyHomeScreen />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Not marked yet")).toBeVisible();
    await expect(
      canvas.getByText("Nothing due right now. Thank you!"),
    ).toBeVisible();
  },
};

function report(n: number, date: string): DailyReportView {
  return {
    ...REPORT,
    id: id(20 + n),
    childId: AARAV,
    classroomId: id(9),
    date,
    status: "published",
    publishedAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    note: `Note for ${date}`,
  };
}

export const DailyReports: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/family/daily-reports" } },
  },
  beforeEach: () =>
    api(
      {
        "GET /daily-reports/children/fa0e8400-e29b-41d4-a716-446655440001": (
          _body,
          url,
        ) => ({
          json:
            url.searchParams.get("before") == null
              ? {
                  childId: AARAV,
                  name: "Aarav Kumar",
                  items: [report(1, "2026-11-25"), report(2, "2026-11-24")],
                  nextBefore: "2026-11-24",
                }
              : {
                  childId: AARAV,
                  name: "Aarav Kumar",
                  items: [report(3, "2026-11-21")],
                  nextBefore: null,
                },
        }),
      },
      [AARAV],
    ),
  render: () => <FamilyReportsScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("list", { name: "Daily Reports" }),
    ).toBeVisible();
    await expect(canvas.getByText("Note for 2026-11-25")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Load earlier" }));
    await expect(await canvas.findByText("Note for 2026-11-21")).toBeVisible();
    await waitFor(() =>
      expect(
        canvas.queryByRole("button", { name: "Load earlier" }),
      ).not.toBeInTheDocument(),
    );
    await expectFitsPhone(canvasElement);
  },
};

const MONTH: PreschoolChildAttendanceMonth = {
  childId: AARAV,
  name: "Aarav Kumar",
  month: "2026-11",
  days: Array.from({ length: 30 }, (_, index) => {
    const date = `2026-11-${String(index + 1).padStart(2, "0")}`;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const status =
      weekday === 0 || weekday === 6 || index > 24
        ? null
        : index === 9
          ? ("absent" as const)
          : index === 16
            ? ("leave" as const)
            : ("present" as const);
    return {
      date,
      status,
      checkInTime: status === "present" ? "09:05" : null,
      checkOutTime: status === "present" ? "12:35" : null,
      collectedByName: status === "present" ? "Lakshmi" : null,
      collectedByKind:
        status === "present" ? ("authorised_pickup" as const) : null,
    };
  }),
  totals: { present: 16, absent: 1, leave: 1 },
};

export const AttendanceCalendar: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/family/attendance" } },
  },
  beforeEach: () =>
    api(
      {
        "GET /attendance/children/fa0e8400-e29b-41d4-a716-446655440001":
          () => ({ json: MONTH }),
      },
      [AARAV],
    ),
  render: () => <FamilyAttendanceScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const grid = within(
      await canvas.findByRole("grid", { name: /Aarav's attendance/ }),
    );
    await expect(grid.getAllByRole("columnheader")).toHaveLength(7);
    const totals = within(canvas.getByLabelText("Month totals"));
    await expect(totals.getByText("16")).toBeVisible();
    await userEvent.click(
      grid.getByRole("button", { name: "Mon, 2 Nov: Present" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Checked in 9:05 am",
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Collected 12:35 pm by Lakshmi (Authorised Pickup)",
    );
    await expect(
      grid.getByRole("button", { name: "Tue, 10 Nov: Absent" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("list", { name: "Legend" }),
    ).toHaveTextContent("Leave");
    await expectFitsPhone(canvasElement);
  },
};

const ACCOUNT: PreschoolChildFeeAccount = {
  child: {
    id: AARAV,
    centreId: CENTRE_IDS.annaNagar,
    firstName: "Aarav",
    lastName: "Kumar",
    admissionNumber: "LSAN-0007",
    status: "active",
    classroom: { id: id(9), name: "Nursery A" },
    programme: { id: id(8), name: "Nursery (Pre-KG)" },
    academicYear: { id: id(7), name: "2026–27" },
    fatherName: "Ravi Kumar",
    fatherPhone: "9840012345",
    motherName: "Meena Kumar",
    motherPhone: "9840012346",
  },
  invoices: [
    {
      id: id(30),
      admissionId: id(6),
      feeHeadId: id(5),
      feeHeadName: "Tuition",
      label: "Term 2 tuition",
      dueOn: "2026-11-10",
      amountPaise: 25_000_00,
      concessionPaise: 2_500_00,
      concessionReason: "Sibling",
      paidPaise: 0,
      duePaise: 22_500_00,
      status: "overdue",
    },
    {
      id: id(31),
      admissionId: id(6),
      feeHeadId: id(5),
      feeHeadName: "Uniform",
      label: "Uniform",
      dueOn: "2026-06-01",
      amountPaise: 3_000_00,
      concessionPaise: 0,
      concessionReason: null,
      paidPaise: 3_000_00,
      duePaise: 0,
      status: "paid",
    },
  ],
  payments: [
    {
      id: id(40),
      receiptNumber: "LSAN/2026-27/00042",
      receivedOn: "2026-06-03",
      amountPaise: 3_000_00,
      method: "upi",
      reference: null,
    },
  ],
  totals: {
    billedPaise: 28_000_00,
    concessionPaise: 2_500_00,
    paidPaise: 3_000_00,
    duePaise: 22_500_00,
    overduePaise: 22_500_00,
  },
};

export const Fees: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/family/fees" } },
  },
  beforeEach: () =>
    api(
      {
        "GET /fees/children/fa0e8400-e29b-41d4-a716-446655440001": () => ({
          json: ACCOUNT,
        }),
      },
      [AARAV],
    ),
  render: () => <FamilyFeesScreen />,
  play: async ({ canvas, canvasElement }) => {
    const totals = within(await canvas.findByLabelText("Totals"));
    await expect(totals.getAllByText("₹22,500")).toHaveLength(2);
    await expect(
      canvas.getByText(
        "Fees are paid at the Centre. Ask for a Receipt for every payment.",
      ),
    ).toBeVisible();
    await expect(canvas.getByText("Term 2 tuition")).toBeVisible();
    await expect(canvas.getByText("− ₹2,500")).toBeVisible();
    await expect(
      canvas.getByText("Overdue", { selector: "[data-slot=badge]" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Receipt LSAN\/2026-27\/00042/ }),
    ).toHaveAttribute("href", `/preschool/family/receipts/${id(40)}`);
    await expect(
      canvas.queryByRole("button", { name: /Collect|Record/ }),
    ).not.toBeInTheDocument();
    await expectFitsPhone(canvasElement);
  },
};

const RECEIPT: PreschoolReceipt = {
  id: id(40),
  receiptNumber: "LSAN/2026-27/00042",
  receivedOn: "2026-06-03",
  centre: {
    id: CENTRE_IDS.annaNagar,
    name: "Little Steps Anna Nagar",
    addressLine: null,
    city: "Chennai",
    state: null,
    pincode: null,
    phone: null,
  },
  child: {
    id: AARAV,
    firstName: "Aarav",
    lastName: "Kumar",
    admissionNumber: "LSAN-0007",
    classroomName: "Nursery A",
    fatherName: "Ravi Kumar",
    motherName: "Meena Kumar",
  },
  lines: [{ invoiceId: id(31), label: "Uniform", amountPaise: 3_000_00 }],
  amountPaise: 3_000_00,
  amountInWords: "Rupees Three Thousand Only",
  method: "upi",
  reference: null,
  note: null,
  receivedByName: "Arun",
  balanceDuePaise: 25_000_00,
};

export const Receipt: Story = {
  parameters: {
    nextjs: {
      navigation: { pathname: `/preschool/family/receipts/${id(40)}` },
    },
  },
  beforeEach: () =>
    api({ [`GET /fees/payments/${id(40)}`]: () => ({ json: RECEIPT }) }, [
      AARAV,
    ]),
  render: () => <FamilyReceiptScreen paymentId={id(40)} childQuery="" />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: /Back to Fees/ }),
    ).toHaveAttribute("href", "/preschool/family/fees");
    await expect(
      canvas.queryByRole("link", { name: /WhatsApp/ }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Rupees Three Thousand Only")).toBeVisible();
  },
};

const PROFILE = {
  id: AARAV,
  centreId: CENTRE_IDS.annaNagar,
  admissionNumber: "LSAN-0007",
  firstName: "Aarav",
  lastName: "Kumar",
  name: "Aarav Kumar",
  dateOfBirth: "2023-03-10",
  ageText: "3 y 8 m",
  gender: "boy",
  bloodGroup: "B+",
  photoUrl: null,
  motherTongue: "Tamil",
  address: {
    line: "12 Lake View Road",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600042",
  },
  father: {
    name: "Ravi Kumar",
    phone: "9840012345",
    email: "ravi@example.in",
    occupation: null,
  },
  mother: {
    name: "Meena Kumar",
    phone: "9840012346",
    email: "meena@example.in",
    occupation: null,
  },
  emergencyContact: {
    name: "Suresh",
    phone: "9840012347",
    relationship: "Uncle",
  },
  health: {
    allergies: "Peanuts",
    medicalConditions: null,
    doctorName: "Dr. Rao",
    doctorPhone: null,
    immunisationUpToDate: true,
  },
  documents: {
    hasBirthCertificate: true,
    hasAadhaar: true,
    hasImmunisationCard: true,
    hasPhotos: true,
    hasAddressProof: true,
  },
  status: "active",
  withdrawnOn: null,
  withdrawReason: null,
  currentAdmission: {
    id: id(6),
    academicYearId: id(7),
    academicYearName: "2026–27",
    programmeId: id(8),
    programmeName: "Nursery (Pre-KG)",
    classroomId: id(9),
    classroomName: "Nursery A",
    admittedOn: "2026-06-01",
    status: "active",
    endedOn: null,
    endReason: null,
  },
  admissions: [],
  authorisedPickups: [
    {
      id: id(50),
      name: "Lakshmi",
      relationship: "Grandmother",
      phone: "9840011111",
      photoUrl: null,
    },
  ],
  siblings: [],
  enquiryId: null,
  createdAt: "2026-06-01T05:00:00.000Z",
  updatedAt: "2026-06-01T05:00:00.000Z",
} satisfies PreschoolChildProfile;

export const ChildDetails: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/family/child" } },
  },
  beforeEach: () =>
    api({ [`GET /children/${AARAV}`]: () => ({ json: PROFILE }) }, [AARAV]),
  render: () => <FamilyChildScreen />,
  play: async ({ canvas, canvasElement }) => {
    const pickups = within(
      await canvas.findByRole("list", { name: "Authorised Pickups" }),
    );
    await expect(pickups.getByText("Lakshmi")).toBeVisible();
    await expect(pickups.getByText("Grandmother · 9840011111")).toBeVisible();
    await expect(canvas.getByText("Peanuts")).toBeVisible();
    await expect(
      canvas.getByText("To change anything, tell the Centre."),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /Edit|Save/ }),
    ).not.toBeInTheDocument();
    await expectFitsPhone(canvasElement);
  },
};

/** A Parent whose email is on no Child's record. */
export const NoChildLinked: Story = {
  beforeEach: () =>
    mockPreschoolApi({
      me: null,
      memberRole: "parent",
      routes: {
        "GET /me": () => ({
          status: 403,
          json: {
            code: "FORBIDDEN",
            message: "You do not have access to this.",
          },
        }),
      },
    }),
  render: () => <FamilyHomeScreen />,
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByText("We couldn't find your Child"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "We couldn't find a Child linked to arun@example.com. Ask the Centre to check the email on your Child's record.",
      ),
    ).toBeVisible();
    await expectFitsPhone(canvasElement);
  },
};
