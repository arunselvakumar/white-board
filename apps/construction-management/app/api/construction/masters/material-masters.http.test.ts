import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { seedCompanyMasters } from "@/src/masters/infrastructure/seed-company-masters";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { addOpeningStock } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteCategory } from "./material-categories/[id]/delete/route";
import { POST as disableCategory } from "./material-categories/[id]/disable/route";
import { POST as updateCategory } from "./material-categories/[id]/update/route";
import {
  GET as listCategories,
  POST as createCategory,
} from "./material-categories/route";
import { POST as deleteMaterial } from "./materials/[id]/delete/route";
import { POST as disableMaterial } from "./materials/[id]/disable/route";
import { POST as enableMaterial } from "./materials/[id]/enable/route";
import { GET as getMaterial } from "./materials/[id]/route";
import { POST as updateMaterial } from "./materials/[id]/update/route";
import { GET as materialOptions } from "./materials/options/route";
import {
  GET as listMaterials,
  POST as createMaterial,
} from "./materials/route";
import { POST as deleteUnit } from "./measurement-units/[id]/delete/route";
import { POST as disableUnit } from "./measurement-units/[id]/disable/route";
import { POST as enableUnit } from "./measurement-units/[id]/enable/route";
import { GET as getUnit } from "./measurement-units/[id]/route";
import { POST as updateUnit } from "./measurement-units/[id]/update/route";
import {
  GET as listUnits,
  POST as createUnit,
} from "./measurement-units/route";
import { POST as deleteTerms } from "./terms-conditions/[id]/delete/route";
import { POST as updateTerms } from "./terms-conditions/[id]/update/route";
import {
  GET as listTerms,
  POST as createTerms,
} from "./terms-conditions/route";

const BASE = `${TEST_ORIGIN}/api/construction/masters`;
const UNITS = `${BASE}/measurement-units`;
const CATEGORIES = `${BASE}/material-categories`;
const MATERIALS = `${BASE}/materials`;
const TERMS = `${BASE}/terms-conditions`;

type Page<T> = {
  items: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};
type Unit = {
  id: string;
  name: string;
  isSeed: boolean;
  disabled: boolean;
  updatedAt: string;
};
type Category = Unit & {
  parentId: string | null;
  parentName: string | null;
  childCount: number;
};
type Material = {
  id: string;
  name: string;
  specification: string | null;
  uomId: string;
  uomName: string;
  categoryId: string | null;
  categoryName: string | null;
  itemType: string;
  unitRate: number | null;
  discount: unknown;
  gstRate: string | null;
  hsnCode: string | null;
  minStockQty: string | null;
  disabled: boolean;
  updatedAt: string;
};
type Terms = {
  id: string;
  title: string;
  body: string;
  disabled: boolean;
  updatedAt: string;
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function code(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function page<T>(
  list: (request: Request) => Promise<Response>,
  url: string,
  cookie: string,
): Promise<Page<T>> {
  const response = await list(jsonRequest(url, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return json<Page<T>>(response);
}

async function unitNamed(company: Company, name: string): Promise<Unit> {
  const body = await page<Unit>(
    listUnits,
    `${UNITS}?q=${encodeURIComponent(name)}&limit=100`,
    company.cookie,
  );
  const found = body.items.find((item) => item.name === name);
  if (found == null) throw new Error(`No unit ${name}`);
  return found;
}

async function categoryNamed(
  company: Company,
  name: string,
): Promise<Category> {
  const body = await page<Category>(
    listCategories,
    `${CATEGORIES}?q=${encodeURIComponent(name)}`,
    company.cookie,
  );
  const found = body.items.find((item) => item.name === name);
  if (found == null) throw new Error(`No category ${name}`);
  return found;
}

async function addMaterial(
  company: Company,
  body: Record<string, unknown>,
): Promise<Material> {
  const response = await createMaterial(
    jsonRequest(MATERIALS, company.cookie, body),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Material>(response);
}

describe("Procurement masters HTTP (CM-501)", () => {
  it("is 401 without a Session", async () => {
    for (const [list, url] of [
      [listUnits, UNITS],
      [listCategories, CATEGORIES],
      [listMaterials, MATERIALS],
      [listTerms, TERMS],
      [materialOptions, `${MATERIALS}/options`],
    ] as const) {
      const response = await list(new Request(url));
      expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    }
  });

  it("gives a new Company the 41 units, the starter categories and Cement OPC 53, once", async () => {
    const owner = await ownerWithCompany();
    const units = await page<Unit>(listUnits, `${UNITS}?limit=100`, owner.cookie);
    expect(units.total).toBe(41);
    expect(units.items.every((item) => item.isSeed)).toBe(true);
    expect(units.items.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Bag", "cum", "sqft", "Trip"]),
    );
    const categories = await page<Category>(
      listCategories,
      `${CATEGORIES}?limit=100`,
      owner.cookie,
    );
    expect(categories.items.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Civil Work Materials", "Fire & Safety"]),
    );
    const materials = await page<Material>(
      listMaterials,
      MATERIALS,
      owner.cookie,
    );
    expect(materials.items).toEqual([
      expect.objectContaining({
        name: "Cement OPC 53",
        uomName: "Bag",
        categoryName: "Civil Work Materials",
        itemType: "consumable",
      }),
    ]);

    await seedCompanyMasters(prisma, {
      workspaceId: owner.workspaceId,
      by: owner.userId,
    });
    const where = { workspaceId: owner.workspaceId };
    expect(
      await prisma.constructionMastersMeasurementUnit.count({ where }),
    ).toBe(41);
    expect(await prisma.constructionMastersMaterial.count({ where })).toBe(1);
  });

  it("pages units newest first, searches, filters by state", async () => {
    const owner = await ownerWithCompany();
    const first = await page<Unit>(listUnits, `${UNITS}?limit=20`, owner.cookie);
    expect(first.items).toHaveLength(20);
    expect(first.total).toBe(41);
    expect(first.prevCursor).toBeNull();
    if (first.nextCursor == null) throw new Error("Expected more units");
    const second = await page<Unit>(
      listUnits,
      `${UNITS}?limit=20&after=${first.nextCursor}`,
      owner.cookie,
    );
    expect(second.items).toHaveLength(20);
    const ids = new Set([...first.items, ...second.items].map((u) => u.id));
    expect(ids.size).toBe(40);
    if (second.prevCursor == null) throw new Error("Expected a way back");
    const back = await page<Unit>(
      listUnits,
      `${UNITS}?limit=20&before=${second.prevCursor}`,
      owner.cookie,
    );
    expect(back.items.map((u) => u.id)).toEqual(first.items.map((u) => u.id));

    const bag = await unitNamed(owner, "Bag");
    await disableUnit(
      jsonRequest(`${UNITS}/${bag.id}/disable`, owner.cookie, {}),
      params(bag.id),
    );
    const disabled = await page<Unit>(
      listUnits,
      `${UNITS}?status=disabled`,
      owner.cookie,
    );
    expect(disabled.items.map((u) => u.name)).toEqual(["Bag"]);
    const enabled = await page<Unit>(
      listUnits,
      `${UNITS}?status=enabled&limit=100`,
      owner.cookie,
    );
    expect(enabled.total).toBe(40);
    const searched = await page<Unit>(listUnits, `${UNITS}?q=SQ`, owner.cookie);
    expect(searched.items.map((u) => u.name).sort()).toEqual([
      "sqft",
      "sqm",
      "sqyd",
    ]);
  });

  it("adds, renames, disables, enables and deletes a unit; seed rows only disable", async () => {
    const owner = await ownerWithCompany();
    const created = await createUnit(
      jsonRequest(UNITS, owner.cookie, { name: "  Running   Metre " }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const unit = await json<Unit>(created);
    expect(unit).toMatchObject({ name: "Running Metre", isSeed: false });

    const clash = await createUnit(
      jsonRequest(UNITS, owner.cookie, { name: "BAG" }),
    );
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(await code(clash)).toBe("MEASUREMENT_UNIT_NAME_IN_USE");

    const renamed = await updateUnit(
      jsonRequest(`${UNITS}/${unit.id}/update`, owner.cookie, {
        name: "Rmt",
        expectedUpdatedAt: unit.updatedAt,
      }),
      params(unit.id),
    );
    expect(renamed.status).toBe(StatusCodes.OK);
    const stale = await updateUnit(
      jsonRequest(`${UNITS}/${unit.id}/update`, owner.cookie, {
        name: "RMT 2",
        expectedUpdatedAt: unit.updatedAt,
      }),
      params(unit.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await code(stale)).toBe("MEASUREMENT_UNIT_CHANGED");

    const bag = await unitNamed(owner, "Bag");
    const seedRename = await updateUnit(
      jsonRequest(`${UNITS}/${bag.id}/update`, owner.cookie, {
        name: "Sack",
        expectedUpdatedAt: bag.updatedAt,
      }),
      params(bag.id),
    );
    expect(await code(seedRename)).toBe("SEED_IS_READ_ONLY");
    const seedDelete = await deleteUnit(
      jsonRequest(`${UNITS}/${bag.id}/delete`, owner.cookie, {}),
      params(bag.id),
    );
    expect(seedDelete.status).toBe(StatusCodes.CONFLICT);
    expect(await code(seedDelete)).toBe("SEED_IS_READ_ONLY");
    const seedDisable = await disableUnit(
      jsonRequest(`${UNITS}/${bag.id}/disable`, owner.cookie, {}),
      params(bag.id),
    );
    expect(await json<Unit>(seedDisable)).toMatchObject({ disabled: true });
    const seedEnable = await enableUnit(
      jsonRequest(`${UNITS}/${bag.id}/enable`, owner.cookie, {}),
      params(bag.id),
    );
    expect(await json<Unit>(seedEnable)).toMatchObject({ disabled: false });

    // In use by a Material: refused.
    await addMaterial(owner, { name: "Binding Wire", uomId: unit.id });
    const inUse = await deleteUnit(
      jsonRequest(`${UNITS}/${unit.id}/delete`, owner.cookie, {}),
      params(unit.id),
    );
    expect(inUse.status).toBe(StatusCodes.CONFLICT);
    expect(await code(inUse)).toBe("MEASUREMENT_UNIT_IN_USE");

    const spare = await json<Unit>(
      await createUnit(jsonRequest(UNITS, owner.cookie, { name: "Coil" })),
    );
    const deleted = await deleteUnit(
      jsonRequest(`${UNITS}/${spare.id}/delete`, owner.cookie, {}),
      params(spare.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getUnit(
      jsonRequest(`${UNITS}/${spare.id}`, owner.cookie),
      params(spare.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    // The name is free again.
    const again = await createUnit(
      jsonRequest(UNITS, owner.cookie, { name: "coil" }),
    );
    expect(again.status).toBe(StatusCodes.CREATED);

    const actions = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: unit.id },
      select: { action: true },
      orderBy: { occurredAt: "asc" },
    });
    expect(actions.map((row) => row.action)).toEqual([
      "measurement_unit.created",
      "measurement_unit.updated",
    ]);
  });

  it("keeps Material Categories to one level of parent", async () => {
    const owner = await ownerWithCompany();
    const civil = await categoryNamed(owner, "Civil Work Materials");
    const created = await createCategory(
      jsonRequest(CATEGORIES, owner.cookie, {
        name: "Cement",
        parentId: civil.id,
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const cement = await json<Category>(created);
    expect(cement).toMatchObject({
      parentId: civil.id,
      parentName: "Civil Work Materials",
      childCount: 0,
    });
    expect(await categoryNamed(owner, "Civil Work Materials")).toMatchObject({
      childCount: 1,
    });

    // A sub-category cannot be a parent.
    const third = await createCategory(
      jsonRequest(CATEGORIES, owner.cookie, {
        name: "OPC",
        parentId: cement.id,
      }),
    );
    expect(third.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(third)).toBe("MATERIAL_CATEGORY_PARENT_INVALID");

    // A parent with children cannot get a parent.
    const top = await json<Category>(
      await createCategory(
        jsonRequest(CATEGORIES, owner.cookie, { name: "Site Consumables" }),
      ),
    );
    const child = await json<Category>(
      await createCategory(
        jsonRequest(CATEGORIES, owner.cookie, {
          name: "Gloves",
          parentId: top.id,
        }),
      ),
    );
    const refreshedTop = await categoryNamed(owner, "Site Consumables");
    const nested = await updateCategory(
      jsonRequest(`${CATEGORIES}/${top.id}/update`, owner.cookie, {
        name: "Site Consumables",
        parentId: civil.id,
        expectedUpdatedAt: refreshedTop.updatedAt,
      }),
      params(top.id),
    );
    expect(nested.status).toBe(StatusCodes.CONFLICT);
    expect(await code(nested)).toBe("MATERIAL_CATEGORY_HAS_CHILDREN");

    const self = await updateCategory(
      jsonRequest(`${CATEGORIES}/${child.id}/update`, owner.cookie, {
        name: "Gloves",
        parentId: child.id,
        expectedUpdatedAt: child.updatedAt,
      }),
      params(child.id),
    );
    expect(await code(self)).toBe("MATERIAL_CATEGORY_PARENT_INVALID");

    const unknown = await createCategory(
      jsonRequest(CATEGORIES, owner.cookie, {
        name: "Ghost",
        parentId: randomUUID(),
      }),
    );
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(unknown)).toBe("MATERIAL_CATEGORY_NOT_FOUND");

    // A disabled parent is not offered to new children.
    await disableCategory(
      jsonRequest(`${CATEGORIES}/${top.id}/disable`, owner.cookie, {}),
      params(top.id),
    );
    const underDisabled = await createCategory(
      jsonRequest(CATEGORIES, owner.cookie, {
        name: "Helmets",
        parentId: top.id,
      }),
    );
    expect(await code(underDisabled)).toBe("MATERIAL_CATEGORY_DISABLED");

    // Top-level filter for the parent picker.
    const topLevel = await page<Category>(
      listCategories,
      `${CATEGORIES}?topLevel=true&limit=100`,
      owner.cookie,
    );
    expect(topLevel.items.every((item) => item.parentId == null)).toBe(true);
    const children = await page<Category>(
      listCategories,
      `${CATEGORIES}?parentId=${civil.id}`,
      owner.cookie,
    );
    expect(children.items.map((item) => item.name)).toEqual(["Cement"]);

    // In use: a parent with a child, a category with a Material; seeds read-only.
    const withChild = await deleteCategory(
      jsonRequest(`${CATEGORIES}/${top.id}/delete`, owner.cookie, {}),
      params(top.id),
    );
    expect(await code(withChild)).toBe("MATERIAL_CATEGORY_IN_USE");
    const bag = await unitNamed(owner, "Bag");
    await addMaterial(owner, {
      name: "Nitrile Gloves",
      uomId: bag.id,
      categoryId: child.id,
    });
    const withMaterial = await deleteCategory(
      jsonRequest(`${CATEGORIES}/${child.id}/delete`, owner.cookie, {}),
      params(child.id),
    );
    expect(withMaterial.status).toBe(StatusCodes.CONFLICT);
    expect(await code(withMaterial)).toBe("MATERIAL_CATEGORY_IN_USE");
    const seed = await updateCategory(
      jsonRequest(`${CATEGORIES}/${civil.id}/update`, owner.cookie, {
        name: "Civil",
        parentId: null,
        expectedUpdatedAt: civil.updatedAt,
      }),
      params(civil.id),
    );
    expect(await code(seed)).toBe("SEED_IS_READ_ONLY");
    const deletedCement = await deleteCategory(
      jsonRequest(`${CATEGORIES}/${cement.id}/delete`, owner.cookie, {}),
      params(cement.id),
    );
    expect(deletedCement.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("adds and edits a Material with Rate Details, and checks every field", async () => {
    const owner = await ownerWithCompany();
    const bag = await unitNamed(owner, "Bag");
    const civil = await categoryNamed(owner, "Civil Work Materials");
    const material = await addMaterial(owner, {
      name: "  Cement   PPC ",
      specification: "Dalmia, 50 kg",
      uomId: bag.id,
      categoryId: civil.id,
      itemType: "consumable",
      unitRate: 36_000,
      discount: { type: "percent", percent: "2.5" },
      gstRate: "18",
      hsnCode: "2523",
      minStockQty: "25.5",
    });
    expect(material).toMatchObject({
      name: "Cement PPC",
      uomName: "Bag",
      categoryName: "Civil Work Materials",
      unitRate: 36_000,
      discount: { type: "percent", percent: "2.50" },
      gstRate: "18.00",
      hsnCode: "2523",
      minStockQty: "25.500",
      disabled: false,
    });

    const bad = async (body: Record<string, unknown>, expected: string) => {
      const response = await createMaterial(
        jsonRequest(MATERIALS, owner.cookie, {
          name: `Check ${randomUUID().slice(0, 6)}`,
          uomId: bag.id,
          ...body,
        }),
      );
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await code(response)).toBe(expected);
    };
    await bad({ hsnCode: "123" }, "HSN_CODE_INVALID");
    await bad({ hsnCode: "123456789" }, "HSN_CODE_INVALID");
    await bad({ gstRate: "101" }, "GST_RATE_INVALID");
    await bad({ gstRate: "12.345" }, "GST_RATE_INVALID");
    await bad({ discount: { type: "percent", percent: "120" } }, "DISCOUNT_INVALID");
    await bad({ minStockQty: "-1" }, "MIN_STOCK_QTY_INVALID");
    await bad({ minStockQty: "1.2345" }, "MIN_STOCK_QTY_INVALID");
    await bad({ name: "  " }, "MATERIAL_NAME_REQUIRED");
    await bad({ uomId: randomUUID() }, "MEASUREMENT_UNIT_NOT_FOUND");
    await bad({ categoryId: randomUUID() }, "MATERIAL_CATEGORY_NOT_FOUND");

    const clash = await createMaterial(
      jsonRequest(MATERIALS, owner.cookie, {
        name: "cement ppc",
        uomId: bag.id,
      }),
    );
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(await code(clash)).toBe("MATERIAL_NAME_IN_USE");

    // A disabled unit is not offered to a new Material but stays on old ones.
    const kg = await unitNamed(owner, "kg");
    await disableUnit(
      jsonRequest(`${UNITS}/${kg.id}/disable`, owner.cookie, {}),
      params(kg.id),
    );
    await bad({ uomId: kg.id }, "MEASUREMENT_UNIT_DISABLED");
    await disableUnit(
      jsonRequest(`${UNITS}/${bag.id}/disable`, owner.cookie, {}),
      params(bag.id),
    );
    const kept = await updateMaterial(
      jsonRequest(`${MATERIALS}/${material.id}/update`, owner.cookie, {
        name: "Cement PPC",
        uomId: bag.id,
        categoryId: civil.id,
        itemType: "asset",
        discount: { type: "amount", paise: 500 },
        expectedUpdatedAt: material.updatedAt,
      }),
      params(material.id),
    );
    expect(kept.status).toBe(StatusCodes.OK);
    const edited = await json<Material>(kept);
    expect(edited).toMatchObject({
      itemType: "asset",
      unitRate: null,
      discount: { type: "amount", paise: 500 },
      gstRate: null,
      specification: null,
      minStockQty: null,
    });

    const stale = await updateMaterial(
      jsonRequest(`${MATERIALS}/${material.id}/update`, owner.cookie, {
        name: "Cement PPC 2",
        uomId: bag.id,
        expectedUpdatedAt: material.updatedAt,
      }),
      params(material.id),
    );
    expect(await code(stale)).toBe("MATERIAL_CHANGED");

    // Filters and search.
    const byCategory = await page<Material>(
      listMaterials,
      `${MATERIALS}?categoryId=${civil.id}`,
      owner.cookie,
    );
    expect(byCategory.items.map((item) => item.name).sort()).toEqual([
      "Cement OPC 53",
      "Cement PPC",
    ]);
    const byType = await page<Material>(
      listMaterials,
      `${MATERIALS}?itemType=asset`,
      owner.cookie,
    );
    expect(byType.items.map((item) => item.name)).toEqual(["Cement PPC"]);
    const bySpec = await page<Material>(
      listMaterials,
      `${MATERIALS}?q=dalmia`,
      owner.cookie,
    );
    expect(bySpec.total).toBe(0);
  });

  it("hides and keeps Rate Details without Materials Financial", async () => {
    const owner = await ownerWithCompany();
    const bag = await unitNamed(owner, "Bag");
    const material = await addMaterial(owner, {
      name: "TMT 12 mm",
      uomId: bag.id,
      unitRate: 6_250,
      gstRate: "18",
      hsnCode: "7214",
    });
    const clerk = await memberWith(owner, {
      "masters.materials": ["read", "create", "update"],
    });
    const read = await getMaterial(
      jsonRequest(`${MATERIALS}/${material.id}`, clerk.cookie),
      params(material.id),
    );
    expect(await json<Material>(read)).toMatchObject({
      unitRate: null,
      discount: null,
      gstRate: null,
      hsnCode: null,
    });
    const edited = await updateMaterial(
      jsonRequest(`${MATERIALS}/${material.id}/update`, clerk.cookie, {
        name: "TMT 12 mm Fe 550",
        uomId: bag.id,
        unitRate: 1,
        gstRate: "5",
        expectedUpdatedAt: material.updatedAt,
      }),
      params(material.id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const stored = await prisma.constructionMastersMaterial.findUniqueOrThrow({
      where: { id: material.id },
    });
    expect(stored.name).toBe("TMT 12 mm Fe 550");
    expect(stored.unitRate).toBe(6_250n);
    expect(stored.gstRate?.toFixed(2)).toBe("18.00");
    expect(stored.hsnCode).toBe("7214");

    const added = await createMaterial(
      jsonRequest(MATERIALS, clerk.cookie, {
        name: "Binding Wire",
        uomId: bag.id,
        unitRate: 9_000,
      }),
    );
    expect(added.status).toBe(StatusCodes.CREATED);
    const { id } = await json<Material>(added);
    expect(
      (
        await prisma.constructionMastersMaterial.findUniqueOrThrow({
          where: { id },
        })
      ).unitRate,
    ).toBeNull();

    const options = await materialOptions(
      jsonRequest(`${MATERIALS}/options?search=tmt`, clerk.cookie),
    );
    expect(await json(options)).toEqual({
      items: [
        expect.objectContaining({
          id: material.id,
          unitRate: null,
          gstRate: null,
          hsnCode: null,
        }),
      ],
    });
    const ownerOptions = await materialOptions(
      jsonRequest(`${MATERIALS}/options?search=tmt`, owner.cookie),
    );
    expect(await json(ownerOptions)).toEqual({
      items: [
        expect.objectContaining({
          unitRate: 6_250,
          gstRate: "18.00",
          hsnCode: "7214",
        }),
      ],
    });
  });

  it("serves the picker to Materials or procurement readers: enabled by name, ids, category", async () => {
    const owner = await ownerWithCompany();
    const bag = await unitNamed(owner, "Bag");
    const civil = await categoryNamed(owner, "Civil Work Materials");
    const sub = await json<Category>(
      await createCategory(
        jsonRequest(CATEGORIES, owner.cookie, {
          name: "Aggregates",
          parentId: civil.id,
        }),
      ),
    );
    const sand = await addMaterial(owner, {
      name: "M Sand",
      uomId: bag.id,
      categoryId: sub.id,
    });
    const old = await addMaterial(owner, { name: "Old Lime", uomId: bag.id });
    await disableMaterial(
      jsonRequest(`${MATERIALS}/${old.id}/disable`, owner.cookie, {}),
      params(old.id),
    );

    const buyer = await memberWith(owner, {
      "procurement.purchase_orders": ["read"],
    });
    const all = await json<{ items: { name: string; uomName: string }[] }>(
      await materialOptions(jsonRequest(`${MATERIALS}/options`, buyer.cookie)),
    );
    expect(all.items.map((item) => item.name)).toEqual([
      "Cement OPC 53",
      "M Sand",
    ]);
    // A parent category includes its sub-categories.
    const civilOnly = await json<{ items: { name: string }[] }>(
      await materialOptions(
        jsonRequest(
          `${MATERIALS}/options?categoryId=${civil.id}`,
          buyer.cookie,
        ),
      ),
    );
    expect(civilOnly.items.map((item) => item.name)).toEqual([
      "Cement OPC 53",
      "M Sand",
    ]);
    const byIds = await json<{ items: { id: string }[] }>(
      await materialOptions(
        jsonRequest(
          `${MATERIALS}/options?ids=${old.id},${sand.id},nonsense`,
          buyer.cookie,
        ),
      ),
    );
    expect(byIds.items.map((item) => item.id).sort()).toEqual(
      [old.id, sand.id].sort(),
    );
    const limited = await json<{ items: unknown[] }>(
      await materialOptions(
        jsonRequest(`${MATERIALS}/options?limit=1`, buyer.cookie),
      ),
    );
    expect(limited.items).toHaveLength(1);

    const outsider = await memberWith(owner, { "masters.units": ["read"] });
    const refused = await materialOptions(
      jsonRequest(`${MATERIALS}/options`, outsider.cookie),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await code(refused)).toBe("PERMISSION_DENIED");
    const listRefused = await listMaterials(
      jsonRequest(MATERIALS, buyer.cookie),
    );
    expect(listRefused.status).toBe(StatusCodes.FORBIDDEN);

    await enableMaterial(
      jsonRequest(`${MATERIALS}/${old.id}/enable`, owner.cookie, {}),
      params(old.id),
    );
    const back = await json<{ items: { name: string }[] }>(
      await materialOptions(jsonRequest(`${MATERIALS}/options`, owner.cookie)),
    );
    expect(back.items.map((item) => item.name)).toContain("Old Lime");
  });

  it("refuses to delete a Material with stock or on a procurement document", async () => {
    const owner = await ownerWithCompany();
    const bag = await unitNamed(owner, "Bag");
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const stocked = await addMaterial(owner, { name: "Grit", uomId: bag.id });
    await addOpeningStock(
      owner.workspaceId,
      owner.userId,
      { kind: "project", id: projectId },
      stocked.id,
      "10",
    );
    const refused = await deleteMaterial(
      jsonRequest(`${MATERIALS}/${stocked.id}/delete`, owner.cookie, {}),
      params(stocked.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await code(refused)).toBe("MATERIAL_IN_USE");

    const free = await addMaterial(owner, { name: "Spare", uomId: bag.id });
    const deleted = await deleteMaterial(
      jsonRequest(`${MATERIALS}/${free.id}/delete`, owner.cookie, {}),
      params(free.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const other = await ownerWithCompany();
    const foreign = await getMaterial(
      jsonRequest(`${MATERIALS}/${stocked.id}`, other.cookie),
      params(stocked.id),
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("adds, edits and deletes Terms & Conditions under their own menu", async () => {
    const owner = await ownerWithCompany();
    const created = await createTerms(
      jsonRequest(TERMS, owner.cookie, {
        title: "  Delivery ",
        body: "Deliver to site between 9 am and 6 pm.\nUnload at your cost.",
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const terms = await json<Terms>(created);
    expect(terms).toMatchObject({
      title: "Delivery",
      body: "Deliver to site between 9 am and 6 pm.\nUnload at your cost.",
    });
    const clash = await createTerms(
      jsonRequest(TERMS, owner.cookie, { title: "DELIVERY", body: "x" }),
    );
    expect(await code(clash)).toBe("TERMS_CONDITION_NAME_IN_USE");
    const empty = await createTerms(
      jsonRequest(TERMS, owner.cookie, { title: "Payment", body: " " }),
    );
    expect(await code(empty)).toBe("TERMS_CONDITION_BODY_REQUIRED");
    const updated = await updateTerms(
      jsonRequest(`${TERMS}/${terms.id}/update`, owner.cookie, {
        title: "Delivery terms",
        body: "Door delivery.",
        expectedUpdatedAt: terms.updatedAt,
      }),
      params(terms.id),
    );
    expect(updated.status).toBe(StatusCodes.OK);
    const listed = await page<Terms>(listTerms, `${TERMS}?q=door`, owner.cookie);
    expect(listed.items.map((item) => item.title)).toEqual(["Delivery terms"]);

    const reader = await memberWith(owner, {
      "masters.terms_conditions": ["read"],
      "masters.materials": ["read", "create", "update", "delete"],
    });
    expect((await page<Terms>(listTerms, TERMS, reader.cookie)).total).toBe(1);
    const refused = await deleteTerms(
      jsonRequest(`${TERMS}/${terms.id}/delete`, reader.cookie, {}),
      params(terms.id),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const deleted = await deleteTerms(
      jsonRequest(`${TERMS}/${terms.id}/delete`, owner.cookie, {}),
      params(terms.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const list of [
      "measurement-units",
      "material-categories",
      "materials",
      "terms-conditions",
    ]) {
      const path = `/api/construction/masters/${list}`;
      expect(spec.paths[path]).toHaveProperty("get");
      expect(spec.paths[path]).toHaveProperty("post");
      for (const verb of ["update", "disable", "enable", "delete"])
        expect(spec.paths[`${path}/{id}/${verb}`]).toHaveProperty("post");
    }
    expect(spec.paths["/api/construction/masters/materials/options"]).toHaveProperty(
      "get",
    );
    expect(spec.components.schemas).toHaveProperty(
      "ConstructionMastersMaterialResponse",
    );
  });
});
