import type {
  DailyWorkDashboard,
  EquipmentUsageDashboard,
} from "@/src/queries/site-work-dashboard";
import { addDays } from "@/src/shared-kernel/calendar-date";

export const SITE_WORK_DASHBOARD_PATH = "/api/construction/site-work/dashboard";

/** A Daily Work section for `from`–`to`: worksheets on weekdays, attendance a little above. */
export function dailyWork(from: string, to: string): DailyWorkDashboard {
  const trend: DailyWorkDashboard["trend"] = [];
  let index = 0;
  for (let date = from; date <= to; date = addDays(date, 1), index += 1) {
    const sunday = index % 7 === 6;
    trend.push({
      date,
      worksheet: sunday ? 0 : 18 + ((index * 3) % 7),
      attendance: sunday ? 0 : 22 + ((index * 5) % 6),
    });
  }
  return {
    worksheets: 214,
    labourDays: trend.reduce((sum, day) => sum + day.worksheet, 0),
    pendingApprovals: 3,
    trend,
    contractors: [
      {
        contractorId: "0190a000-0000-7000-8000-00000000c001",
        contractor: "Velan Constructions",
        departmentId: "0190a000-0000-7000-8000-00000000d001",
        department: "Masonry",
        skilled: 412,
        unskilled: 655,
        total: 1067,
      },
      {
        contractorId: "0190a000-0000-7000-8000-00000000c002",
        contractor: "Sri Murugan Works",
        departmentId: "0190a000-0000-7000-8000-00000000d002",
        department: "Shuttering and centring",
        skilled: 230,
        unskilled: 180,
        total: 410,
      },
      {
        contractorId: "0190a000-0000-7000-8000-00000000c003",
        contractor: null,
        departmentId: "0190a000-0000-7000-8000-00000000d003",
        department: "Bar bending",
        skilled: 40,
        unskilled: 12,
        total: 52,
      },
    ],
  };
}

export function emptyDailyWork(from: string, to: string): DailyWorkDashboard {
  const days = dailyWork(from, to).trend.map((day) => ({
    ...day,
    worksheet: 0,
    attendance: 0,
  }));
  return {
    worksheets: 0,
    labourDays: 0,
    pendingApprovals: 0,
    trend: days,
    contractors: [],
  };
}

export function equipmentUsage(financial: boolean): EquipmentUsageDashboard {
  return {
    sheets: 96,
    hours: 612.5,
    km: 1840.25,
    trips: 260,
    fuelOverruns: 4,
    hireCost: financial ? 7_42_500_00 : null,
    topEquipment: [
      {
        equipmentId: "0190a000-0000-7000-8000-00000000e001",
        name: "JCB 3DX",
        equipmentNumber: "TN-09-AB-1234",
        ownership: "owned",
        hours: 214.5,
      },
      {
        equipmentId: "0190a000-0000-7000-8000-00000000e002",
        name: "Hired excavator (Komatsu PC210)",
        equipmentNumber: "TN-22-CD-5678",
        ownership: "rented",
        hours: 186,
      },
      {
        equipmentId: "0190a000-0000-7000-8000-00000000e003",
        name: "Tower crane",
        equipmentNumber: "TC-1",
        ownership: "owned",
        hours: 140,
      },
      {
        equipmentId: "0190a000-0000-7000-8000-00000000e004",
        name: "Concrete pump",
        equipmentNumber: "CP-2",
        ownership: "rented",
        hours: 72,
      },
    ],
    ownership: {
      owned: { hours: 354.5, sheets: 51 },
      rented: { hours: 258, sheets: 30 },
    },
  };
}

export const EMPTY_EQUIPMENT_USAGE: EquipmentUsageDashboard = {
  sheets: 0,
  hours: 0,
  km: 0,
  trips: 0,
  fuelOverruns: 0,
  hireCost: 0,
  topEquipment: [],
  ownership: {
    owned: { hours: 0, sheets: 0 },
    rented: { hours: 0, sheets: 0 },
  },
};
