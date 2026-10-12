import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import {
  otherPartyDetails,
  type OtherPartyDetails,
  type OtherPartyInput,
} from "../domain/other-party";

const MENU = "masters.other_parties";

/** A live Other Party as stored. */
export type StoredOtherParty = OtherPartyDetails & {
  id: string;
  workspaceId: string;
  projectIds: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type OtherPartyListParams = {
  workspaceId: string;
  /** Name, mobile, email or GSTIN. */
  search?: string;
  /** Only those on this Project. */
  projectId?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type OtherPartyReadModel = StoredOtherParty & {
  /** Live Projects, by name. */
  projects: { id: string; name: string }[];
};

/**
 * Where Other Parties live (Prisma in infrastructure). Writes run in one
 * transaction with their audit event.
 */
export type OtherPartyStore = {
  find(workspaceId: string, id: string): Promise<StoredOtherParty | null>;
  /** Newest first (root ADR-0020). */
  list(params: OtherPartyListParams): Promise<{
    items: StoredOtherParty[];
    total: number;
    hasMore: boolean;
  }>;
  /** Live Projects of the Company by id, with their names. */
  projectNames(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
  /** 409 `OTHER_PARTY_NAME_TAKEN` when a live one has the name (any case). */
  insert(party: StoredOtherParty): Promise<void>;
  /**
   * Replaces the details and Projects when `updatedAt` is still
   * `expectedUpdatedAt` (else 409 `OTHER_PARTY_CHANGED`); 409
   * `OTHER_PARTY_NAME_TAKEN` as on insert.
   */
  update(input: {
    before: StoredOtherParty;
    after: StoredOtherParty;
    expectedUpdatedAt: Date;
  }): Promise<void>;
  /**
   * Tombstones it unless an invoice, party payment, party opening or party
   * entry names it (409 `OTHER_PARTY_IN_USE`), checked under a lock.
   */
  delete(input: {
    party: StoredOtherParty;
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void>;
};

export const otherPartyNotFound = () =>
  notFound("OTHER_PARTY_NOT_FOUND", "This Other Party was not found.");

export const otherPartyNameTaken = (name: string) =>
  conflict(
    "OTHER_PARTY_NAME_TAKEN",
    `An Other Party named “${name}” already exists.`,
    { field: "name" },
  );

export const otherPartyChanged = () =>
  conflict(
    "OTHER_PARTY_CHANGED",
    "Someone changed this Other Party after you opened it. Reload to see the latest.",
  );

export const otherPartyInUse = () =>
  conflict(
    "OTHER_PARTY_IN_USE",
    "This Other Party has invoices, payments or an opening balance, so it cannot be deleted.",
  );

export type OtherPartyCommand = OtherPartyInput & {
  projectIds?: readonly string[];
};

/**
 * Masters → Other Party (CM-704, ADR CM-0017 §11; menu
 * `masters.other_parties`, C R U D). Names are unique among live Other
 * Parties ignoring case. Labels on Transactions and vouchers keep their
 * own copy of the name, so they never block a delete.
 */
export class OtherPartyHandlers {
  constructor(
    private readonly store: OtherPartyStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string) {
    const party = await this.store.find(workspaceId, id);
    if (party == null) throw otherPartyNotFound();
    return party;
  }

  private async readModels(
    workspaceId: string,
    parties: readonly StoredOtherParty[],
  ): Promise<OtherPartyReadModel[]> {
    const names = await this.store.projectNames(
      workspaceId,
      parties.flatMap((party) => party.projectIds),
    );
    return parties.map((party) => ({
      ...party,
      projects: party.projectIds.flatMap((id) => {
        const name = names.get(id);
        return name == null ? [] : [{ id, name }];
      }),
    }));
  }

  async get(access: MemberAccess, id: string): Promise<OtherPartyReadModel> {
    assertCan(access, MENU, "read");
    const [model] = await this.readModels(access.workspaceId, [
      await this.load(access.workspaceId, id),
    ]);
    if (model == null) throw otherPartyNotFound();
    return model;
  }

  async list(
    access: MemberAccess,
    params: Omit<OtherPartyListParams, "workspaceId">,
  ) {
    assertCan(access, MENU, "read");
    const page = await this.store.list({
      ...params,
      workspaceId: access.workspaceId,
    });
    return {
      ...page,
      items: await this.readModels(access.workspaceId, page.items),
    };
  }

  /** Live Projects of the Company, each once (400 `PROJECT_NOT_FOUND`). */
  private async projects(
    workspaceId: string,
    ids: readonly string[] | undefined,
  ): Promise<string[]> {
    const unique = [...new Set(ids ?? [])];
    const names = await this.store.projectNames(workspaceId, unique);
    const missing = unique.find((id) => !names.has(id));
    if (missing != null)
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "One of the Projects was not found. Reload and choose again.",
        { details: { field: "projectIds", projectId: missing } },
      );
    return unique;
  }

  async create(
    access: MemberAccess,
    input: OtherPartyCommand,
  ): Promise<OtherPartyReadModel> {
    assertCan(access, MENU, "create");
    const details = otherPartyDetails(input);
    const projectIds = await this.projects(
      access.workspaceId,
      input.projectIds,
    );
    const now = this.clock();
    const party: StoredOtherParty = {
      ...details,
      id: newId(now.getTime()),
      workspaceId: access.workspaceId,
      projectIds,
      createdAt: now,
      updatedAt: now,
      createdBy: access.userId,
      updatedBy: access.userId,
    };
    await this.store.insert(party);
    return this.get(access, party.id);
  }

  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: OtherPartyCommand,
  ): Promise<OtherPartyReadModel> {
    assertCan(access, MENU, "update");
    const before = await this.load(access.workspaceId, id);
    const details = otherPartyDetails(input);
    const projectIds = await this.projects(
      access.workspaceId,
      input.projectIds,
    );
    const now = this.clock();
    await this.store.update({
      before,
      after: {
        ...before,
        ...details,
        projectIds,
        updatedAt: now,
        updatedBy: access.userId,
      },
      expectedUpdatedAt,
    });
    return this.get(access, id);
  }

  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    assertCan(access, MENU, "delete");
    const party = await this.load(access.workspaceId, id);
    await this.store.delete({
      party,
      expectedUpdatedAt,
      by: access.userId,
      now: this.clock(),
    });
  }
}
