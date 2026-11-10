import type { ApiCall } from "../../.storybook/mocks/api";
import type {
  IssueCategoryItem,
  TagItem,
  TrackingMasterList,
} from "@/src/queries/tracking-masters";

/** Story fixtures for Masters → Issue Categories and Tags (CM-801). */

const AT = "2026-10-14T06:30:00.000Z";
const LATER = "2026-10-14T07:00:00.000Z";

let next = 0;

function idOf(): string {
  next += 1;
  return `0199c4a0-0000-7000-8000-0000000d${String(next).padStart(4, "0")}`;
}

export function storyIssueCategory(
  name: string,
  extra: Partial<IssueCategoryItem> = {},
): IssueCategoryItem {
  return {
    id: idOf(),
    name,
    isSeed: true,
    disabled: false,
    inUse: false,
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  };
}

export function storyTag(name: string, extra: Partial<TagItem> = {}): TagItem {
  return {
    id: idOf(),
    name,
    inUse: false,
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  };
}

/** Defaults: one in use, one disabled; and a Company-made one. */
export const STORY_ISSUE_CATEGORIES: IssueCategoryItem[] = [
  storyIssueCategory("Design"),
  storyIssueCategory("Quality", { inUse: true }),
  storyIssueCategory("RFI", { disabled: true }),
  storyIssueCategory("Safety", { inUse: true }),
  storyIssueCategory("Waterproofing", { isSeed: false }),
];

export const STORY_TAGS: TagItem[] = [
  storyTag("Critical path", { inUse: true }),
  storyTag("Monsoon work"),
];

const CODES: Record<TrackingMasterList, { code: string; label: string }> = {
  "issue-categories": { code: "ISSUE_CATEGORY", label: "Issue Category" },
  tags: { code: "TAG", label: "Tag" },
};

function conflict(code: string, message: string): Response {
  return Response.json({ code, message }, { status: 409 });
}

/**
 * An in-memory Issue Categories or Tags API for one story: list (with
 * `can`), create, rename, disable, enable and delete, with the server's
 * 409s for a taken name and a row in use.
 */
type Item = IssueCategoryItem | TagItem;

export function trackingMastersHandler(options: {
  list: TrackingMasterList;
  initial: readonly Item[];
  can?: { create: boolean; update: boolean; delete: boolean };
}): (call: ApiCall) => Response | undefined {
  const base = `/api/construction/masters/${options.list}`;
  const { code, label } = CODES[options.list];
  let items: Item[] = [...options.initial];
  const taken = (name: string, id?: string) =>
    items.some(
      (item) =>
        item.id !== id && item.name.toLowerCase() === name.trim().toLowerCase(),
    );
  const nameTaken = () =>
    conflict(
      `${code}_NAME_IN_USE`,
      `${/^[AEIOU]/.test(label) ? "An" : "A"} ${label} with this name already exists.`,
    );
  return (call) => {
    const path = call.path.split("?")[0] ?? "";
    if (call.method === "GET" && path === base)
      return Response.json({
        items,
        total: items.length,
        can: options.can ?? { create: true, update: true, delete: true },
      });
    const body = (call.body ?? {}) as { name?: string };
    if (call.method === "POST" && path === base) {
      if (taken(body.name ?? "")) return nameTaken();
      const name = (body.name ?? "").trim();
      const created: Item =
        options.list === "tags"
          ? storyTag(name, { updatedAt: LATER })
          : storyIssueCategory(name, { isSeed: false, updatedAt: LATER });
      items = [...items, created];
      return Response.json(created, { status: 201 });
    }
    const [, id, action] =
      /^\/api\/construction\/masters\/[a-z-]+\/([^/]+)\/(\w+)$/.exec(path) ??
      [];
    const current = items.find((item) => item.id === id);
    if (current == null || call.method !== "POST") return undefined;
    const replace = (changed: Item) => {
      items = items.map((item) => (item.id === changed.id ? changed : item));
      return Response.json(changed);
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
        if (current.inUse)
          return conflict(
            `${code}_IN_USE`,
            options.list === "tags"
              ? "Tasks use this Tag, so it cannot be deleted. Take it off those Tasks first."
              : "Issues & Snags use this Issue Category, so it cannot be deleted. Disable it instead.",
          );
        items = items.filter((item) => item.id !== current.id);
        return new Response(null, { status: 204 });
      default:
        return undefined;
    }
  };
}
