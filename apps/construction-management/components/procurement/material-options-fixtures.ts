import type { ApiCall } from "../../.storybook/mocks/api";
import type {
  MaterialCategoryItem,
  MaterialInput,
  MaterialItem,
  MeasurementUnitItem,
} from "@/src/queries/material-masters";
import type { MaterialOption } from "@/src/queries/material-options";
import { MATERIAL_OPTIONS_API } from "@/src/queries/material-options";

/** Materials a South Indian site buys, for procurement stories (M5). */
export const MATERIAL_OPTIONS: MaterialOption[] = [
  {
    id: "0199c4a0-0000-7000-8000-00000000a001",
    name: "Cement OPC 53 Grade",
    specification: "UltraTech, 50 kg bag",
    uomId: "0199c4a0-0000-7000-8000-00000000b001",
    uomName: "Bag",
    categoryId: "0199c4a0-0000-7000-8000-00000000c001",
    categoryName: "Civil Work Materials",
    unitRate: 38_500,
    discount: null,
    gstRate: "28.00",
    hsnCode: "2523",
    minStockQty: "50.000",
  },
  {
    id: "0199c4a0-0000-7000-8000-00000000a002",
    name: "TMT Steel Bar 12 mm",
    specification: "Fe 550D",
    uomId: "0199c4a0-0000-7000-8000-00000000b002",
    uomName: "kg",
    categoryId: "0199c4a0-0000-7000-8000-00000000c001",
    categoryName: "Civil Work Materials",
    unitRate: 6_250,
    discount: { type: "percent", percent: "2.00" },
    gstRate: "18.00",
    hsnCode: "7214",
    minStockQty: "500.000",
  },
  {
    id: "0199c4a0-0000-7000-8000-00000000a003",
    name: "M Sand",
    specification: null,
    uomId: "0199c4a0-0000-7000-8000-00000000b003",
    uomName: "cum",
    categoryId: "0199c4a0-0000-7000-8000-00000000c001",
    categoryName: "Civil Work Materials",
    unitRate: 145_000,
    discount: null,
    gstRate: "5.00",
    hsnCode: "2505",
    minStockQty: null,
  },
  {
    id: "0199c4a0-0000-7000-8000-00000000a004",
    name: "Asian Paints Apex Exterior Emulsion",
    specification: "20 L",
    uomId: "0199c4a0-0000-7000-8000-00000000b004",
    uomName: "Litre",
    categoryId: "0199c4a0-0000-7000-8000-00000000c002",
    categoryName: "Colour & Paints",
    unitRate: 42_000,
    discount: { type: "amount", paise: 10_000 },
    gstRate: "18.00",
    hsnCode: "3209",
    minStockQty: null,
  },
];

/**
 * Answers the material picker's read in a story's `mockApi` handler:
 * `mockApi((call) => materialOptionsHandler(call) ?? mine(call))`.
 */
export function materialOptionsHandler(
  call: ApiCall,
  options: readonly MaterialOption[] = MATERIAL_OPTIONS,
): Response | undefined {
  if (call.method !== "GET" || !call.path.startsWith(MATERIAL_OPTIONS_API))
    return undefined;
  const query = new URL(call.path, "http://storybook.local").searchParams;
  const search = query.get("search")?.toLowerCase();
  const categoryId = query.get("categoryId");
  const ids = query.get("ids")?.split(",");
  const items = options.filter(
    (option) =>
      (search == null ||
        option.name.toLowerCase().includes(search) ||
        (option.specification?.toLowerCase().includes(search) ?? false)) &&
      (categoryId == null || option.categoryId === categoryId) &&
      (ids == null || ids.includes(option.id)),
  );
  return Response.json({ items });
}

const AT = "2026-10-08T06:30:00.000Z";

function unit(n: number, name: string): MeasurementUnitItem {
  return {
    id: `0199c4a0-0000-7000-8000-00000000b00${String(n)}`,
    name,
    isSeed: true,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
  };
}

/** Enabled Measurement Units for the picker's Create New dialog. */
export const UNIT_OPTIONS: MeasurementUnitItem[] = [
  unit(1, "Bag"),
  unit(2, "kg"),
  unit(3, "cum"),
  unit(4, "Litre"),
  unit(5, "Nos"),
];

function category(
  n: number,
  name: string,
  parent: MaterialCategoryItem | null = null,
): MaterialCategoryItem {
  return {
    id: `0199c4a0-0000-7000-8000-00000000c00${String(n)}`,
    name,
    parentId: parent?.id ?? null,
    parentName: parent?.name ?? null,
    childCount: 0,
    isSeed: parent == null,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
  };
}

const CIVIL = category(1, "Civil Work Materials");

/** Enabled Material Categories for the Create New dialog. */
export const CATEGORY_OPTIONS: MaterialCategoryItem[] = [
  { ...CIVIL, childCount: 1 },
  category(2, "Colour & Paints"),
  category(3, "Bricks & Blocks", CIVIL),
];

const MASTERS = "/api/construction/masters";

function page(items: readonly unknown[]) {
  return Response.json({
    items,
    nextCursor: null,
    prevCursor: null,
    total: items.length,
  });
}

/** The id a Material created in a story gets. */
export const CREATED_MATERIAL_ID = "0199c4a0-0000-7000-8000-00000000a0ff";

/** The Material the API returns for a create body (no Rate Details). */
export function createdMaterial(input: MaterialInput): MaterialItem {
  const uom = UNIT_OPTIONS.find((item) => item.id === input.uomId);
  const categoryRow = CATEGORY_OPTIONS.find(
    (item) => item.id === input.categoryId,
  );
  return {
    id: CREATED_MATERIAL_ID,
    name: input.name.trim(),
    specification: input.specification ?? null,
    uomId: input.uomId,
    uomName: uom?.name ?? "Nos",
    categoryId: categoryRow?.id ?? null,
    categoryName: categoryRow?.name ?? null,
    itemType: input.itemType ?? "consumable",
    unitRate: null,
    discount: null,
    gstRate: null,
    hsnCode: null,
    minStockQty: null,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
  };
}

export type MaterialCreateOptions = {
  /** Names already in use (409 MATERIAL_NAME_IN_USE), ignoring case. */
  taken?: readonly string[];
  /** The caller lacks Materials Create (403 PERMISSION_DENIED). */
  forbidden?: boolean;
  units?: readonly MeasurementUnitItem[];
  categories?: readonly MaterialCategoryItem[];
};

/**
 * Answers the picker's Create New dialog: enabled units and categories,
 * and `POST /api/construction/masters/materials` (201 with the Material).
 * Chain it like `materialOptionsHandler`.
 */
export function materialCreateHandler(
  call: ApiCall,
  options: MaterialCreateOptions = {},
): Response | undefined {
  const path = new URL(call.path, "http://storybook.local").pathname;
  if (call.method === "GET" && path === `${MASTERS}/measurement-units`)
    return page(options.units ?? UNIT_OPTIONS);
  if (call.method === "GET" && path === `${MASTERS}/material-categories`)
    return page(options.categories ?? CATEGORY_OPTIONS);
  if (call.method !== "POST" || path !== `${MASTERS}/materials`)
    return undefined;
  if (options.forbidden === true)
    return Response.json(
      {
        code: "PERMISSION_DENIED",
        message: "You do not have permission to add Materials.",
      },
      { status: 403 },
    );
  const input = call.body as MaterialInput;
  const name = input.name.trim().toLowerCase();
  if ((options.taken ?? []).some((taken) => taken.toLowerCase() === name))
    return Response.json(
      {
        code: "MATERIAL_NAME_IN_USE",
        message: "A Material with this name already exists.",
      },
      { status: 409 },
    );
  return Response.json(createdMaterial(input), { status: 201 });
}
