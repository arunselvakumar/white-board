import { isIsoDate, todayInIndia, type IsoDate } from "../domain/dates";
import { conflict, forbidden, invalid, notFound } from "../domain/errors";
import { domainName, observation } from "../domain/progress";
import {
  assertRole,
  isManager,
  STAFF_ROLES,
  type PreschoolActor,
} from "./access";
import { openClassroom, readableChild } from "./attendance-access";
import { decodeCursor, pageFrom } from "./list-cursor";
import type { ObservationRecord, ObservationStore } from "./observation-ports";
import type {
  DevelopmentDomainView,
  ObservationPageView,
  ObservationView,
} from "./observation-views";

export type ObservationInput = {
  childId: string;
  domainId: string;
  /** Today in India when left out. */
  observedOn?: IsoDate;
  note: string;
};

export type ListObservationsInput = {
  childId?: string;
  classroomId?: string;
  domainId?: string;
  from?: IsoDate;
  to?: IsoDate;
  limit?: number;
  cursor?: string;
};

export type DomainInput = { name: string; description?: string | null };

export const OBSERVATION_PAGE_SIZE = 30;

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function observationNotFound() {
  return notFound("OBSERVATION_NOT_FOUND", "Observation not found.");
}

function domainNotFound() {
  return notFound("DOMAIN_NOT_FOUND", "Development Domain not found.");
}

/** Its author, or a manager of the Child's Centre. */
export function canEditObservation(
  actor: PreschoolActor,
  record: Pick<ObservationRecord, "centreId" | "createdByUserId">,
): boolean {
  if (record.createdByUserId === actor.userId) return true;
  return isManager(actor) && actor.centreIds.includes(record.centreId);
}

/** Development Domains (the Owner keeps the list) and Observations on Children. */
export class ObservationHandlers {
  constructor(
    private readonly deps: {
      store: ObservationStore;
      now: () => Date;
      newId?: () => string;
    },
  ) {}

  private id(): string {
    return (this.deps.newId ?? (() => crypto.randomUUID()))();
  }

  private today(): IsoDate {
    return todayInIndia(this.deps.now());
  }

  private view(
    actor: PreschoolActor,
    record: ObservationRecord,
  ): ObservationView {
    const { centreId: _centreId, ...rest } = record;
    return { ...rest, canEdit: canEditObservation(actor, record) };
  }

  domains(
    actor: PreschoolActor,
    includeArchived = false,
  ): Promise<DevelopmentDomainView[]> {
    assertRole(actor, STAFF_ROLES);
    return this.deps.store.domains(
      actor.workspaceId,
      includeArchived && actor.role === "owner",
    );
  }

  async createDomain(
    actor: PreschoolActor,
    input: DomainInput,
  ): Promise<DevelopmentDomainView> {
    this.assertOwner(actor);
    const name = domainName(input.name);
    await this.assertNameFree(actor, name, null);
    const id = this.id();
    await this.deps.store.insertDomain({
      id,
      workspaceId: actor.workspaceId,
      name,
      description: textOrNull(input.description),
    });
    return this.domainOf(actor, id);
  }

  async updateDomain(
    actor: PreschoolActor,
    id: string,
    input: DomainInput,
  ): Promise<DevelopmentDomainView> {
    this.assertOwner(actor);
    await this.domainOf(actor, id);
    const name = domainName(input.name);
    await this.assertNameFree(actor, name, id);
    await this.deps.store.updateDomain(id, {
      name,
      description: textOrNull(input.description),
    });
    return this.domainOf(actor, id);
  }

  /** Archived Domains leave the Observation and report forms; their history stays. */
  async setDomainArchived(
    actor: PreschoolActor,
    id: string,
    archived: boolean,
  ): Promise<DevelopmentDomainView> {
    this.assertOwner(actor);
    const domain = await this.domainOf(actor, id);
    if (domain.archived === archived)
      throw conflict(
        archived ? "DOMAIN_ALREADY_ARCHIVED" : "DOMAIN_NOT_ARCHIVED",
        archived
          ? "This Development Domain is already archived."
          : "This Development Domain is in use.",
      );
    if (!archived) await this.assertNameFree(actor, domain.name, id);
    await this.deps.store.setDomainArchived(
      id,
      archived ? this.deps.now() : null,
    );
    return this.domainOf(actor, id);
  }

  async list(
    actor: PreschoolActor,
    input: ListObservationsInput,
  ): Promise<ObservationPageView> {
    if ((input.childId == null) === (input.classroomId == null))
      throw invalid(
        "OBSERVATION_FILTER_REQUIRED",
        "Ask for one Child's or one Classroom's Observations.",
      );
    const { store } = this.deps;
    let childIds: string[];
    if (input.childId != null) {
      await readableChild(store, actor, input.childId, this.today());
      childIds = [input.childId];
    } else {
      const classroom = await openClassroom(
        store,
        actor,
        input.classroomId ?? "",
      );
      const roster = await store.roster(classroom.id, this.today());
      childIds = roster.map((child) => child.childId);
    }
    const limit = input.limit ?? OBSERVATION_PAGE_SIZE;
    const { rows, total } = await store.observations({
      workspaceId: actor.workspaceId,
      childIds,
      domainId: input.domainId ?? null,
      from: input.from ?? null,
      to: input.to ?? null,
      limit,
      after: input.cursor == null ? null : decodeCursor(input.cursor),
    });
    const page = pageFrom(rows, limit, total, (row) => ({
      key: `${row.observedOn}|${row.createdAt}`,
      id: row.id,
    }));
    return { ...page, items: page.items.map((row) => this.view(actor, row)) };
  }

  async create(
    actor: PreschoolActor,
    input: ObservationInput,
  ): Promise<ObservationView> {
    const today = this.today();
    const content = observation(
      { note: input.note, observedOn: input.observedOn ?? today },
      today,
    );
    const child = await readableChild(
      this.deps.store,
      actor,
      input.childId,
      today,
    );
    await this.activeDomain(actor, input.domainId);
    const id = this.id();
    await this.deps.store.insertObservation({
      id,
      workspaceId: actor.workspaceId,
      centreId: child.centreId,
      childId: child.childId,
      domainId: input.domainId,
      ...content,
      createdByUserId: actor.userId,
      createdByName: actor.userName,
    });
    return this.view(actor, await this.observationOf(actor, id));
  }

  async update(
    actor: PreschoolActor,
    id: string,
    input: { domainId: string; observedOn: IsoDate; note: string },
  ): Promise<ObservationView> {
    const record = await this.editable(actor, id);
    if (!isIsoDate(input.observedOn))
      throw invalid("DATE_INVALID", "Enter the date as YYYY-MM-DD.");
    const content = observation(input, this.today());
    if (input.domainId !== record.domainId)
      await this.activeDomain(actor, input.domainId);
    await this.deps.store.updateObservation(id, {
      domainId: input.domainId,
      ...content,
    });
    return this.view(actor, await this.observationOf(actor, id));
  }

  async remove(actor: PreschoolActor, id: string): Promise<void> {
    await this.editable(actor, id);
    await this.deps.store.removeObservation(id, this.deps.now());
  }

  private async editable(
    actor: PreschoolActor,
    id: string,
  ): Promise<ObservationRecord> {
    const record = await this.observationOf(actor, id);
    if (!canEditObservation(actor, record))
      throw forbidden(
        "FORBIDDEN",
        "Only its author or a manager of the Centre can change it.",
      );
    return record;
  }

  private async observationOf(
    actor: PreschoolActor,
    id: string,
  ): Promise<ObservationRecord> {
    const record = await this.deps.store.observation(actor.workspaceId, id);
    if (record == null) throw observationNotFound();
    return record;
  }

  private async domainOf(
    actor: PreschoolActor,
    id: string,
  ): Promise<DevelopmentDomainView> {
    const domain = await this.deps.store.domain(actor.workspaceId, id);
    if (domain == null) throw domainNotFound();
    return domain;
  }

  private async activeDomain(actor: PreschoolActor, id: string): Promise<void> {
    const domain = await this.domainOf(actor, id);
    if (domain.archived)
      throw conflict("DOMAIN_ARCHIVED", "This Development Domain is archived.");
  }

  private async assertNameFree(
    actor: PreschoolActor,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    if (
      await this.deps.store.domainNameTaken(actor.workspaceId, name, exceptId)
    )
      throw conflict(
        "DOMAIN_NAME_IN_USE",
        "Another Development Domain has this name.",
      );
  }

  private assertOwner(actor: PreschoolActor): void {
    assertRole(
      actor,
      ["owner"],
      "Only the Owner can change the Development Domains.",
    );
  }
}
