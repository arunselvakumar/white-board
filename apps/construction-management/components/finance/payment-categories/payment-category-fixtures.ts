import type { ApiCall } from "../../../.storybook/mocks/api";
import { FINANCE_ACCESS_MENUS } from "@/app/api/construction/finance/access/access-models";
import type { PaymentCategoryItem } from "@/src/queries/finance-payment-categories";
import type { Flag } from "@/src/shared-kernel/access";

/** Story fixtures for Masters → Payment Categories (CM-704). */

const AT = "2026-10-08T06:30:00.000Z";
const LATER = "2026-10-08T07:00:00.000Z";

const BASE = "/api/construction/finance/payment-categories";

function category(
  n: number,
  name: string,
  extra: Partial<PaymentCategoryItem> = {},
): PaymentCategoryItem {
  return {
    id: `0199a1b2-0000-7000-8000-0000000007${String(n).padStart(2, "0")}`,
    name,
    isSeed: false,
    disabled: false,
    inUse: false,
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  };
}

export const STORY_PAYMENT_CATEGORIES: PaymentCategoryItem[] = [
  category(1, "Conveyance", { isSeed: true, inUse: true }),
  category(2, "Fuel", { isSeed: true }),
  category(3, "Marketing and Advertising", { isSeed: true, disabled: true }),
  category(4, "Cement testing", { inUse: true }),
  category(5, "Drinking water"),
];

const ALL_FLAGS: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "reject",
  "print",
  "report",
  "view_all",
  "notification",
];

/**
 * `/api/construction/finance/access` for stories: every finance menu with
 * the flags given (all of them by default), the rest with none.
 */
export function financeAccessHandler(
  menus: Partial<Record<(typeof FINANCE_ACCESS_MENUS)[number], Flag[]>> = {},
  everything = true,
): (call: ApiCall) => Response | undefined {
  return (call) => {
    if (
      call.method !== "GET" ||
      !call.path.startsWith("/api/construction/finance/access")
    )
      return undefined;
    const projectId = new URL(
      call.path,
      "http://storybook.local",
    ).searchParams.get("projectId");
    return Response.json({
      projectId,
      menus: Object.fromEntries(
        FINANCE_ACCESS_MENUS.map((menu) => [
          menu,
          menus[menu] ?? (everything ? ALL_FLAGS : []),
        ]),
      ),
    });
  };
}

function conflict(code: string, message: string): Response {
  return Response.json({ code, message }, { status: 409 });
}

/**
 * An in-memory Payment Categories API for one story: list, create, rename,
 * disable, enable and delete, with the server's 409s for a taken name, a
 * seed and a category in use.
 */
export function paymentCategoriesHandler(
  options: { initial?: PaymentCategoryItem[] } = {},
): (call: ApiCall) => Response | undefined {
  let items = [...(options.initial ?? STORY_PAYMENT_CATEGORIES)];
  const taken = (name: string, id?: string) =>
    items.some(
      (item) =>
        item.id !== id && item.name.toLowerCase() === name.trim().toLowerCase(),
    );
  const nameTaken = () =>
    conflict(
      "PAYMENT_CATEGORY_NAME_TAKEN",
      "A Payment Category with this name already exists.",
    );
  return (call) => {
    const path = call.path.split("?")[0] ?? "";
    if (call.method === "GET" && path === BASE)
      return Response.json({ items, total: items.length });
    const body = (call.body ?? {}) as { name?: string };
    if (call.method === "POST" && path === BASE) {
      if (taken(body.name ?? "")) return nameTaken();
      const created = category(90 + items.length, (body.name ?? "").trim(), {
        updatedAt: LATER,
      });
      items = [...items, created];
      return Response.json(created, { status: 201 });
    }
    const [, id, action] =
      /^\/api\/construction\/finance\/payment-categories\/([^/]+)\/(\w+)$/.exec(
        path,
      ) ?? [];
    const current = items.find((item) => item.id === id);
    if (current == null || call.method !== "POST") return undefined;
    const replace = (next: PaymentCategoryItem) => {
      items = items.map((item) => (item.id === next.id ? next : item));
      return Response.json(next);
    };
    switch (action) {
      case "update":
        if (taken(body.name ?? "", current.id)) return nameTaken();
        return replace({
          ...current,
          name: (body.name ?? "").trim(),
          updatedAt: LATER,
        });
      case "disable":
      case "enable":
        return replace({
          ...current,
          disabled: action === "disable",
          updatedAt: LATER,
        });
      case "delete":
        if (current.isSeed)
          return conflict(
            "PAYMENT_CATEGORY_SEED",
            "This Payment Category came with the app, so it cannot be deleted. Disable it instead.",
          );
        if (current.inUse)
          return conflict(
            "PAYMENT_CATEGORY_IN_USE",
            "Payments, vouchers or expenses use this Payment Category, so it cannot be deleted. Disable it instead.",
          );
        items = items.filter((item) => item.id !== current.id);
        return new Response(null, { status: 204 });
      default:
        return undefined;
    }
  };
}
