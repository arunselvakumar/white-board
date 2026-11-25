import { ageInMonths, formatAge, todayInIndia } from "../domain/dates";
import { invoiceDuePaise } from "../domain/fees";
import { assertRole, type PreschoolActor } from "./access";
import type { FamilyChildFacts, FamilyStore } from "./family-ports";
import type { FamilyChildView, FamilyHomeView } from "./family-views";

const PARENT_RELATIONSHIP = { father: "Father", mother: "Mother" } as const;

/** Who collected the Child, as a Parent reads it. */
function collectedBy(
  attendance: NonNullable<FamilyChildFacts["attendance"]>,
): FamilyChildView["today"]["collectedBy"] {
  const { collectedByKind: kind, collectedByName: name } = attendance;
  if (kind == null || name == null || attendance.checkOutTime == null)
    return null;
  if (kind === "father" || kind === "mother")
    return { name, relationship: PARENT_RELATIONSHIP[kind] };
  if (kind === "authorised_pickup")
    return { name, relationship: attendance.pickupRelationship };
  return { name, relationship: null };
}

/** Due, overdue and the next amount due, from the Child's Invoices. */
export function familyFees(
  invoices: FamilyChildFacts["invoices"],
  today: string,
): FamilyChildView["fees"] {
  let duePaise = 0;
  let overduePaise = 0;
  let nextDue: FamilyChildView["fees"]["nextDue"] = null;
  for (const invoice of [...invoices].sort((a, b) =>
    a.dueOn.localeCompare(b.dueOn),
  )) {
    const due = invoiceDuePaise({ ...invoice, cancelled: false });
    if (due === 0) continue;
    duePaise += due;
    if (invoice.dueOn < today) overduePaise += due;
    else
      nextDue ??= { dueOn: invoice.dueOn, label: invoice.label, duePaise: due };
  }
  return { duePaise, overduePaise, nextDue };
}

/** The Parent Home: their own Children only, read only. */
export class FamilyHandlers {
  constructor(private readonly deps: { store: FamilyStore; now: () => Date }) {}

  async home(actor: PreschoolActor): Promise<FamilyHomeView> {
    assertRole(actor, ["parent"]);
    const today = todayInIndia(this.deps.now());
    const facts = await this.deps.store.children(
      actor.workspaceId,
      actor.childIds,
      today,
    );
    return {
      date: today,
      children: facts.map((child) => ({
        child: {
          id: child.id,
          name: [child.firstName, child.lastName]
            .filter((part) => part != null && part !== "")
            .join(" "),
          firstName: child.firstName,
          photoUrl: child.photoUrl,
          ageText: formatAge(ageInMonths(child.dateOfBirth, today)),
          admissionNumber: child.admissionNumber,
          classroomName: child.classroomName,
          programmeName: child.programmeName,
          centre: child.centre,
        },
        classTeachers: child.classTeachers,
        today: {
          status: child.attendance?.status ?? null,
          checkInTime: child.attendance?.checkInTime ?? null,
          checkOutTime: child.attendance?.checkOutTime ?? null,
          collectedBy:
            child.attendance == null ? null : collectedBy(child.attendance),
        },
        latestDailyReport: child.latestReport,
        fees: familyFees(child.invoices, today),
      })),
    };
  }
}
