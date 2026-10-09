import { expect, waitFor, within } from "storybook/test";

import { fakeApi } from "@/components/designations/designation-story-support";
import type { LookupItem, SupervisorItem } from "@/src/queries/masters";

/** Story-only fixtures and an in-memory masters API. */

const AT = "2026-10-08T06:30:00.000Z";

function lookup(n: number, name: string, extra: Partial<LookupItem> = {}) {
  return {
    id: `0199a1b2-0000-7000-8000-0000000003${String(n).padStart(2, "0")}`,
    name,
    isSeed: true,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  } satisfies LookupItem;
}

export const STORY_LABOUR_CATEGORIES: LookupItem[] = [
  lookup(1, "Carpenter"),
  lookup(2, "Electrician", { disabled: true }),
  lookup(3, "Helper"),
  lookup(4, "Mason"),
  lookup(5, "Bar Bender", { isSeed: false }),
  lookup(6, "Painter", { isSeed: false }),
];

export const STORY_DEPARTMENTS: LookupItem[] = [
  lookup(11, "Masonry & Plaster"),
  lookup(12, "Plumbing"),
  lookup(13, "RCC"),
  lookup(14, "Fencing", { isSeed: false }),
];

export const STORY_TEAM_MEMBER_ID = "0199a1b2-0000-7000-8000-0000000004aa";

export const STORY_SUPERVISORS: SupervisorItem[] = [
  {
    id: "0199a1b2-0000-7000-8000-000000000401",
    name: "Rakesh Mirtha",
    mobile: "+917708165767",
    teamMemberId: null,
    teamMemberName: null,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: "0199a1b2-0000-7000-8000-000000000402",
    name: "Prabhu Saravanan",
    mobile: null,
    teamMemberId: STORY_TEAM_MEMBER_ID,
    teamMemberName: "Prabhu Saravanan",
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: "0199a1b2-0000-7000-8000-000000000403",
    name: "Vignesh Anand",
    mobile: null,
    teamMemberId: null,
    teamMemberName: null,
    disabled: true,
    createdAt: AT,
    updatedAt: AT,
  },
];

const LATER = "2026-10-08T07:00:00.000Z";

function conflict(code: string, message: string): Response {
  return Response.json({ code, message }, { status: 409 });
}

/**
 * An in-memory masters API over one list: list, create, update, disable,
 * enable, delete, with the server's 409s for a taken name, a seed row, and
 * rows named in `inUse`.
 */
export function serveMasters<T extends { id: string; name: string }>(input: {
  base: string;
  code: string;
  initial: T[];
  /** Names that labourers use, so delete is refused. */
  inUse?: string[];
  /** Turns a create/update body into a row. */
  build?: (body: Record<string, unknown>, current: T | null) => T;
  teamMembers?: { id: string; name: string }[] | "forbidden";
}) {
  let items = [...input.initial];
  const isSeed = (item: T) => (item as { isSeed?: boolean }).isSeed === true;
  const nameTaken = (name: string, id?: string) =>
    items.some(
      (item) =>
        item.id !== id && item.name.toLowerCase() === name.trim().toLowerCase(),
    );
  const build =
    input.build ??
    ((body: Record<string, unknown>, current: T | null) =>
      ({
        ...(current ?? {
          id: "0199a1b2-0000-7000-8000-0000000005ff",
          isSeed: false,
          disabled: false,
          createdAt: AT,
        }),
        name: String(body["name"]).trim(),
        updatedAt: LATER,
      }) as unknown as T);

  const api = fakeApi(({ url, method, body }) => {
    if (url === "/api/construction/organization/team-members") {
      if (input.teamMembers === "forbidden")
        return Response.json(
          { code: "PERMISSION_DENIED", message: "No." },
          { status: 403 },
        );
      const members = input.teamMembers ?? [];
      return Response.json({
        items: members,
        total: members.length,
        nextCursor: null,
        prevCursor: null,
      });
    }
    if (method === "GET" && url === input.base)
      return Response.json({ items, total: items.length });
    const fields = (body ?? {}) as Record<string, unknown>;
    if (method === "POST" && url === input.base) {
      if (nameTaken(String(fields["name"])))
        return conflict(
          `${input.code}_NAME_IN_USE`,
          "A row with this name already exists.",
        );
      const created = build(fields, null);
      items = [...items, created];
      return Response.json(created, { status: 201 });
    }
    const escaped = input.base.replace(/[/]/g, "\\/");
    const [, id, action] =
      new RegExp(`^${escaped}\\/([^/]+)\\/(\\w+)$`).exec(url) ?? [];
    const current = items.find((item) => item.id === id);
    if (current == null) return undefined;
    const replace = (next: T) => {
      items = items.map((item) => (item.id === next.id ? next : item));
      return Response.json(next);
    };
    switch (action) {
      case "update":
        if (nameTaken(String(fields["name"]), current.id))
          return conflict(
            `${input.code}_NAME_IN_USE`,
            "A row with this name already exists.",
          );
        return replace(build(fields, current));
      case "disable":
      case "enable":
        return replace({
          ...current,
          disabled: action === "disable",
          updatedAt: LATER,
        });
      case "delete":
        if (isSeed(current))
          return conflict("SEED_IS_READ_ONLY", "This came with the app.");
        if (input.inUse?.includes(current.name) === true)
          return conflict(
            `${input.code}_IN_USE`,
            "Labours, Vendors or attendance use this, so it cannot be deleted. Disable it instead.",
          );
        items = items.filter((item) => item.id !== current.id);
        return new Response(null, { status: 204 });
      default:
        return undefined;
    }
  });
  return api;
}

/**
 * Opens a row's menu and picks an item once the menu has finished opening,
 * then waits for it to close (menus animate; clicks during that are refused).
 */
export async function chooseFromMenu(
  canvasElement: HTMLElement,
  userEvent: { click: (element: Element) => Promise<void> },
  rowName: string,
  itemName: string,
): Promise<void> {
  const body = within(canvasElement.ownerDocument.body);
  const trigger = await within(canvasElement).findByRole("button", {
    name: `Actions for ${rowName}`,
  });
  await waitFor(() => expect(trigger).toBeEnabled());
  await userEvent.click(trigger);
  const item = await body.findByRole("menuitem", { name: itemName });
  await waitFor(() => expect(item).toBeVisible());
  await userEvent.click(item);
  await waitFor(() => expect(body.queryByRole("menu")).toBeNull());
}
