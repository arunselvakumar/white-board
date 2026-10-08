import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { LookupEntry } from "../domain/lookup-entry";
import {
  masterChanged,
  masterNameInUse,
  type LookupKind,
  type MasterKind,
} from "../domain/master-kind";
import { Supervisor } from "../domain/supervisor";
import { LookupHandlers } from "./lookup-handlers";
import type {
  LookupStore,
  MasterChange,
  SupervisorStore,
  TeamMemberDirectory,
} from "./ports";
import { SupervisorHandlers } from "./supervisor-handlers";

const WS = "ws_1";
const OWNER = "user_1";

/** A clock that moves one second per call, so every write changes updatedAt. */
function ticking(start = Date.parse("2026-10-08T06:30:00.000Z")) {
  let at = start;
  return () => {
    at += 1000;
    return new Date(at);
  };
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return "none";
}

type Item = LookupEntry | Supervisor;

/** Live rows in memory with the database's name and updatedAt rules. */
class Memory<T extends Item> {
  rows = new Map<string, T>();
  audit: { action: string; entityId: string; before: unknown }[] = [];

  constructor(private readonly kind: (item: T) => MasterKind) {}

  live(workspaceId: string): T[] {
    return [...this.rows.values()]
      .filter((row) => row.workspaceId === workspaceId && row.deletedAt == null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private assertName(item: T) {
    if (item.deletedAt != null) return;
    const clash = this.live(item.workspaceId).some(
      (row) =>
        row.id !== item.id &&
        this.kind(row) === this.kind(item) &&
        row.name.toLowerCase() === item.name.toLowerCase(),
    );
    if (clash) throw masterNameInUse(this.kind(item));
  }

  insert(item: T, change: MasterChange) {
    this.assertName(item);
    this.rows.set(item.id, item);
    this.audit.push({
      action: change.action,
      entityId: item.id,
      before: change.before,
    });
  }

  update(item: T, expected: Date, change: MasterChange, stored: Date) {
    if (stored.getTime() !== expected.getTime())
      throw masterChanged(this.kind(item));
    this.assertName(item);
    this.rows.set(item.id, item);
    this.audit.push({
      action: change.action,
      entityId: item.id,
      before: change.before,
    });
  }
}

function lookupStore(): LookupStore & { memory: Memory<LookupEntry> } {
  const memory = new Memory<LookupEntry>((row) => row.kind);
  /** updatedAt as last written; handlers mutate the loaded copy. */
  const stored = new Map<string, Date>();
  const copy = (row: LookupEntry) =>
    LookupEntry.reconstitute({
      id: row.id,
      kind: row.kind,
      workspaceId: row.workspaceId,
      name: row.name,
      isSeed: row.isSeed,
      disabledAt: row.disabledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
    });
  return {
    memory,
    list: (kind: LookupKind, workspaceId: string) =>
      Promise.resolve(
        memory
          .live(workspaceId)
          .filter((row) => row.kind === kind)
          .map(copy),
      ),
    find: (kind: LookupKind, workspaceId: string, id: string) => {
      const row = memory.rows.get(id);
      return Promise.resolve(
        row?.kind === kind &&
          row.workspaceId === workspaceId &&
          row.deletedAt == null
          ? copy(row)
          : null,
      );
    },
    insert: (entry, change) => {
      memory.insert(entry, change);
      stored.set(entry.id, entry.updatedAt);
      return Promise.resolve();
    },
    update: (entry, expected, change) => {
      memory.update(
        entry,
        expected,
        change,
        stored.get(entry.id) ?? new Date(0),
      );
      stored.set(entry.id, entry.updatedAt);
      return Promise.resolve();
    },
  };
}

function supervisorStore(): SupervisorStore & { memory: Memory<Supervisor> } {
  const memory = new Memory<Supervisor>(() => "supervisor");
  const stored = new Map<string, Date>();
  const copy = (row: Supervisor) =>
    Supervisor.reconstitute({
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      mobile: row.mobile,
      teamMemberId: row.teamMemberId,
      disabledAt: row.disabledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
    });
  return {
    memory,
    list: (workspaceId) => Promise.resolve(memory.live(workspaceId).map(copy)),
    find: (workspaceId, id) => {
      const row = memory.rows.get(id);
      return Promise.resolve(
        row?.workspaceId === workspaceId && row.deletedAt == null
          ? copy(row)
          : null,
      );
    },
    insert: (supervisor, change) => {
      memory.insert(supervisor, change);
      stored.set(supervisor.id, supervisor.updatedAt);
      return Promise.resolve();
    },
    update: (supervisor, expected, change) => {
      memory.update(
        supervisor,
        expected,
        change,
        stored.get(supervisor.id) ?? new Date(0),
      );
      stored.set(supervisor.id, supervisor.updatedAt);
      return Promise.resolve();
    },
  };
}

function seedRow(store: ReturnType<typeof lookupStore>, name: string) {
  const seed = LookupEntry.create({
    id: `seed-${name}`,
    kind: "labour_category",
    workspaceId: WS,
    name,
    isSeed: true,
    by: "system",
    now: new Date("2026-10-01T00:00:00.000Z"),
  });
  void store.insert(seed, {
    action: "seeded",
    before: null,
    by: "system",
    now: seed.createdAt,
  });
  return seed;
}

describe("LookupHandlers", () => {
  it("creates, lists by name with a status filter, renames and audits", async () => {
    const store = lookupStore();
    const handlers = new LookupHandlers("labour_category", store, ticking());
    seedRow(store, "Mason");
    const made = await handlers.create({
      workspaceId: WS,
      name: " Bar Bender ",
      by: OWNER,
    });
    expect(made).toMatchObject({
      name: "Bar Bender",
      isSeed: false,
      disabled: false,
    });

    expect((await handlers.list(WS)).map((item) => item.name)).toEqual([
      "Bar Bender",
      "Mason",
    ]);
    await handlers.disable({ workspaceId: WS, id: made.id, by: OWNER });
    expect(
      (await handlers.list(WS, "enabled")).map((item) => item.name),
    ).toEqual(["Mason"]);
    expect(
      (await handlers.list(WS, "disabled")).map((item) => item.name),
    ).toEqual(["Bar Bender"]);

    const current = await handlers.get(WS, made.id);
    const renamed = await handlers.rename({
      workspaceId: WS,
      id: made.id,
      name: "Steel Fixer",
      expectedUpdatedAt: current.updatedAt,
      by: OWNER,
    });
    expect(renamed).toMatchObject({ name: "Steel Fixer", disabled: true });
    expect(store.memory.audit.map((item) => item.action)).toEqual([
      "seeded",
      "labour_category.created",
      "labour_category.disabled",
      "labour_category.updated",
    ]);
    expect(store.memory.audit.at(-1)?.before).toEqual({
      name: "Bar Bender",
      isSeed: false,
      disabled: true,
    });
  });

  it("refuses a name in use, any case", async () => {
    const store = lookupStore();
    const handlers = new LookupHandlers("labour_category", store, ticking());
    seedRow(store, "Mason");
    expect(
      await codeOf(() =>
        handlers.create({ workspaceId: WS, name: "MASON", by: OWNER }),
      ),
    ).toBe("LABOUR_CATEGORY_NAME_IN_USE");
  });

  it("is 409 CHANGED for a stale expectedUpdatedAt", async () => {
    const store = lookupStore();
    const handlers = new LookupHandlers("department", store, ticking());
    const made = await handlers.create({
      workspaceId: WS,
      name: "Fencing",
      by: OWNER,
    });
    await handlers.rename({
      workspaceId: WS,
      id: made.id,
      name: "Fencing Work",
      expectedUpdatedAt: made.updatedAt,
      by: OWNER,
    });
    expect(
      await codeOf(() =>
        handlers.rename({
          workspaceId: WS,
          id: made.id,
          name: "Fence",
          expectedUpdatedAt: made.updatedAt,
          by: OWNER,
        }),
      ),
    ).toBe("DEPARTMENT_CHANGED");
  });

  it("keeps seed rows read-only but lets them be disabled", async () => {
    const store = lookupStore();
    const handlers = new LookupHandlers("labour_category", store, ticking());
    const seed = seedRow(store, "Mason");
    expect(
      await codeOf(() =>
        handlers.rename({
          workspaceId: WS,
          id: seed.id,
          name: "Brick Mason",
          expectedUpdatedAt: seed.updatedAt,
          by: OWNER,
        }),
      ),
    ).toBe("SEED_IS_READ_ONLY");
    expect(
      await codeOf(() =>
        handlers.delete({ workspaceId: WS, id: seed.id, by: OWNER }),
      ),
    ).toBe("SEED_IS_READ_ONLY");
    expect(
      await handlers.disable({ workspaceId: WS, id: seed.id, by: OWNER }),
    ).toMatchObject({
      disabled: true,
    });
    expect(
      await handlers.enable({ workspaceId: WS, id: seed.id, by: OWNER }),
    ).toMatchObject({
      disabled: false,
    });
  });

  it("deletes unless something uses it, then frees the name", async () => {
    const store = lookupStore();
    const used = new Set<string>();
    const handlers = new LookupHandlers(
      "labour_category",
      store,
      ticking(),
      (kind, _workspaceId, id) =>
        Promise.resolve(kind === "labour_category" && used.has(id)),
    );
    const made = await handlers.create({
      workspaceId: WS,
      name: "Painter",
      by: OWNER,
    });
    used.add(made.id);
    expect(
      await codeOf(() =>
        handlers.delete({ workspaceId: WS, id: made.id, by: OWNER }),
      ),
    ).toBe("LABOUR_CATEGORY_IN_USE");
    used.clear();
    await handlers.delete({ workspaceId: WS, id: made.id, by: OWNER });
    expect(await codeOf(() => handlers.get(WS, made.id))).toBe(
      "LABOUR_CATEGORY_NOT_FOUND",
    );
    expect(store.memory.rows.get(made.id)?.deletedBy).toBe(OWNER);
    await handlers.create({ workspaceId: WS, name: "Painter", by: OWNER });
  });

  it("does not show another Company's rows", async () => {
    const store = lookupStore();
    const handlers = new LookupHandlers("department", store, ticking());
    const theirs = await handlers.create({
      workspaceId: "ws_2",
      name: "RCC",
      by: OWNER,
    });
    expect(await handlers.list(WS)).toEqual([]);
    expect(await codeOf(() => handlers.get(WS, theirs.id))).toBe(
      "DEPARTMENT_NOT_FOUND",
    );
  });
});

describe("SupervisorHandlers", () => {
  const MEMBER = "0199a1b2-0000-7000-8000-0000000000aa";
  const directory: TeamMemberDirectory = {
    namesOf: (workspaceId, ids) =>
      Promise.resolve(
        new Map(
          workspaceId === WS && ids.includes(MEMBER)
            ? [[MEMBER, "Suresh Kale"]]
            : [],
        ),
      ),
  };

  it("creates with a Team Member and shows their name", async () => {
    const handlers = new SupervisorHandlers(
      supervisorStore(),
      directory,
      ticking(),
    );
    const made = await handlers.create({
      workspaceId: WS,
      name: "Suresh",
      mobile: "9876543210",
      teamMemberId: MEMBER,
      by: OWNER,
    });
    expect(made).toMatchObject({
      name: "Suresh",
      mobile: "+919876543210",
      teamMemberId: MEMBER,
      teamMemberName: "Suresh Kale",
      disabled: false,
    });
    expect(await handlers.list(WS)).toEqual([made]);
  });

  it("refuses a Team Member of another Company", async () => {
    const handlers = new SupervisorHandlers(
      supervisorStore(),
      directory,
      ticking(),
    );
    expect(
      await codeOf(() =>
        handlers.create({
          workspaceId: WS,
          name: "Raju",
          teamMemberId: "0199a1b2-0000-7000-8000-0000000000bb",
          by: OWNER,
        }),
      ),
    ).toBe("SUPERVISOR_TEAM_MEMBER_NOT_FOUND");
  });

  it("updates with optimistic concurrency, toggles and deletes unless used", async () => {
    const store = supervisorStore();
    let used = true;
    const handlers = new SupervisorHandlers(store, directory, ticking(), () =>
      Promise.resolve(used),
    );
    const made = await handlers.create({
      workspaceId: WS,
      name: "Raju",
      by: OWNER,
    });
    const updated = await handlers.update({
      workspaceId: WS,
      id: made.id,
      name: "Raju Mukadam",
      mobile: "+919876543210",
      teamMemberId: null,
      expectedUpdatedAt: made.updatedAt,
      by: OWNER,
    });
    expect(updated).toMatchObject({
      name: "Raju Mukadam",
      mobile: "+919876543210",
    });
    expect(
      await codeOf(() =>
        handlers.update({
          workspaceId: WS,
          id: made.id,
          name: "Stale",
          expectedUpdatedAt: made.updatedAt,
          by: OWNER,
        }),
      ),
    ).toBe("SUPERVISOR_CHANGED");
    expect(
      (await handlers.disable({ workspaceId: WS, id: made.id, by: OWNER }))
        .disabled,
    ).toBe(true);
    expect(
      (await handlers.enable({ workspaceId: WS, id: made.id, by: OWNER }))
        .disabled,
    ).toBe(false);
    expect(
      await codeOf(() =>
        handlers.delete({ workspaceId: WS, id: made.id, by: OWNER }),
      ),
    ).toBe("SUPERVISOR_IN_USE");
    used = false;
    await handlers.delete({ workspaceId: WS, id: made.id, by: OWNER });
    expect(await handlers.list(WS)).toEqual([]);
    expect(store.memory.audit.map((item) => item.action)).toEqual([
      "supervisor.created",
      "supervisor.updated",
      "supervisor.disabled",
      "supervisor.enabled",
      "supervisor.deleted",
    ]);
  });
});
