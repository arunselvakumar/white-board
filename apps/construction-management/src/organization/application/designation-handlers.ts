import { PermissionSet, type Flag } from "@/src/shared-kernel/access";
import { notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { Designation } from "../domain/designation";
import type { DesignationRepository } from "../domain/designation-repository";
import {
  toDesignationReadModel,
  type DesignationReadModel,
} from "./designation-read-model";

type Template = Readonly<Record<string, readonly Flag[]>> | null | undefined;

function templateOf(template: Template): PermissionSet | null {
  return template == null ? null : PermissionSet.fromGrants(template);
}

/** Designation commands and queries (CM-106). Access is checked by the caller. */
export class DesignationHandlers {
  constructor(
    private readonly designations: DesignationRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string): Promise<Designation> {
    const found = await this.designations.findById(workspaceId, id);
    if (found == null)
      throw notFound(
        "DESIGNATION_NOT_FOUND",
        "This Designation was not found.",
      );
    return found;
  }

  async list(workspaceId: string): Promise<DesignationReadModel[]> {
    return (await this.designations.listAll(workspaceId)).map(
      toDesignationReadModel,
    );
  }

  async get(workspaceId: string, id: string): Promise<DesignationReadModel> {
    return toDesignationReadModel(await this.load(workspaceId, id));
  }

  async create(input: {
    workspaceId: string;
    name: string;
    template?: Template;
    by: string;
  }): Promise<DesignationReadModel> {
    const now = this.clock();
    const designation = Designation.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      name: input.name,
      template: templateOf(input.template),
      by: input.by,
      now,
    });
    await this.designations.save(designation);
    return toDesignationReadModel(designation);
  }

  async update(input: {
    workspaceId: string;
    id: string;
    name: string;
    template: Template;
    by: string;
  }): Promise<DesignationReadModel> {
    const now = this.clock();
    const designation = await this.load(input.workspaceId, input.id);
    designation.rename(input.name, input.by, now);
    designation.setTemplate(templateOf(input.template), input.by, now);
    await this.designations.save(designation);
    return toDesignationReadModel(designation);
  }

  async duplicate(input: {
    workspaceId: string;
    id: string;
    name?: string;
    by: string;
  }): Promise<DesignationReadModel> {
    const now = this.clock();
    const source = await this.load(input.workspaceId, input.id);
    const copy = source.duplicate({
      id: newId(now.getTime()),
      name: input.name,
      by: input.by,
      now,
    });
    await this.designations.save(copy);
    return toDesignationReadModel(copy);
  }

  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const designation = await this.load(input.workspaceId, input.id);
    designation.delete(input.by, this.clock());
    await this.designations.save(designation);
  }
}
