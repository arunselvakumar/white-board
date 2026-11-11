import type {
  SiteEngineer,
  SiteEngineerSignIn,
} from "@/src/queries/site-engineers";

/** Story-only Site Engineers, one per way of signing in. */

export const SITE_ENGINEERS_URL = "/api/construction/masters/site-engineers";
export const PROJECT_OPTIONS_URL =
  "/api/construction/projects/projects/options";

export const SRI_HEIGHTS = "0199a000-0000-7000-8000-000000000001";
export const GREEN_VALLEY = "0199a000-0000-7000-8000-000000000002";

export const PROJECT_OPTIONS = {
  items: [
    { id: SRI_HEIGHTS, name: "Sri Heights", status: "ongoing" },
    { id: GREEN_VALLEY, name: "Green Valley", status: "not_started" },
  ],
};

const AT = "2026-10-08T06:30:00.000Z";
const MEMBER_ID = "0199a1b2-0000-7000-8000-0000000004aa";

export const OWN_SIGN_IN_ACTIVE = {
  kind: "site_engineer",
  memberId: MEMBER_ID,
  status: "active",
  canSetPassword: true,
  invitePath: null,
  invitedAt: AT,
  joinedAt: AT,
} satisfies SiteEngineerSignIn;

export const OWN_SIGN_IN_PENDING = {
  kind: "site_engineer",
  memberId: MEMBER_ID,
  status: "joining_pending",
  canSetPassword: true,
  invitePath: "/join/tok_karthik",
  invitedAt: AT,
  joinedAt: null,
} satisfies SiteEngineerSignIn;

export const OFFICE_STAFF_SIGN_IN = {
  kind: "office_staff",
  memberId: "0199a1b2-0000-7000-8000-0000000004bb",
  name: "Prabhu Saravanan",
} satisfies SiteEngineerSignIn;

/** A Site Engineer with their own, active sign-in and every detail filled. */
export function siteEngineer(
  overrides: Partial<SiteEngineer> = {},
): SiteEngineer {
  return {
    id: "0199a1b2-0000-7000-8000-000000000401",
    name: "Karthik Raja",
    mobile: "+917708165767",
    mobileLocked: false,
    profile: {
      employeeCode: "SE-001",
      fatherName: "Selvam",
      dateOfBirth: "1990-04-12",
      gender: "male",
      bloodGroup: "B+",
      joiningDate: "2024-06-01",
      qualification: "B.E. Civil",
      experienceYears: 8,
      specialisation: "Steel / PEB",
    },
    bank: {
      accountHolder: "Karthik Raja",
      accountLast4: "6789",
      ifsc: "HDFC0001234",
      bankName: "HDFC Bank",
    },
    signIn: OWN_SIGN_IN_ACTIVE,
    email: "karthik@anugraha.in",
    address: "12 Anna Nagar, Madurai",
    aadhaarMasked: "XXXXXXXX0124",
    panMasked: "XXXXXX234F",
    emergencyContact: "Priya, +91 98400 12345",
    salaryType: "monthly",
    salaryPerDay: null,
    salaryPerMonth: 4_500_000,
    overtimeWagePerHour: 0,
    workingHoursPerDay: "8",
    weeklyHolidays: [0],
    projectIds: [SRI_HEIGHTS],
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

/** What a Site Engineer who is Office Staff looks like: no membership fields. */
export function officeStaffEngineer(
  overrides: Partial<SiteEngineer> = {},
): SiteEngineer {
  return siteEngineer({
    id: "0199a1b2-0000-7000-8000-000000000402",
    name: "Prabhu Saravanan",
    mobile: null,
    signIn: OFFICE_STAFF_SIGN_IN,
    email: null,
    address: null,
    aadhaarMasked: null,
    panMasked: null,
    emergencyContact: null,
    salaryType: null,
    salaryPerMonth: null,
    overtimeWagePerHour: null,
    workingHoursPerDay: null,
    weeklyHolidays: [],
    projectIds: [],
    ...overrides,
  });
}

/** An older Site Engineer with no sign-in and a bare profile. */
export function noSignInEngineer(
  overrides: Partial<SiteEngineer> = {},
): SiteEngineer {
  return officeStaffEngineer({
    id: "0199a1b2-0000-7000-8000-000000000403",
    name: "Vignesh Anand",
    mobile: "+919840012345",
    signIn: { kind: "none" },
    profile: {
      employeeCode: null,
      fatherName: null,
      dateOfBirth: null,
      gender: null,
      bloodGroup: null,
      joiningDate: null,
      qualification: null,
      experienceYears: null,
      specialisation: null,
    },
    bank: {
      accountHolder: null,
      accountLast4: null,
      ifsc: null,
      bankName: null,
    },
    ...overrides,
  });
}
