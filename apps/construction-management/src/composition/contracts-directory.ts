import type {
  ContractsClientFacts,
  ContractsContractorFacts,
  ContractsDirectory,
  ContractsEquipmentFacts,
  ContractsLabourCategoryFacts,
  ContractsMaterialFacts,
  ContractsUomFacts,
  ContractsWingFacts,
} from "@/src/contracts/application/ports";
import { projectStructure } from "@/src/projects/domain/project-type";

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

const byId = <T extends { id: string }>(rows: T[]): Map<string, T> =>
  new Map(rows.map((row) => [row.id, row]));

type Disableable = { deletedAt: Date | null; disabledAt: Date | null };
const enabled = (row: Disableable): boolean =>
  row.deletedAt == null && row.disabledAt == null;

const CONTRACTOR_SELECT = {
  id: true,
  name: true,
  gstin: true,
  pan: true,
  stateCode: true,
  tdsApplicable: true,
  isActive: true,
  deletedAt: true,
  departments: {
    select: {
      department: {
        select: { id: true, name: true, deletedAt: true, disabledAt: true },
      },
    },
  },
  projects: { select: { projectId: true } },
} as const;

export type ContractorRow = {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  stateCode: string | null;
  tdsApplicable: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  departments: {
    department: {
      id: string;
      name: string;
      deletedAt: Date | null;
      disabledAt: Date | null;
    };
  }[];
  projects: { projectId: string }[];
};

/** A Contractor row as contracts sees it; Departments by name. */
export function toContractor(
  row: ContractorRow,
  projectId: string,
): ContractsContractorFacts {
  return {
    id: row.id,
    name: row.name,
    gstin: row.gstin,
    pan: row.pan,
    stateCode: row.stateCode,
    tdsApplicable: row.tdsApplicable,
    active: row.isActive && row.deletedAt == null,
    departments: row.departments
      .map(({ department }) => ({
        id: department.id,
        name: department.name,
        active: enabled(department),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    onProject: row.projects.some((item) => item.projectId === projectId),
  };
}

const CLIENT_SELECT = {
  id: true,
  name: true,
  gstin: true,
  pan: true,
  tan: true,
  stateCode: true,
  address: true,
  pinCode: true,
  email: true,
  mobile: true,
  isActive: true,
  deletedAt: true,
} as const;

type ClientRow = Omit<ContractsClientFacts, "active"> & {
  isActive: boolean;
  deletedAt: Date | null;
};

function toClient({
  isActive,
  deletedAt,
  ...row
}: ClientRow): ContractsClientFacts {
  return { ...row, active: isActive && deletedAt == null };
}

const MATERIAL_SELECT = {
  id: true,
  name: true,
  specification: true,
  uomId: true,
  hsnCode: true,
  gstRate: true,
  unitRate: true,
  deletedAt: true,
  disabledAt: true,
  uom: { select: { name: true } },
} as const;

export type MaterialRow = Disableable & {
  id: string;
  name: string;
  specification: string | null;
  uomId: string;
  hsnCode: string | null;
  gstRate: { toFixed(digits: number): string } | null;
  unitRate: bigint | null;
  uom: { name: string };
};

/** A Material row as contracts sees it: GST % as a two-place string. */
export function toMaterial(row: MaterialRow): ContractsMaterialFacts {
  return {
    id: row.id,
    name: row.name,
    specification: row.specification,
    uomId: row.uomId,
    uomName: row.uom.name,
    hsnCode: row.hsnCode,
    gstRate: row.gstRate == null ? null : row.gstRate.toFixed(2),
    unitRate: row.unitRate,
    active: enabled(row),
  };
}

const LABOUR_CATEGORY_SELECT = {
  id: true,
  name: true,
  skill: true,
  deletedAt: true,
  disabledAt: true,
} as const;

function toLabourCategory(
  row: Disableable & {
    id: string;
    name: string;
    skill: ContractsLabourCategoryFacts["skill"];
  },
): ContractsLabourCategoryFacts {
  return { id: row.id, name: row.name, skill: row.skill, active: enabled(row) };
}

const EQUIPMENT_SELECT = {
  id: true,
  name: true,
  equipmentNumber: true,
  deletedAt: true,
} as const;

function toEquipment(row: {
  id: string;
  name: string;
  equipmentNumber: string;
  deletedAt: Date | null;
}): ContractsEquipmentFacts {
  return {
    id: row.id,
    name: row.name,
    equipmentNumber: row.equipmentNumber,
    active: row.deletedAt == null,
  };
}

const UOM_SELECT = {
  id: true,
  name: true,
  deletedAt: true,
  disabledAt: true,
} as const;

function toUom(
  row: Disableable & { id: string; name: string },
): ContractsUomFacts {
  return { id: row.id, name: row.name, active: enabled(row) };
}

const WING_SELECT = {
  id: true,
  name: true,
  deletedAt: true,
  phase: { select: { name: true, deletedAt: true } },
} as const;

export type WingRow = {
  id: string;
  name: string;
  deletedAt: Date | null;
  phase: { name: string; deletedAt: Date | null };
};

/** A Wing is active while it and its Phase are live. */
export function toWing(row: WingRow): ContractsWingFacts {
  return {
    id: row.id,
    name: row.name,
    phaseName: row.phase.name,
    active: row.deletedAt == null && row.phase.deletedAt == null,
  };
}

const LOCATION_SELECT = { id: true, name: true, deletedAt: true } as const;

function toLocation(row: {
  id: string;
  name: string;
  deletedAt: Date | null;
}): { id: string; name: string; active: boolean } {
  return { id: row.id, name: row.name, active: row.deletedAt == null };
}

const ENABLED = { deletedAt: null, disabledAt: null } as const;

/**
 * What contracts reads from projects, masters and site-work (ADR CM-0023
 * §1), by table. Lives in composition because it crosses contexts;
 * contracts only sees the `ContractsDirectory` port.
 */
export const contractsDirectory: ContractsDirectory = {
  async project(db, workspaceId, projectId) {
    const row = await db.constructionProjectsProject.findFirst({
      where: { id: projectId, workspaceId, deletedAt: null },
      select: {
        id: true,
        name: true,
        role: true,
        stateCode: true,
        clientId: true,
        clientName: true,
        orderValue: true,
        projectType: true,
      },
    });
    if (row == null) return null;
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      stateCode: row.stateCode,
      clientId: row.clientId,
      clientName: row.clientName,
      orderValue: row.orderValue,
      structure: projectStructure(row.projectType),
    };
  },

  async contractorsOnProject(db, workspaceId, projectId) {
    const rows = await db.constructionMastersContractor.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        isActive: true,
        projects: { some: { projectId } },
      },
      select: {
        ...CONTRACTOR_SELECT,
        departments: {
          where: { department: ENABLED },
          select: CONTRACTOR_SELECT.departments.select,
        },
      },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => toContractor(row, projectId));
  },

  async contractors(db, workspaceId, projectId, contractorIds) {
    if (contractorIds.length === 0) return new Map();
    const rows = await db.constructionMastersContractor.findMany({
      where: { workspaceId, id: { in: unique(contractorIds) } },
      select: CONTRACTOR_SELECT,
    });
    return byId(rows.map((row) => toContractor(row, projectId)));
  },

  async departments(db, workspaceId, departmentIds) {
    if (departmentIds.length === 0) return new Map();
    const rows = await db.constructionMastersDepartment.findMany({
      where: { workspaceId, id: { in: unique(departmentIds) } },
      select: { id: true, name: true, deletedAt: true, disabledAt: true },
    });
    return byId(
      rows.map((row) => ({ id: row.id, name: row.name, active: enabled(row) })),
    );
  },

  async clientOptions(db, workspaceId) {
    const rows = await db.constructionMastersClient.findMany({
      where: { workspaceId, deletedAt: null, isActive: true },
      select: CLIENT_SELECT,
      orderBy: { name: "asc" },
    });
    return rows.map(toClient);
  },

  async clients(db, workspaceId, clientIds) {
    if (clientIds.length === 0) return new Map();
    const rows = await db.constructionMastersClient.findMany({
      where: { workspaceId, id: { in: unique(clientIds) } },
      select: CLIENT_SELECT,
    });
    return byId(rows.map(toClient));
  },

  async materialOptions(db, workspaceId, query) {
    const search = query.search?.trim();
    const rows = await db.constructionMastersMaterial.findMany({
      where: {
        workspaceId,
        ...ENABLED,
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      select: MATERIAL_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: query.limit,
    });
    return rows.map(toMaterial);
  },

  async materials(db, workspaceId, materialIds) {
    if (materialIds.length === 0) return new Map();
    const rows = await db.constructionMastersMaterial.findMany({
      where: { workspaceId, id: { in: unique(materialIds) } },
      select: MATERIAL_SELECT,
    });
    return byId(rows.map(toMaterial));
  },

  async labourCategoryOptions(db, workspaceId) {
    const rows = await db.constructionMastersLabourCategory.findMany({
      where: { workspaceId, ...ENABLED },
      select: LABOUR_CATEGORY_SELECT,
      orderBy: { name: "asc" },
    });
    return rows.map(toLabourCategory);
  },

  async labourCategories(db, workspaceId, labourCategoryIds) {
    if (labourCategoryIds.length === 0) return new Map();
    const rows = await db.constructionMastersLabourCategory.findMany({
      where: { workspaceId, id: { in: unique(labourCategoryIds) } },
      select: LABOUR_CATEGORY_SELECT,
    });
    return byId(rows.map(toLabourCategory));
  },

  async equipmentOptions(db, workspaceId) {
    const rows = await db.constructionSiteWorkEquipment.findMany({
      where: { workspaceId, deletedAt: null },
      select: EQUIPMENT_SELECT,
      orderBy: [{ name: "asc" }, { equipmentNumber: "asc" }],
    });
    return rows.map(toEquipment);
  },

  async equipment(db, workspaceId, equipmentIds) {
    if (equipmentIds.length === 0) return new Map();
    const rows = await db.constructionSiteWorkEquipment.findMany({
      where: { workspaceId, id: { in: unique(equipmentIds) } },
      select: EQUIPMENT_SELECT,
    });
    return byId(rows.map(toEquipment));
  },

  async uomOptions(db, workspaceId) {
    const rows = await db.constructionMastersMeasurementUnit.findMany({
      where: { workspaceId, ...ENABLED },
      select: UOM_SELECT,
      orderBy: { name: "asc" },
    });
    return rows.map(toUom);
  },

  async uoms(db, workspaceId, uomIds) {
    if (uomIds.length === 0) return new Map();
    const rows = await db.constructionMastersMeasurementUnit.findMany({
      where: { workspaceId, id: { in: unique(uomIds) } },
      select: UOM_SELECT,
    });
    return byId(rows.map(toUom));
  },

  async wings(db, workspaceId, projectId) {
    const rows = await db.constructionProjectsWing.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        phase: { deletedAt: null },
      },
      select: WING_SELECT,
      orderBy: [{ phase: { position: "asc" } }, { position: "asc" }],
    });
    return rows.map(toWing);
  },

  async wingsById(db, workspaceId, projectId, wingIds) {
    if (wingIds.length === 0) return new Map();
    const rows = await db.constructionProjectsWing.findMany({
      where: { workspaceId, projectId, id: { in: unique(wingIds) } },
      select: WING_SELECT,
    });
    return byId(rows.map(toWing));
  },

  async locations(db, workspaceId, projectId) {
    const rows = await db.constructionProjectsLocation.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      select: LOCATION_SELECT,
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    return rows.map(toLocation);
  },

  async locationsById(db, workspaceId, projectId, locationIds) {
    if (locationIds.length === 0) return new Map();
    const rows = await db.constructionProjectsLocation.findMany({
      where: { workspaceId, projectId, id: { in: unique(locationIds) } },
      select: LOCATION_SELECT,
    });
    return byId(rows.map(toLocation));
  },
};
