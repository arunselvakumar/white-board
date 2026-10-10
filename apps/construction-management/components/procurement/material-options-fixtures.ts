import type { ApiCall } from "../../.storybook/mocks/api";
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
      (search == null || option.name.toLowerCase().includes(search)) &&
      (categoryId == null || option.categoryId === categoryId) &&
      (ids == null || ids.includes(option.id)),
  );
  return Response.json({ items });
}
