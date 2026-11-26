import { createStockHandlers } from "@/src/preschool/infrastructure/create-stock-handlers";

/** One set of stock handlers for every stock route. */
export const stock = createStockHandlers();

export type ChildIdContext = { params: Promise<{ childId: string }> };

export function searchParams(request: Request, names: readonly string[]) {
  const url = new URL(request.url);
  return Object.fromEntries(
    names.map((name) => [name, url.searchParams.get(name) ?? undefined]),
  );
}
