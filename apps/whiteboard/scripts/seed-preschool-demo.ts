// Demo data for the Preschool product: a franchise brand with three Centres
// and a standalone playschool, built through the real application handlers
// so every rule runs. Re-runnable: it deletes both demo Workspaces first.
//
//   cd apps/whiteboard && bun run seed:preschool
//
// Reads DATABASE_URL from the environment (Bun loads `.env`).

import { seedUserWithPassword, seedWorkspaceMember } from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";

import type { PreschoolActor } from "@/src/preschool/application/access";
import { ChildHandlers } from "@/src/preschool/application/child-handlers";
import { DailyReportHandlers } from "@/src/preschool/application/daily-report-handlers";
import { StaffHandlers } from "@/src/preschool/application/staff-handlers";
import {
  addDays,
  addMonths,
  instantInIndia,
  todayInIndia,
  type IsoDate,
} from "@/src/preschool/domain/dates";
import type { FeeFrequency } from "@/src/preschool/domain/fees";
import { createAttendanceHandlers } from "@/src/preschool/infrastructure/create-attendance-handlers";
import { createCentreHandlers } from "@/src/preschool/infrastructure/create-centre-handlers";
import { createClassroomHandlers } from "@/src/preschool/infrastructure/create-classroom-handlers";
import { createEnquiryHandlers } from "@/src/preschool/infrastructure/create-enquiry-handlers";
import { createFeeHandlers } from "@/src/preschool/infrastructure/create-fee-handlers";
import { createStockHandlers } from "@/src/preschool/infrastructure/create-stock-handlers";
import { createAdmissionInvoicer } from "@/src/preschool/infrastructure/fee-admission-invoicer";
import { PrismaAccessReader } from "@/src/preschool/infrastructure/prisma-access-reader";
import { PrismaChildStore } from "@/src/preschool/infrastructure/prisma-child-store";
import { PrismaDailyReportStore } from "@/src/preschool/infrastructure/prisma-daily-report-store";
import { createSetUpPreschool } from "@/src/preschool/infrastructure/prisma-setup-store";
import { PrismaStaffStore } from "@/src/preschool/infrastructure/prisma-staff-store";

const PASSWORD = "Preschool@123";
const LITTLE_STEPS = "org_demo_littlesteps";
const TINY_TOTS = "org_demo_tinytots";

const USERS = {
  meera: {
    id: "user_demo_meera",
    email: "meera@littlesteps.demo",
    name: "Meera Nair",
  },
  priya: {
    id: "user_demo_priya",
    email: "head.velachery@littlesteps.demo",
    name: "Priya Raman",
  },
  kavitha: {
    id: "user_demo_kavitha",
    email: "teacher.anna@littlesteps.demo",
    name: "Kavitha S",
  },
  sharma: {
    id: "user_demo_sharma",
    email: "parent.sharma@littlesteps.demo",
    name: "Rohit Sharma",
  },
  farah: {
    id: "user_demo_farah",
    email: "owner@tinytots.demo",
    name: "Farah Khan",
  },
} as const;

// ---------------------------------------------------------------- helpers

function say(text: string): void {
  process.stdout.write(`${text}\n`);
}

/** mulberry32: the same numbers on every run. */
function prng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) =>
      min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("pick from an empty list");
      return item;
    },
    chance: (p: number) => next() < p,
  };
}

const rnd = prng(20261125);

let phoneSequence = 0;
/** "98765xxxxx", a fresh one each call. */
function phone(): string {
  phoneSequence += 1;
  return `98765${String(10000 + phoneSequence).slice(-5)}`;
}

const rupees = (amount: number) => Math.round(amount * 100);

function clock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a < b ? a : b;
}

/** Monday–Saturday. */
function isWorkingDay(date: IsoDate): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() !== 0;
}

/** The `count` working days before `today`, oldest first. */
function workingDaysBefore(today: IsoDate, count: number): IsoDate[] {
  const days: IsoDate[] = [];
  let date = addDays(today, -1);
  while (days.length < count) {
    if (isWorkingDay(date)) days.unshift(date);
    date = addDays(date, -1);
  }
  return days;
}

async function owner(
  workspaceId: string,
  user: { id: string; name: string },
): Promise<PreschoolActor> {
  const result = await new PrismaAccessReader(prisma).resolve({
    workspaceId,
    userId: user.id,
    userName: user.name,
    memberRole: "owner",
    verifiedEmails: [],
  });
  if (result.kind !== "actor") throw new Error(`${workspaceId} is not set up`);
  return result.actor;
}

const BOYS = [
  "Aarav",
  "Vihaan",
  "Arjun",
  "Advik",
  "Kabir",
  "Reyansh",
  "Ishaan",
  "Dhruv",
  "Aditya",
  "Krish",
  "Vivaan",
  "Rudra",
  "Sai",
  "Harish",
  "Nikhil",
  "Pranav",
  "Yash",
  "Shaurya",
  "Atharv",
  "Karthik",
  "Surya",
  "Vishal",
  "Rohan",
  "Ayaan",
] as const;
const GIRLS = [
  "Diya",
  "Anika",
  "Aadhya",
  "Saanvi",
  "Ira",
  "Myra",
  "Kavya",
  "Meenakshi",
  "Ananya",
  "Tara",
  "Riya",
  "Nila",
  "Janani",
  "Pooja",
  "Shreya",
  "Avni",
  "Ishita",
  "Lakshmi",
  "Keerthana",
  "Aditi",
  "Harini",
  "Varsha",
  "Navya",
  "Zoya",
] as const;
const SURNAMES = [
  "Iyer",
  "Krishnan",
  "Subramanian",
  "Reddy",
  "Menon",
  "Pillai",
  "Rao",
  "Natarajan",
  "Ramesh",
  "Venkatesh",
  "Shankar",
  "Gupta",
  "Patel",
  "Nair",
  "Raghavan",
  "Balaji",
  "Sundaram",
  "Mohan",
  "Joseph",
  "Fernandes",
] as const;
const FATHERS = [
  "Suresh",
  "Ramesh",
  "Karthik",
  "Vijay",
  "Prakash",
  "Anand",
  "Senthil",
  "Ganesh",
  "Rajesh",
  "Arun",
  "Mahesh",
  "Dinesh",
  "Sanjay",
  "Ashok",
] as const;
const MOTHERS = [
  "Priya",
  "Divya",
  "Lakshmi",
  "Deepa",
  "Kavitha",
  "Sangeetha",
  "Anitha",
  "Revathi",
  "Meena",
  "Gayathri",
  "Shalini",
  "Nandhini",
  "Swathi",
  "Radha",
] as const;
const OCCUPATIONS = [
  "Software engineer",
  "Teacher",
  "Doctor",
  "Business",
  "Accountant",
  "Bank officer",
  "Architect",
  "Homemaker",
  "Pharmacist",
  "Lawyer",
] as const;

// ---------------------------------------------------------------- reset

/** Deletes both demo Workspaces: Preschool rows, then their identity rows. */
async function reset(): Promise<void> {
  const where = { where: { workspaceId: { in: [LITTLE_STEPS, TINY_TOTS] } } };
  await prisma.preschoolStockMovement.deleteMany(where);
  await prisma.preschoolStockItem.deleteMany(where);
  await prisma.preschoolProgressReportRating.deleteMany(where);
  await prisma.preschoolProgressReport.deleteMany(where);
  await prisma.preschoolObservation.deleteMany(where);
  await prisma.preschoolDevelopmentDomain.deleteMany(where);
  await prisma.preschoolAnnouncement.deleteMany(where);
  await prisma.preschoolFeePaymentAllocation.deleteMany(where);
  await prisma.preschoolFeePayment.deleteMany(where);
  await prisma.preschoolInvoice.deleteMany(where);
  await prisma.preschoolFeeStructureItem.deleteMany(where);
  await prisma.preschoolFeeStructure.deleteMany(where);
  await prisma.preschoolFeeHead.deleteMany(where);
  await prisma.preschoolDailyReport.deleteMany(where);
  await prisma.preschoolAttendance.deleteMany(where);
  await prisma.preschoolAdmission.deleteMany(where);
  await prisma.preschoolAuthorisedPickup.deleteMany(where);
  await prisma.preschoolEnquiryActivity.deleteMany(where);
  await prisma.preschoolEnquiry.deleteMany(where);
  await prisma.preschoolChild.deleteMany(where);
  await prisma.preschoolClassroomTeacher.deleteMany(where);
  await prisma.preschoolStaff.deleteMany(where);
  await prisma.preschoolClassroom.deleteMany(where);
  await prisma.preschoolProgramme.deleteMany(where);
  await prisma.preschoolAcademicYear.deleteMany(where);
  await prisma.preschoolCentre.deleteMany(where);
  await prisma.preschoolSettings.deleteMany(where);

  const workspaces = { organizationId: { in: [LITTLE_STEPS, TINY_TOTS] } };
  const userIds = Object.values(USERS).map((user) => user.id);
  await prisma.identityWorkspaceInvitation.deleteMany({ where: workspaces });
  await prisma.identityWorkspaceMember.deleteMany({ where: workspaces });
  await prisma.identitySession.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.identityAccount.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.identityUser.deleteMany({ where: { id: { in: userIds } } });
  await prisma.identityWorkspace.deleteMany({
    where: { id: { in: [LITTLE_STEPS, TINY_TOTS] } },
  });
}

async function seedIdentity(): Promise<void> {
  for (const user of Object.values(USERS))
    await seedUserWithPassword({ ...user, password: PASSWORD });
  const littleSteps = {
    workspaceId: LITTLE_STEPS,
    workspaceName: "Little Steps Preschool",
    institutionType: "preschool",
  };
  await seedWorkspaceMember({
    ...littleSteps,
    userId: USERS.meera.id,
    email: USERS.meera.email,
    role: "owner",
  });
  await seedWorkspaceMember({
    ...littleSteps,
    userId: USERS.priya.id,
    email: USERS.priya.email,
    role: "teacher",
  });
  await seedWorkspaceMember({
    ...littleSteps,
    userId: USERS.kavitha.id,
    email: USERS.kavitha.email,
    role: "teacher",
  });
  await seedWorkspaceMember({
    ...littleSteps,
    userId: USERS.sharma.id,
    email: USERS.sharma.email,
    role: "parent",
  });
  await seedWorkspaceMember({
    workspaceId: TINY_TOTS,
    workspaceName: "Tiny Tots Playschool",
    institutionType: "preschool",
    userId: USERS.farah.id,
    email: USERS.farah.email,
    role: "owner",
  });
}

// ---------------------------------------------------------------- handlers

type Handlers = ReturnType<typeof handlersFor>;

/** `now` is the clock the day's work happens at. */
function handlersFor(now: () => Date) {
  const childStore = new PrismaChildStore(prisma);
  return {
    centres: createCentreHandlers({ prisma }),
    classrooms: createClassroomHandlers({ prisma, now }),
    staff: new StaffHandlers({
      store: new PrismaStaffStore(prisma),
      inviter: { invite: () => Promise.resolve("sent" as const) },
      now,
    }),
    fees: createFeeHandlers({ prisma, now }),
    children: new ChildHandlers({
      store: childStore,
      reader: childStore,
      invoicer: createAdmissionInvoicer({ prisma }),
      inviter: { invite: () => Promise.resolve() },
      now,
    }),
    attendance: createAttendanceHandlers({ prisma, now }),
    dailyReports: new DailyReportHandlers({
      store: new PrismaDailyReportStore(prisma),
      notifier: { published: () => Promise.resolve() },
      now,
    }),
    enquiries: createEnquiryHandlers({ prisma, now }),
    stock: createStockHandlers({ prisma, now }),
  };
}

// ---------------------------------------------------------------- shapes

type CentrePlan = {
  id: string;
  name: string;
  /** Classroom name → capacity and how many Children to admit. */
  classrooms: {
    name: string;
    programme: string;
    capacity: number;
    children: number;
  }[];
};

type SeededChild = {
  id: string;
  centreId: string;
  classroomId: string;
  classroomName: string;
  programme: string;
  name: string;
  admittedOn: IsoDate;
  fatherName: string | null;
  motherName: string | null;
  hasPickup: boolean;
};

type Centre = {
  id: string;
  name: string;
  classrooms: Map<string, { id: string; programme: string }>;
};

/** Completed months on the first day of the Academic Year, by Programme. */
const AGE_RANGE: Record<string, [number, number]> = {
  Playgroup: [18, 35],
  "Nursery (Pre-KG)": [36, 47],
  LKG: [48, 59],
  UKG: [60, 71],
};

// ---------------------------------------------------------------- centres

async function setUpCentres(
  h: Handlers,
  actor: PreschoolActor,
  firstCentreId: string,
): Promise<{ annaNagar: string; velachery: string; coimbatore: string }> {
  await h.centres.updateDetails(actor, firstCentreId, {
    name: "Anna Nagar",
    code: "LSA",
    phone: "04426201234",
    email: "annanagar@littlesteps.demo",
    addressLine: "12, 4th Avenue, Shanthi Colony",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600040",
  });
  const velachery = await h.centres.create(actor, {
    name: "Velachery",
    code: "LSV",
    phone: "04422451122",
    email: "velachery@littlesteps.demo",
    addressLine: "7, Taramani Link Road",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600042",
    ownership: "franchised",
    franchiseeName: USERS.priya.name,
    franchiseePhone: phone(),
    franchiseeEmail: USERS.priya.email,
    agreementStartOn: "2025-06-01",
    agreementEndOn: "2030-05-31",
    royaltyPercent: 12,
    mayOverrideFees: true,
  });
  const coimbatore = await h.centres.create(actor, {
    name: "Coimbatore – RS Puram",
    code: "LSC",
    phone: "04222543210",
    email: "rspuram@littlesteps.demo",
    addressLine: "45, DB Road, RS Puram",
    city: "Coimbatore",
    state: "Tamil Nadu",
    pincode: "641002",
    ownership: "franchised",
    franchiseeName: "Senthil Kumar",
    franchiseePhone: phone(),
    franchiseeEmail: "senthil@littlesteps.demo",
    agreementStartOn: "2024-04-01",
    agreementEndOn: "2029-03-31",
    royaltyPercent: 10,
    mayOverrideFees: false,
  });
  return {
    annaNagar: firstCentreId,
    velachery: velachery.id,
    coimbatore: coimbatore.id,
  };
}

async function programmeIds(workspaceId: string): Promise<Map<string, string>> {
  const rows = await prisma.preschoolProgramme.findMany({
    where: { workspaceId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  return new Map(rows.map((row) => [row.name, row.id]));
}

async function setUpClassrooms(
  h: Handlers,
  actor: PreschoolActor,
  plan: CentrePlan,
  programmes: Map<string, string>,
): Promise<Centre> {
  const classrooms = new Map<string, { id: string; programme: string }>();
  for (const room of plan.classrooms) {
    const programmeId = programmes.get(room.programme);
    if (programmeId == null) throw new Error(`No ${room.programme}`);
    const created = await h.classrooms.create(actor, {
      centreId: plan.id,
      programmeId,
      name: room.name,
      capacity: room.capacity,
    });
    classrooms.set(room.name, { id: created.id, programme: room.programme });
  }
  return { id: plan.id, name: plan.name, classrooms };
}

async function setUpStaff(
  h: Handlers,
  actor: PreschoolActor,
  centre: Centre,
  people: {
    head: { name: string; email?: string };
    teachers: Record<string, { name: string; email?: string }>;
    helpers: string[];
  },
): Promise<void> {
  await h.staff.create(actor, {
    centreId: centre.id,
    name: people.head.name,
    role: "centre_head",
    phone: phone(),
    email: people.head.email ?? null,
    designation: "Centre Head",
    joinedOn: "2024-05-01",
  });
  for (const [classroom, teacher] of Object.entries(people.teachers)) {
    const room = centre.classrooms.get(classroom);
    await h.staff.create(actor, {
      centreId: centre.id,
      name: teacher.name,
      role: "teacher",
      phone: phone(),
      email: teacher.email ?? null,
      designation: "Class Teacher",
      joinedOn: "2025-06-01",
      classroomIds: room == null ? [] : [room.id],
    });
  }
  for (const helper of people.helpers)
    await h.staff.create(actor, {
      centreId: centre.id,
      name: helper,
      role: "helper",
      phone: phone(),
      designation: "Ayah",
    });
}

// ---------------------------------------------------------------- fees

type FeeLine = { head: string; rupees: number; frequency: FeeFrequency };

async function setFeeStructure(
  h: Handlers,
  actor: PreschoolActor,
  input: {
    academicYearId: string;
    programmeId: string;
    centreId: string | null;
    lines: FeeLine[];
  },
): Promise<void> {
  const heads = await h.fees.heads.list(actor, { includeArchived: false });
  await h.fees.structures.save(actor, {
    academicYearId: input.academicYearId,
    programmeId: input.programmeId,
    centreId: input.centreId,
    items: input.lines.map((line) => {
      const head = heads.items.find(
        (candidate) => candidate.name === line.head,
      );
      if (head == null) throw new Error(`No Fee Head ${line.head}`);
      return {
        feeHeadId: head.id,
        amountPaise: rupees(line.rupees),
        frequency: line.frequency,
      };
    }),
  });
}

const METHODS = ["cash", "upi", "upi", "upi", "card", "cash"] as const;

/**
 * Pays a Child's dues as a family would: each due date's Invoices on a day
 * soon after. `share` decides how much of what is due by today gets paid.
 */
async function payFees(
  h: Handlers,
  actor: PreschoolActor,
  child: SeededChild,
  input: {
    today: IsoDate;
    share: "full" | "part" | "first";
    /** Pay the two latest due dates this month (or today, with `onToday`). */
    thisMonth?: boolean;
    onToday?: boolean;
  },
): Promise<void> {
  const account = await h.fees.accounts.account(actor, child.id);
  const due = new Map<IsoDate, number>();
  for (const invoice of account.invoices)
    if (invoice.dueOn <= input.today && invoice.duePaise > 0)
      due.set(invoice.dueOn, (due.get(invoice.dueOn) ?? 0) + invoice.duePaise);
  const groups = [...due.entries()].sort(([a], [b]) => a.localeCompare(b));
  const monthStart = `${input.today.slice(0, 8)}01`;
  for (const [index, [dueOn, amount]] of groups.entries()) {
    const last = index === groups.length - 1;
    if (input.share === "first" && index > 0) break;
    let paid = amount;
    if (input.share === "part" && last)
      paid = Math.round((amount * rnd.int(35, 70)) / 100 / 10_000) * 10_000;
    if (paid <= 0) continue;
    let receivedOn = minDate(addDays(dueOn, rnd.int(0, 12)), input.today);
    // A family behind on the term pays it, and the quarter, this month.
    const recent = index >= groups.length - 2;
    if (recent && input.thisMonth === true && dueOn <= input.today)
      receivedOn =
        input.onToday === true
          ? input.today
          : minDate(addDays(monthStart, rnd.int(0, 20)), input.today);
    if (receivedOn < dueOn) receivedOn = dueOn;
    const method = rnd.chance(0.03)
      ? "cheque"
      : rnd.chance(0.03)
        ? "bank_transfer"
        : rnd.pick(METHODS);
    await h.fees.payments.record(actor, {
      childId: child.id,
      amountPaise: paid,
      method,
      receivedOn,
      reference:
        method === "upi"
          ? `UPI${String(rnd.int(100_000_000, 999_999_999))}`
          : method === "cheque"
            ? `Cheque ${String(rnd.int(100_000, 999_999))}`
            : method === "bank_transfer"
              ? `NEFT${String(rnd.int(10_000_000, 99_999_999))}`
              : method === "card"
                ? `Card ****${String(rnd.int(1000, 9999))}`
                : null,
    });
  }
}

// ---------------------------------------------------------------- children

type ChildSpec = {
  firstName: string;
  lastName: string;
  gender: "boy" | "girl";
  dateOfBirth: IsoDate;
  father: { name: string; phone: string; email?: string } | null;
  mother: { name: string; phone: string } | null;
  allergies?: string;
  pickups?: { name: string; relationship: string; phone: string }[];
};

function dateOfBirthFor(
  programme: string,
  yearStartsOn: IsoDate,
  outside = false,
): IsoDate {
  const [min, max] = AGE_RANGE[programme] ?? [24, 60];
  const months = outside ? max + rnd.int(1, 2) : rnd.int(min, max);
  return addDays(addMonths(yearStartsOn, -months), -rnd.int(0, 25));
}

function familyFor(gender: "boy" | "girl", lastName: string): ChildSpec {
  const fatherName = `${rnd.pick(FATHERS)} ${lastName}`;
  const motherName = `${rnd.pick(MOTHERS)} ${lastName}`;
  const pickups = rnd.chance(0.33)
    ? [
        rnd.chance(0.6)
          ? {
              name: `${rnd.pick(FATHERS)} ${lastName}`,
              relationship: "Grandfather",
              phone: phone(),
            }
          : {
              name: `${rnd.pick(MOTHERS)} ${lastName}`,
              relationship: "Grandmother",
              phone: phone(),
            },
        ...(rnd.chance(0.3)
          ? [{ name: "Murugan", relationship: "Driver", phone: phone() }]
          : []),
      ]
    : undefined;
  return {
    firstName: gender === "boy" ? rnd.pick(BOYS) : rnd.pick(GIRLS),
    lastName,
    gender,
    dateOfBirth: "2023-01-01",
    father: rnd.chance(0.95) ? { name: fatherName, phone: phone() } : null,
    mother: rnd.chance(0.9) ? { name: motherName, phone: phone() } : null,
    ...(rnd.chance(0.08)
      ? { allergies: rnd.pick(["Peanuts", "Dust", "Lactose"] as const) }
      : {}),
    ...(pickups == null ? {} : { pickups }),
  };
}

async function admit(
  h: Handlers,
  actor: PreschoolActor,
  centre: Centre,
  classroomName: string,
  spec: ChildSpec,
  admittedOn: IsoDate,
  enquiryId?: string,
): Promise<SeededChild> {
  const room = centre.classrooms.get(classroomName);
  if (room == null) throw new Error(`No ${classroomName}`);
  const programmes = await programmeIds(actor.workspaceId);
  const programmeId = programmes.get(room.programme) ?? "";
  const { child } = await h.children.admit(actor, {
    centreId: centre.id,
    child: {
      firstName: spec.firstName,
      lastName: spec.lastName,
      dateOfBirth: spec.dateOfBirth,
      gender: spec.gender,
      motherTongue: rnd.pick([
        "Tamil",
        "Tamil",
        "Telugu",
        "Malayalam",
        "Hindi",
      ]),
      address: {
        line: `${String(rnd.int(1, 120))}, ${rnd.pick(["2nd Street", "Gandhi Road", "Park View", "Lake Avenue"])}`,
        city: centre.name.includes("Coimbatore") ? "Coimbatore" : "Chennai",
        state: "Tamil Nadu",
      },
    },
    father:
      spec.father == null
        ? null
        : {
            name: spec.father.name,
            phone: spec.father.phone,
            email: spec.father.email ?? null,
            occupation: rnd.pick(OCCUPATIONS),
          },
    mother:
      spec.mother == null
        ? null
        : {
            name: spec.mother.name,
            phone: spec.mother.phone,
            occupation: rnd.pick(OCCUPATIONS),
          },
    emergencyContact: {
      name: spec.father?.name ?? spec.mother?.name ?? "Family",
      phone: spec.father?.phone ?? spec.mother?.phone ?? phone(),
      relationship: spec.father == null ? "Mother" : "Father",
    },
    authorisedPickups: spec.pickups ?? [],
    health: {
      allergies: spec.allergies ?? null,
      immunisationUpToDate: true,
      doctorName: "Dr. R. Srinivasan",
    },
    documents: {
      hasBirthCertificate: true,
      hasAadhaar: rnd.chance(0.8),
      hasImmunisationCard: true,
      hasPhotos: true,
      hasAddressProof: rnd.chance(0.7),
    },
    admission: {
      programmeId,
      classroomId: room.id,
      admittedOn,
      ...(enquiryId == null ? {} : { enquiryId }),
    },
  });
  return {
    id: child.id,
    centreId: centre.id,
    classroomId: room.id,
    classroomName,
    programme: room.programme,
    name: `${spec.firstName} ${spec.lastName}`,
    admittedOn,
    fatherName: spec.father?.name ?? null,
    motherName: spec.mother?.name ?? null,
    hasPickup: (spec.pickups?.length ?? 0) > 0,
  };
}

function admissionDate(yearStartsOn: IsoDate, today: IsoDate): IsoDate {
  const lastMonth = addMonths(`${today.slice(0, 8)}01`, -1);
  const from = yearStartsOn;
  const span = Math.max(
    0,
    Math.round(
      (new Date(`${lastMonth}T00:00:00Z`).getTime() -
        new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    ),
  );
  // Most join at the start of the year; the rest through the months since.
  const offset = rnd.chance(0.6) ? rnd.int(0, 10) : rnd.int(0, span + 20);
  return minDate(addDays(from, offset), addDays(today, -7));
}

// ---------------------------------------------------------------- attendance

const PRESENT = 0.92;

async function rosterOf(classroomId: string, date: IsoDate) {
  return prisma.preschoolAdmission.findMany({
    where: {
      classroomId,
      admittedOn: { lte: new Date(`${date}T00:00:00Z`) },
      status: "active",
    },
    // Admission numbers follow the order the script admits in, so every run
    // draws the same random numbers for the same Child.
    orderBy: { child: { admissionNumber: "asc" } },
    select: {
      childId: true,
      child: {
        select: {
          fatherName: true,
          motherName: true,
          authorisedPickups: {
            orderBy: { name: "asc" },
            select: { id: true, name: true },
            take: 1,
          },
        },
      },
    },
  });
}

async function markDay(
  h: Handlers,
  actor: PreschoolActor,
  classroomId: string,
  date: IsoDate,
  options: { checkOut: "all" | "some" | "none" },
): Promise<string[]> {
  const roster = await rosterOf(classroomId, date);
  const present: string[] = [];
  const away: { childId: string; status: "absent" | "leave" }[] = [];
  for (const row of roster) {
    const roll = rnd.next();
    if (roll < PRESENT) present.push(row.childId);
    else
      away.push({
        childId: row.childId,
        status: roll < 0.96 ? "leave" : "absent",
      });
  }
  if (away.length > 0)
    await h.attendance.mark(actor, { classroomId, date, marks: away });
  for (const childId of present)
    await h.attendance.checkIn(actor, {
      childId,
      date,
      time: clock(
        rnd.pick([8, 9, 9, 9]),
        rnd.int(0, 20) + (rnd.chance(0.2) ? 30 : 0),
      ),
      droppedBy: rnd.pick([
        "Father",
        "Mother",
        "Father",
        "Grandmother",
        "Driver",
      ]),
    });
  let otherDone = false;
  for (const row of roster) {
    if (!present.includes(row.childId)) continue;
    if (options.checkOut === "none") break;
    if (options.checkOut === "some" && !rnd.chance(0.25)) continue;
    const pickup = row.child.authorisedPickups[0];
    const time = clock(12, rnd.int(10, 40));
    if (options.checkOut === "some" && !otherDone) {
      otherDone = true;
      await h.attendance.checkOut(actor, {
        childId: row.childId,
        date,
        time,
        collectedByKind: "other",
        collectedByName: "Selvi (neighbour)",
        note: "Mother called the office at 11:45 to say the neighbour would collect.",
      });
    } else if (pickup != null && rnd.chance(0.5))
      await h.attendance.checkOut(actor, {
        childId: row.childId,
        date,
        time,
        collectedByKind: "authorised_pickup",
        pickupId: pickup.id,
      });
    else if (row.child.motherName != null && rnd.chance(0.5))
      await h.attendance.checkOut(actor, {
        childId: row.childId,
        date,
        time,
        collectedByKind: "mother",
      });
    else if (row.child.fatherName != null)
      await h.attendance.checkOut(actor, {
        childId: row.childId,
        date,
        time,
        collectedByKind: "father",
      });
  }
  return present;
}

// ---------------------------------------------------------------- daily reports

const MENUS = {
  breakfast: ["Idli & sambar", "Ragi porridge", "Pongal", "Dosa & chutney"],
  snack: ["Fruit bowl", "Sundal", "Banana", "Milk & biscuits"],
  lunch: [
    "Curd rice",
    "Sambar rice & beans poriyal",
    "Lemon rice",
    "Chapati & dal",
  ],
} as const;

const ACTIVITIES = [
  "Circle time: colours",
  "Clay modelling",
  "Rhymes: Chubby Cheeks",
  "Sand play",
  "Story time: The Thirsty Crow",
  "Number games 1–10",
  "Finger painting",
  "Music & movement",
] as const;

const NOTES = [
  "Shared his crayons with a friend today without being asked.",
  "Ate well and napped peacefully. Very cheerful in circle time.",
  "Was a little quiet in the morning but joined the rhymes after snack.",
  "Counted to ten all by herself today!",
  "Please send an extra set of clothes tomorrow.",
  "Enjoyed the story and answered every question about the crow.",
  "Needs a little help with the spoon; we are practising.",
] as const;

async function writeReports(
  h: Handlers,
  actor: PreschoolActor,
  classroomId: string,
  date: IsoDate,
  childIds: readonly string[],
  publish: "all" | "half" | "none",
): Promise<void> {
  const menu = {
    breakfast: rnd.pick(MENUS.breakfast),
    snack: rnd.pick(MENUS.snack),
    lunch: rnd.pick(MENUS.lunch),
  };
  const activities = [rnd.pick(ACTIVITIES), rnd.pick(ACTIVITIES)].filter(
    (activity, index, list) => list.indexOf(activity) === index,
  );
  for (const childId of childIds)
    await h.dailyReports.save(actor, {
      childId,
      date,
      meals: [
        {
          meal: "breakfast",
          menu: menu.breakfast,
          ate: rnd.pick(["all", "all", "some"] as const),
        },
        {
          meal: "snack",
          menu: menu.snack,
          ate: rnd.pick(["all", "some"] as const),
        },
        {
          meal: "lunch",
          menu: menu.lunch,
          ate: rnd.pick(["all", "all", "some", "none"] as const),
        },
      ],
      napFrom: "12:45",
      napTo: clock(13, rnd.int(30, 55)),
      toilet: [{ time: clock(10, rnd.int(0, 50)), kind: "toilet" }],
      mood: rnd.pick(["happy", "happy", "calm", "tired"] as const),
      activities,
      note: rnd.chance(0.6) ? rnd.pick(NOTES) : null,
    });
  if (publish === "none" || childIds.length === 0) return;
  await h.dailyReports.publish(actor, {
    classroomId,
    date,
    ...(publish === "half"
      ? { childIds: childIds.slice(0, Math.ceil(childIds.length / 2)) }
      : {}),
  });
}

// ---------------------------------------------------------------- enquiries

async function seedEnquiries(
  h: Handlers,
  actor: PreschoolActor,
  centre: Centre,
  input: { count: number; today: IsoDate; lost: number; dueToday: number },
): Promise<string[]> {
  const programmes = await programmeIds(actor.workspaceId);
  const names = [...programmes.keys()].filter((name) => name !== "Daycare");
  const ids: string[] = [];
  const plan = [
    "new",
    "new",
    "contacted",
    "contacted",
    "visit_scheduled",
    "visited",
    "contacted",
    "new",
    "visit_scheduled",
    "visited",
    "contacted",
    "new",
    "visited",
    "contacted",
  ] as const;
  for (let index = 0; index < input.count; index += 1) {
    const gender = rnd.chance(0.5) ? "boy" : "girl";
    const lastName = rnd.pick(SURNAMES);
    const programme = rnd.pick(names);
    const createdOn = addDays(input.today, -rnd.int(3, 55));
    const due = index < input.dueToday;
    const enquiry = await h.enquiries.create(actor, {
      centreId: centre.id,
      childName: `${gender === "boy" ? rnd.pick(BOYS) : rnd.pick(GIRLS)} ${lastName}`,
      childDateOfBirth: dateOfBirthFor(
        programme,
        `${input.today.slice(0, 4)}-04-01`,
      ),
      childGender: gender,
      parentName: `${rnd.pick(gender === "boy" ? FATHERS : MOTHERS)} ${lastName}`,
      parentPhone: phone(),
      programmeId: programmes.get(programme) ?? null,
      source: rnd.pick([
        "walk_in",
        "referral",
        "google",
        "social_media",
        "flyer",
      ] as const),
      notes: rnd.pick([
        "Looking for admission from June. Wants to see the classrooms.",
        "Asked about daycare till 6 pm.",
        "Referred by a parent from Nursery A.",
        "Moving to the area next month.",
      ]),
      nextFollowUpOn: due
        ? addDays(input.today, -rnd.int(0, 3))
        : addDays(input.today, rnd.int(2, 12)),
    });
    const status = plan[index % plan.length] ?? "new";
    if (status !== "new")
      await h.enquiries.logFollowUp(actor, enquiry.id, {
        kind: "call",
        note: "Called the parent; shared the fee structure on WhatsApp.",
        status: "contacted",
      });
    if (status === "visit_scheduled" || status === "visited")
      await h.enquiries.moveStatus(actor, enquiry.id, {
        status: "visit_scheduled",
        visitOn:
          status === "visited"
            ? addDays(input.today, -2)
            : addDays(input.today, 3),
        note: "Visit booked for 10:30 am.",
      });
    if (status === "visited")
      await h.enquiries.logFollowUp(actor, enquiry.id, {
        kind: "visit",
        note: "Came with grandmother; liked the play area. Will decide this week.",
        status: "visited",
        visitOn: addDays(input.today, -2),
      });
    if (index >= input.count - input.lost)
      await h.enquiries.markLost(actor, enquiry.id, {
        reason: rnd.pick([
          "Chose a school closer to home",
          "Fees above their budget",
          "Moving out of Chennai",
        ]),
      });
    await prisma.preschoolEnquiry.update({
      where: { id: enquiry.id },
      data: { createdAt: instantInIndia(createdOn, "11:00") },
    });
    ids.push(enquiry.id);
  }
  return ids;
}

/** An Enquiry taken to Visited, ready to admit from. */
async function enquiryToAdmit(
  h: Handlers,
  actor: PreschoolActor,
  centre: Centre,
  spec: ChildSpec,
  programme: string,
  today: IsoDate,
): Promise<string> {
  const programmes = await programmeIds(actor.workspaceId);
  const enquiry = await h.enquiries.create(actor, {
    centreId: centre.id,
    childName: `${spec.firstName} ${spec.lastName}`,
    childDateOfBirth: spec.dateOfBirth,
    childGender: spec.gender,
    parentName: spec.father?.name ?? spec.mother?.name ?? "Parent",
    parentPhone: spec.father?.phone ?? spec.mother?.phone ?? phone(),
    programmeId: programmes.get(programme) ?? null,
    source: "referral",
    notes: "Sibling of a child already with us.",
  });
  await h.enquiries.moveStatus(actor, enquiry.id, {
    status: "visit_scheduled",
    visitOn: addDays(today, -40),
  });
  await h.enquiries.logFollowUp(actor, enquiry.id, {
    kind: "visit",
    note: "Visited with both parents; paid the admission fee the same week.",
    status: "visited",
    visitOn: addDays(today, -40),
  });
  await prisma.preschoolEnquiry.update({
    where: { id: enquiry.id },
    data: { createdAt: instantInIndia(addDays(today, -50), "10:30") },
  });
  return enquiry.id;
}

// ---------------------------------------------------------------- stock

const STOCK_ITEMS = [
  {
    name: "Nursery kit",
    category: "kit",
    kind: "consumable",
    unit: "set",
    reorderLevel: 5,
  },
  {
    name: "LKG workbook set",
    category: "books",
    kind: "consumable",
    unit: "set",
    reorderLevel: 5,
  },
  {
    name: "UKG workbook set",
    category: "books",
    kind: "consumable",
    unit: "set",
    reorderLevel: 5,
  },
  {
    name: "Four-line notebooks",
    category: "notebooks",
    kind: "consumable",
    unit: "piece",
    reorderLevel: 40,
  },
  {
    name: "Crayon box 12",
    category: "stationery",
    kind: "consumable",
    unit: "box",
    reorderLevel: 10,
  },
  {
    name: "Uniform set – S",
    category: "uniform",
    kind: "consumable",
    unit: "set",
    reorderLevel: 8,
  },
  {
    name: "Uniform set – M",
    category: "uniform",
    kind: "consumable",
    unit: "set",
    reorderLevel: 8,
  },
  {
    name: "Story books",
    category: "books",
    kind: "consumable",
    unit: "piece",
    reorderLevel: 10,
  },
  {
    name: "Floor mats",
    category: "furniture_equipment",
    kind: "asset",
    unit: "piece",
    reorderLevel: null,
  },
  {
    name: "Child chairs",
    category: "furniture_equipment",
    kind: "asset",
    unit: "piece",
    reorderLevel: null,
  },
  {
    name: "Handwash 5 L",
    category: "housekeeping",
    kind: "consumable",
    unit: "can",
    reorderLevel: 4,
  },
] as const;

async function seedStock(
  h: Handlers,
  actor: PreschoolActor,
  input: {
    today: IsoDate;
    yearStartsOn: IsoDate;
    centres: Centre[];
    children: SeededChild[];
    annaNagar: Centre;
    velachery: Centre;
  },
): Promise<void> {
  const items = new Map<string, string>();
  for (const item of STOCK_ITEMS) {
    const created = await h.stock.items.create(actor, {
      ...item,
      reorderLevel: item.reorderLevel,
    });
    items.set(item.name, created.id);
  }
  const id = (name: string) => {
    const found = items.get(name);
    if (found == null) throw new Error(`No Stock Item ${name}`);
    return found;
  };
  const opening = addDays(input.yearStartsOn, -10);
  for (const centre of input.centres) {
    const big = centre.id === input.annaNagar.id;
    await h.stock.stock.receive(actor, {
      centreId: centre.id,
      movedOn: opening,
      supplierName: "Sri Saraswathi Book House",
      billNumber: `SSB-${String(rnd.int(1000, 9999))}`,
      lines: [
        {
          itemId: id("Nursery kit"),
          quantity: big ? 40 : 30,
          unitCostPaise: rupees(850),
        },
        {
          itemId: id("LKG workbook set"),
          quantity: big ? 25 : 18,
          unitCostPaise: rupees(620),
        },
        {
          itemId: id("UKG workbook set"),
          quantity: big ? 25 : 18,
          unitCostPaise: rupees(680),
        },
        {
          itemId: id("Four-line notebooks"),
          quantity: 300,
          unitCostPaise: rupees(28),
        },
        { itemId: id("Story books"), quantity: 60, unitCostPaise: rupees(120) },
      ],
    });
    await h.stock.stock.receive(actor, {
      centreId: centre.id,
      movedOn: addDays(opening, 3),
      supplierName: "Kids Wear Garments, Tiruppur",
      billNumber: `KWG/${String(rnd.int(100, 999))}`,
      lines: [
        {
          itemId: id("Uniform set – S"),
          quantity: big ? 45 : 30,
          unitCostPaise: rupees(450),
        },
        {
          itemId: id("Uniform set – M"),
          quantity: big ? 45 : 30,
          unitCostPaise: rupees(520),
        },
      ],
    });
    await h.stock.stock.receive(actor, {
      centreId: centre.id,
      movedOn: addDays(opening, 5),
      supplierName: "Chennai Stationery Mart",
      billNumber: `CSM-${String(rnd.int(10000, 99999))}`,
      lines: [
        // Anna Nagar is low on crayons and handwash today.
        {
          itemId: id("Crayon box 12"),
          quantity: big ? 14 : 30,
          unitCostPaise: rupees(95),
        },
        {
          itemId: id("Handwash 5 L"),
          quantity: big ? 6 : 10,
          unitCostPaise: rupees(410),
        },
        { itemId: id("Floor mats"), quantity: 12, unitCostPaise: rupees(650) },
        {
          itemId: id("Child chairs"),
          quantity: 40,
          unitCostPaise: rupees(890),
        },
      ],
    });
  }
  for (const child of input.children) {
    if (!rnd.chance(0.75) && !child.name.endsWith("Sharma")) continue;
    const lines =
      child.programme === "Playgroup" || child.programme === "Nursery (Pre-KG)"
        ? [
            { itemId: id("Nursery kit"), quantity: 1 },
            { itemId: id("Uniform set – S"), quantity: 2 },
          ]
        : [
            {
              itemId: id(
                child.programme === "LKG"
                  ? "LKG workbook set"
                  : "UKG workbook set",
              ),
              quantity: 1,
            },
            { itemId: id("Uniform set – M"), quantity: 2 },
          ];
    await h.stock.stock.issueToChild(actor, {
      centreId: child.centreId,
      childId: child.id,
      movedOn: minDate(addDays(child.admittedOn, rnd.int(0, 3)), input.today),
      lines,
    });
  }
  for (const centre of input.centres)
    for (const room of centre.classrooms.values())
      await h.stock.stock.issueToClassroom(actor, {
        centreId: centre.id,
        classroomId: room.id,
        movedOn: addDays(input.yearStartsOn, rnd.int(0, 14)),
        note: "For the art corner",
        lines: [
          {
            itemId: id("Crayon box 12"),
            quantity: centre.id === input.annaNagar.id ? 2 : 3,
          },
          { itemId: id("Story books"), quantity: 8 },
          { itemId: id("Four-line notebooks"), quantity: 20 },
          ...(centre.id === input.annaNagar.id && room.programme === "LKG"
            ? [{ itemId: id("Handwash 5 L"), quantity: 3 }]
            : []),
        ],
      });
  await h.stock.stock.transfer(actor, {
    fromCentreId: input.annaNagar.id,
    toCentreId: input.velachery.id,
    movedOn: addDays(input.today, -9),
    note: "Velachery ran short of Nursery kits for the October admissions.",
    lines: [{ itemId: id("Nursery kit"), quantity: 6 }],
  });
  await h.stock.stock.adjust(actor, {
    centreId: input.annaNagar.id,
    itemId: id("Story books"),
    quantity: -3,
    movedOn: addDays(input.today, -4),
    note: "Damaged: water leak in the reading corner",
  });
}

// ---------------------------------------------------------------- Little Steps

async function seedLittleSteps(today: IsoDate): Promise<void> {
  const setup = await createSetUpPreschool({ now: () => new Date() }).execute({
    workspaceId: LITTLE_STEPS,
    name: "Little Steps Preschool",
    academicYearStartMonth: 4,
  });
  const realNow = () => new Date();
  let h = handlersFor(realNow);
  let actor = await owner(LITTLE_STEPS, USERS.meera);
  const ids = await setUpCentres(h, actor, setup.centreId);
  actor = await owner(LITTLE_STEPS, USERS.meera);
  const year = await prisma.preschoolAcademicYear.findUniqueOrThrow({
    where: { id: setup.academicYearId },
  });
  const yearStartsOn = year.startsOn.toISOString().slice(0, 10);
  const programmes = await programmeIds(LITTLE_STEPS);

  const plans: CentrePlan[] = [
    {
      id: ids.annaNagar,
      name: "Anna Nagar",
      classrooms: [
        {
          name: "Playgroup A",
          programme: "Playgroup",
          capacity: 15,
          children: 10,
        },
        // Full: every seat taken.
        {
          name: "Nursery A",
          programme: "Nursery (Pre-KG)",
          capacity: 15,
          children: 15,
        },
        { name: "LKG A", programme: "LKG", capacity: 18, children: 12 },
        { name: "UKG A", programme: "UKG", capacity: 20, children: 8 },
      ],
    },
    {
      id: ids.velachery,
      name: "Velachery",
      classrooms: [
        {
          name: "Playgroup A",
          programme: "Playgroup",
          capacity: 15,
          children: 8,
        },
        {
          name: "Nursery A",
          programme: "Nursery (Pre-KG)",
          capacity: 16,
          children: 8,
        },
        { name: "LKG A", programme: "LKG", capacity: 18, children: 9 },
        // Nearly empty.
        { name: "UKG A", programme: "UKG", capacity: 20, children: 3 },
      ],
    },
    {
      id: ids.coimbatore,
      name: "Coimbatore – RS Puram",
      classrooms: [
        {
          name: "Playgroup A",
          programme: "Playgroup",
          capacity: 15,
          children: 6,
        },
        {
          name: "Nursery A",
          programme: "Nursery (Pre-KG)",
          capacity: 15,
          children: 6,
        },
        { name: "LKG A", programme: "LKG", capacity: 16, children: 5 },
        { name: "UKG A", programme: "UKG", capacity: 16, children: 5 },
      ],
    },
  ];
  const centres: Centre[] = [];
  for (const plan of plans)
    centres.push(await setUpClassrooms(h, actor, plan, programmes));
  const [annaNagar, velachery, coimbatore] = centres;
  if (annaNagar == null || velachery == null || coimbatore == null)
    throw new Error("Centres missing");

  await setUpStaff(h, actor, annaNagar, {
    head: { name: "Lakshmi Venkatesh" },
    teachers: {
      "Playgroup A": { name: "Revathi M" },
      "Nursery A": { name: USERS.kavitha.name, email: USERS.kavitha.email },
      "LKG A": { name: "Deepa Raghavan" },
      "UKG A": { name: "Anitha Joseph" },
    },
    helpers: ["Selvi", "Muthulakshmi"],
  });
  await setUpStaff(h, actor, velachery, {
    head: { name: USERS.priya.name, email: USERS.priya.email },
    teachers: {
      "Playgroup A": { name: "Gayathri P" },
      "Nursery A": { name: "Sangeetha K" },
      "LKG A": { name: "Nandhini R" },
      "UKG A": { name: "Swathi B" },
    },
    helpers: ["Kamala"],
  });
  await setUpStaff(h, actor, coimbatore, {
    head: { name: "Radha Senthil" },
    teachers: {
      "Playgroup A": { name: "Shalini V" },
      "Nursery A": { name: "Meena Ganesh" },
      "LKG A": { name: "Priyanka D" },
      "UKG A": { name: "Jaya Prakash" },
    },
    helpers: ["Rani", "Vasanthi"],
  });

  // Fee Structures: the Workspace default, and Velachery's own Tuition.
  const tuition: Record<string, number> = {
    Playgroup: 15_000,
    "Nursery (Pre-KG)": 18_000,
    LKG: 20_000,
    UKG: 22_000,
  };
  for (const [programme, amount] of Object.entries(tuition)) {
    const lines = (tuitionRupees: number): FeeLine[] => [
      { head: "Admission fee", rupees: 10_000, frequency: "one_time" },
      { head: "Tuition", rupees: tuitionRupees, frequency: "term" },
      { head: "Kit & books", rupees: 4_500, frequency: "one_time" },
      { head: "Uniform", rupees: 2_500, frequency: "one_time" },
      { head: "Activity fee", rupees: 1_500, frequency: "quarterly" },
    ];
    const programmeId = programmes.get(programme) ?? "";
    await setFeeStructure(h, actor, {
      academicYearId: setup.academicYearId,
      programmeId,
      centreId: null,
      lines: lines(amount),
    });
    await setFeeStructure(h, actor, {
      academicYearId: setup.academicYearId,
      programmeId,
      centreId: velachery.id,
      lines: lines(amount + 2_000),
    });
  }
  await setFeeStructure(h, actor, {
    academicYearId: setup.academicYearId,
    programmeId: programmes.get("Daycare") ?? "",
    centreId: null,
    lines: [
      { head: "Admission fee", rupees: 10_000, frequency: "one_time" },
      { head: "Daycare", rupees: 6_000, frequency: "monthly" },
    ],
  });

  // Children.
  const children: SeededChild[] = [];
  const sharma = {
    father: {
      name: USERS.sharma.name,
      phone: "9876500001",
      email: USERS.sharma.email,
    },
    mother: { name: "Neha Sharma", phone: "9876500002" },
  };
  children.push(
    await admit(
      h,
      actor,
      annaNagar,
      "Nursery A",
      {
        firstName: "Aarav",
        lastName: "Sharma",
        gender: "boy",
        dateOfBirth: dateOfBirthFor("Nursery (Pre-KG)", yearStartsOn),
        ...sharma,
        pickups: [
          { name: "Kamla Sharma", relationship: "Grandmother", phone: phone() },
        ],
      },
      yearStartsOn,
    ),
    await admit(
      h,
      actor,
      annaNagar,
      "Playgroup A",
      {
        firstName: "Anika",
        lastName: "Sharma",
        gender: "girl",
        dateOfBirth: dateOfBirthFor("Playgroup", yearStartsOn),
        ...sharma,
        allergies: "Peanuts",
      },
      addDays(yearStartsOn, 45),
    ),
  );
  // Another sibling pair, at Velachery, the younger one admitted from an Enquiry.
  const iyer = {
    father: { name: "Ganesh Iyer", phone: phone() },
    mother: { name: "Divya Iyer", phone: phone() },
  };
  const olderIyer = await admit(
    h,
    actor,
    velachery,
    "LKG A",
    {
      firstName: "Ishaan",
      lastName: "Iyer",
      gender: "boy",
      dateOfBirth: dateOfBirthFor("LKG", yearStartsOn),
      ...iyer,
    },
    yearStartsOn,
  );
  children.push(olderIyer);
  const youngerIyerSpec: ChildSpec = {
    firstName: "Tara",
    lastName: "Iyer",
    gender: "girl",
    dateOfBirth: dateOfBirthFor("Playgroup", yearStartsOn),
    ...iyer,
  };
  const youngerIyer = await admit(
    h,
    actor,
    velachery,
    "Playgroup A",
    youngerIyerSpec,
    addDays(today, -35),
    await enquiryToAdmit(
      h,
      actor,
      velachery,
      youngerIyerSpec,
      "Playgroup",
      today,
    ),
  );
  children.push(youngerIyer);
  // One more admitted from an Enquiry, at Anna Nagar.
  const fromEnquiry = { ...familyFor("girl", "Krishnan"), firstName: "Nila" };
  fromEnquiry.dateOfBirth = dateOfBirthFor("UKG", yearStartsOn);
  children.push(
    await admit(
      h,
      actor,
      annaNagar,
      "UKG A",
      fromEnquiry,
      addDays(today, -30),
      await enquiryToAdmit(h, actor, annaNagar, fromEnquiry, "UKG", today),
    ),
  );

  let outside = 2;
  for (const [index, centre] of centres.entries()) {
    const plan = plans[index];
    if (plan == null) continue;
    for (const room of plan.classrooms) {
      const already = children.filter(
        (child) =>
          child.centreId === centre.id && child.classroomName === room.name,
      ).length;
      for (let n = already; n < room.children; n += 1) {
        const gender = rnd.chance(0.5) ? "boy" : "girl";
        const spec = familyFor(gender, rnd.pick(SURNAMES));
        const isOutside = outside > 0 && room.programme === "LKG" && n === 1;
        if (isOutside) outside -= 1;
        spec.dateOfBirth = dateOfBirthFor(
          room.programme,
          yearStartsOn,
          isOutside,
        );
        children.push(
          await admit(
            h,
            actor,
            centre,
            room.name,
            spec,
            admissionDate(yearStartsOn, today),
          ),
        );
      }
    }
  }

  // Concessions before anything is paid.
  const youngerTuition = (
    await h.fees.accounts.account(actor, youngerIyer.id)
  ).invoices.find((invoice) => invoice.feeHeadName === "Tuition");
  if (youngerTuition != null)
    await h.fees.accounts.giveConcession(actor, youngerTuition.id, {
      concessionPaise: rupees(2_000),
      reason: "Sibling",
    });
  const staffWard = children.find(
    (child) =>
      child.centreId === annaNagar.id && child.classroomName === "LKG A",
  );
  if (staffWard != null) {
    const invoice = (
      await h.fees.accounts.account(actor, staffWard.id)
    ).invoices.find((row) => row.feeHeadName === "Tuition");
    if (invoice != null)
      await h.fees.accounts.giveConcession(actor, invoice.id, {
        concessionPaise: Math.round(invoice.amountPaise / 2),
        reason: "Staff ward",
      });
  }

  // Fee Payments: most paid up, some part, a few behind; some this month.
  // A couple of families pay today at each Centre.
  const paidToday = new Map<string, number>();
  for (const [index, child] of children.entries()) {
    const roll = rnd.next();
    const share = roll < 0.6 ? "full" : roll < 0.85 ? "part" : "first";
    const thisMonth = index % 3 === 0;
    const onToday =
      thisMonth &&
      share !== "first" &&
      (paidToday.get(child.centreId) ?? 0) < 2;
    if (onToday)
      paidToday.set(child.centreId, (paidToday.get(child.centreId) ?? 0) + 1);
    if (share === "first" && rnd.chance(0.3)) continue;
    await payFees(h, actor, child, { today, share, thisMonth, onToday });
  }

  // Two Children who left.
  for (const centre of [velachery, coimbatore]) {
    const leaver = children.find(
      (child) =>
        child.centreId === centre.id &&
        child.classroomName === "UKG A" &&
        !child.name.endsWith("Iyer"),
    );
    if (leaver != null)
      await h.children.withdraw(actor, leaver.id, {
        withdrawnOn: addDays(today, -20),
        reason: "Family moved to Bengaluru",
      });
  }

  // Attendance: twelve working days at Anna Nagar and Velachery, and today.
  const days = workingDaysBefore(today, 12);
  for (const centre of [annaNagar, velachery])
    for (const room of centre.classrooms.values())
      for (const day of days)
        await markDay(h, actor, room.id, day, { checkOut: "all" });
  // Today's work happens by early afternoon, whenever the script runs.
  const afternoon = instantInIndia(today, "13:00");
  const todayNow = () => new Date(Math.max(Date.now(), afternoon.getTime()));
  h = handlersFor(todayNow);
  const presentToday = new Map<string, string[]>();
  if (isWorkingDay(today))
    for (const [name, room] of annaNagar.classrooms)
      if (name !== "UKG A")
        presentToday.set(
          name,
          await markDay(h, actor, room.id, today, { checkOut: "some" }),
        );

  // Daily Reports: the last working day published; today partly.
  const yesterday = days.at(-1);
  for (const name of ["Nursery A", "Playgroup A"]) {
    const room = annaNagar.classrooms.get(name);
    if (room == null) continue;
    if (yesterday != null) {
      const present = await prisma.preschoolAttendance.findMany({
        where: {
          classroomId: room.id,
          date: new Date(`${yesterday}T00:00:00Z`),
          status: "present",
        },
        orderBy: { child: { admissionNumber: "asc" } },
        select: { childId: true },
      });
      await writeReports(
        h,
        actor,
        room.id,
        yesterday,
        present.map((row) => row.childId),
        "all",
      );
    }
    const today_ = presentToday.get(name) ?? [];
    await writeReports(h, actor, room.id, today, today_, "half");
  }

  // Enquiries.
  await seedEnquiries(h, actor, annaNagar, {
    count: 13,
    today,
    lost: 1,
    dueToday: 2,
  });
  await seedEnquiries(h, actor, velachery, {
    count: 11,
    today,
    lost: 1,
    dueToday: 1,
  });
  await seedEnquiries(h, actor, coimbatore, {
    count: 10,
    today,
    lost: 0,
    dueToday: 0,
  });

  await seedStock(h, actor, {
    today,
    yearStartsOn,
    centres,
    children: children.filter(
      (child) =>
        !(child.classroomName === "UKG A" && child.centreId !== annaNagar.id),
    ),
    annaNagar,
    velachery,
  });
}

// ---------------------------------------------------------------- Tiny Tots

async function seedTinyTots(today: IsoDate): Promise<void> {
  const setup = await createSetUpPreschool({ now: () => new Date() }).execute({
    workspaceId: TINY_TOTS,
    name: "Tiny Tots Playschool",
    academicYearStartMonth: 6,
  });
  let h = handlersFor(() => new Date());
  const actor = await owner(TINY_TOTS, USERS.farah);
  await h.centres.updateDetails(actor, setup.centreId, {
    name: "Tiny Tots Playschool",
    code: "TT",
    phone: "04424351234",
    email: "hello@tinytots.demo",
    addressLine: "3, Ranganathan Street, T. Nagar",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600017",
  });
  const year = await prisma.preschoolAcademicYear.findUniqueOrThrow({
    where: { id: setup.academicYearId },
  });
  const yearStartsOn = year.startsOn.toISOString().slice(0, 10);
  const programmes = await programmeIds(TINY_TOTS);
  const centre = await setUpClassrooms(
    h,
    actor,
    {
      id: setup.centreId,
      name: "Tiny Tots Playschool",
      classrooms: [
        {
          name: "Playgroup",
          programme: "Playgroup",
          capacity: 12,
          children: 9,
        },
        {
          name: "Nursery",
          programme: "Nursery (Pre-KG)",
          capacity: 12,
          children: 9,
        },
      ],
    },
    programmes,
  );
  await setUpStaff(h, actor, centre, {
    head: { name: USERS.farah.name },
    teachers: { Playgroup: { name: "Sana Begum" } },
    helpers: ["Parvathi"],
  });
  for (const programme of ["Playgroup", "Nursery (Pre-KG)"])
    await setFeeStructure(h, actor, {
      academicYearId: setup.academicYearId,
      programmeId: programmes.get(programme) ?? "",
      centreId: null,
      lines: [
        { head: "Admission fee", rupees: 5_000, frequency: "one_time" },
        { head: "Tuition", rupees: 3_500, frequency: "monthly" },
      ],
    });
  const children: SeededChild[] = [];
  for (const room of ["Playgroup", "Nursery"])
    for (let n = 0; n < 9; n += 1) {
      const spec = familyFor(
        rnd.chance(0.5) ? "boy" : "girl",
        rnd.pick(SURNAMES),
      );
      spec.dateOfBirth = dateOfBirthFor(
        room === "Playgroup" ? "Playgroup" : "Nursery (Pre-KG)",
        yearStartsOn,
      );
      children.push(
        await admit(
          h,
          actor,
          centre,
          room,
          spec,
          admissionDate(yearStartsOn, today),
        ),
      );
    }
  for (const [index, child] of children.entries())
    await payFees(h, actor, child, {
      today,
      share: index % 6 === 5 ? "first" : index % 4 === 3 ? "part" : "full",
      thisMonth: index % 2 === 0,
      onToday: index === 0,
    });
  for (const room of centre.classrooms.values())
    for (const day of workingDaysBefore(today, 6))
      await markDay(h, actor, room.id, day, { checkOut: "all" });
  h = handlersFor(() => new Date());
  await seedEnquiries(h, actor, centre, {
    count: 5,
    today,
    lost: 1,
    dueToday: 1,
  });
}

// ---------------------------------------------------------------- main

async function counts(today: IsoDate): Promise<void> {
  const monthStart = new Date(`${today.slice(0, 8)}01T00:00:00Z`);
  const centres = await prisma.preschoolCentre.findMany({
    where: { workspaceId: { in: [LITTLE_STEPS, TINY_TOTS] } },
    orderBy: [{ workspaceId: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  for (const centre of centres) {
    const [children, collected, present] = await Promise.all([
      prisma.preschoolChild.count({
        where: { centreId: centre.id, status: "active", deletedAt: null },
      }),
      prisma.preschoolFeePayment.aggregate({
        where: { centreId: centre.id, receivedOn: { gte: monthStart } },
        _sum: { amountPaise: true },
      }),
      prisma.preschoolAttendance.count({
        where: {
          centreId: centre.id,
          date: new Date(`${today}T00:00:00Z`),
          status: "present",
        },
      }),
    ]);
    say(
      `  ${centre.name}: ${String(children)} active Children, ₹${String((collected._sum.amountPaise ?? 0) / 100)} collected this month, ${String(present)} present today`,
    );
  }
}

async function main(): Promise<void> {
  const today = todayInIndia(new Date());
  say(`Seeding Preschool demo data for ${today}…`);
  await reset();
  await seedIdentity();
  await seedLittleSteps(today);
  await seedTinyTots(today);
  await counts(today);
  say(`
Sign in with password ${PASSWORD}:
  Little Steps Preschool (franchise, 3 Centres)
    Owner        ${USERS.meera.email}
    Centre Head  ${USERS.priya.email}   (Velachery)
    Teacher      ${USERS.kavitha.email}     (Nursery A, Anna Nagar)
    Parent       ${USERS.sharma.email}    (Aarav and Anika Sharma)
  Tiny Tots Playschool (one Centre)
    Owner        ${USERS.farah.email}`);
}

await main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
