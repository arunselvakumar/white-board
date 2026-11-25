import {
  assertCapacity,
  assertCapacityHolds,
  assertClassTeachers,
  classroomName,
} from "../domain/classroom";
import { conflict, notFound } from "../domain/errors";
import {
  assertClassroom,
  assertManagerOf,
  assertCentre,
  assertRole,
  STAFF_ROLES,
  type PreschoolActor,
} from "./access";
import type { ClassroomRecord, ClassroomStore } from "./classroom-ports";
import type {
  AcademicYearRefView,
  ClassroomDetailView,
  ClassroomListView,
  ClassroomOptionsView,
  ClassroomView,
} from "./classroom-views";

export type CreateClassroomInput = {
  centreId: string;
  programmeId: string;
  name: string;
  capacity: number;
  /** Defaults to the current Academic Year. */
  academicYearId?: string;
};

/**
 * Classrooms belong to a Centre and an Academic Year. Managers of the Centre
 * change them; a Teacher reads only their own.
 */
export class ClassroomHandlers {
  constructor(
    private readonly deps: { store: ClassroomStore; now: () => Date },
  ) {}

  async list(
    actor: PreschoolActor,
    query: { centreId: string; academicYearId?: string },
  ): Promise<ClassroomListView> {
    assertRole(actor, STAFF_ROLES);
    assertCentre(actor, query.centreId);
    const academicYear = await this.year(
      actor.workspaceId,
      query.academicYearId,
    );
    const items = await this.deps.store.list(actor.workspaceId, {
      centreId: query.centreId,
      academicYearId: academicYear.id,
      ...(actor.role === "teacher" ? { classroomIds: actor.classroomIds } : {}),
    });
    return { academicYear, items };
  }

  async get(actor: PreschoolActor, id: string): Promise<ClassroomDetailView> {
    assertRole(actor, STAFF_ROLES);
    const classroom = await this.find(actor.workspaceId, id);
    assertCentre(actor, classroom.centreId);
    assertClassroom(actor, classroom);
    const [view, roster] = await Promise.all([
      this.deps.store.view(actor.workspaceId, id),
      this.deps.store.roster(actor.workspaceId, id),
    ]);
    return { ...view, roster };
  }

  async options(
    actor: PreschoolActor,
    query: { centreId: string },
  ): Promise<ClassroomOptionsView> {
    assertManagerOf(actor, query.centreId);
    const academicYear = await this.deps.store.currentAcademicYear(
      actor.workspaceId,
    );
    return {
      academicYear,
      ...(await this.deps.store.options(actor.workspaceId, {
        centreId: query.centreId,
        academicYearId: academicYear.id,
      })),
    };
  }

  async create(
    actor: PreschoolActor,
    input: CreateClassroomInput,
  ): Promise<ClassroomView> {
    assertManagerOf(actor, input.centreId);
    const name = classroomName(input.name);
    assertCapacity(input.capacity);
    const { store } = this.deps;
    const [academicYear, programme] = await Promise.all([
      this.year(actor.workspaceId, input.academicYearId),
      store.programme(actor.workspaceId, input.programmeId),
    ]);
    if (programme == null)
      throw notFound("PROGRAMME_NOT_FOUND", "Programme not found.");
    if (programme.isArchived)
      throw conflict(
        "PROGRAMME_ARCHIVED",
        `${programme.name} is archived. Restore it first.`,
      );
    await this.assertNameFree(actor.workspaceId, {
      centreId: input.centreId,
      academicYearId: academicYear.id,
      name,
    });
    const id = await store.create(actor.workspaceId, {
      centreId: input.centreId,
      academicYearId: academicYear.id,
      programmeId: programme.id,
      name,
      capacity: input.capacity,
    });
    return store.view(actor.workspaceId, id);
  }

  async updateDetails(
    actor: PreschoolActor,
    id: string,
    input: { name: string; capacity: number },
  ): Promise<ClassroomView> {
    const classroom = await this.findOpen(actor, id);
    const name = classroomName(input.name);
    assertCapacity(input.capacity);
    const { store } = this.deps;
    assertCapacityHolds(
      input.capacity,
      await store.childCount(actor.workspaceId, id),
    );
    await this.assertNameFree(actor.workspaceId, {
      centreId: classroom.centreId,
      academicYearId: classroom.academicYearId,
      name,
      exceptId: id,
    });
    await store.update(actor.workspaceId, id, {
      name,
      capacity: input.capacity,
    });
    return store.view(actor.workspaceId, id);
  }

  async archive(actor: PreschoolActor, id: string): Promise<ClassroomView> {
    const classroom = await this.find(actor.workspaceId, id);
    assertManagerOf(actor, classroom.centreId);
    const { store } = this.deps;
    if (classroom.isArchived) return store.view(actor.workspaceId, id);
    const children = await store.childCount(actor.workspaceId, id);
    if (children > 0)
      throw conflict(
        "CLASSROOM_HAS_CHILDREN",
        `${classroom.name} has ${children} ${children === 1 ? "Child" : "Children"}. Move or withdraw them first.`,
        { childCount: children },
      );
    await store.archive(actor.workspaceId, id, this.deps.now());
    return store.view(actor.workspaceId, id);
  }

  async setTeachers(
    actor: PreschoolActor,
    id: string,
    staffIds: readonly string[],
  ): Promise<ClassroomView> {
    const classroom = await this.findOpen(actor, id);
    const unique = [...new Set(staffIds)];
    const { store } = this.deps;
    const staff = await store.staff(actor.workspaceId, unique);
    if (staff.length !== unique.length)
      throw notFound("STAFF_NOT_FOUND", "Staff member not found.");
    assertClassTeachers(classroom.centreId, staff);
    await store.setTeachers(actor.workspaceId, id, unique);
    return store.view(actor.workspaceId, id);
  }

  /** A Classroom a manager may change: found, theirs, not archived. */
  private async findOpen(
    actor: PreschoolActor,
    id: string,
  ): Promise<ClassroomRecord> {
    const classroom = await this.find(actor.workspaceId, id);
    assertManagerOf(actor, classroom.centreId);
    if (classroom.isArchived)
      throw conflict("CLASSROOM_ARCHIVED", `${classroom.name} is archived.`);
    return classroom;
  }

  private async find(
    workspaceId: string,
    id: string,
  ): Promise<ClassroomRecord> {
    const classroom = await this.deps.store.find(workspaceId, id);
    if (classroom == null)
      throw notFound("CLASSROOM_NOT_FOUND", "Classroom not found.");
    return classroom;
  }

  private async year(
    workspaceId: string,
    id: string | undefined,
  ): Promise<AcademicYearRefView> {
    if (id == null) return this.deps.store.currentAcademicYear(workspaceId);
    const year = await this.deps.store.academicYear(workspaceId, id);
    if (year == null)
      throw notFound("ACADEMIC_YEAR_NOT_FOUND", "Academic Year not found.");
    return year;
  }

  private async assertNameFree(
    workspaceId: string,
    query: {
      centreId: string;
      academicYearId: string;
      name: string;
      exceptId?: string;
    },
  ): Promise<void> {
    if (await this.deps.store.nameTaken(workspaceId, query))
      throw conflict(
        "CLASSROOM_NAME_IN_USE",
        `This Centre already has a Classroom called ${query.name} this Academic Year.`,
      );
  }
}
