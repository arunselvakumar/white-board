import type { Flag, MenuKey } from "@/src/shared-kernel/access";
import type {
  DocumentApproved,
  DocumentRejected,
  DocumentSubmitted,
} from "@/src/shared-kernel/approval";
import type {
  DomainEvent,
  DomainEventListener,
} from "@/src/shared-kernel/events";

import type { NotificationDraft } from "../domain/notification";
import {
  approvalDocument,
  documentName,
  LINKS,
  monthLabel,
  taskName,
} from "../domain/notification-kinds";
import type {
  InboundBackupFinished,
  InboundEquipmentFuelOverrun,
  InboundInspectionDecided,
  InboundInspectionRequested,
  InboundIssueEvent,
  InboundMaterialRequestDelivered,
  InboundMaterialRequestRaised,
  InboundMaterialTransferDelivered,
  InboundMaterialTransferSent,
  InboundReportFinished,
  InboundSalaryDecided,
  InboundStockBelowMinimum,
  InboundTaskAssigned,
  InboundTaskCompleted,
} from "./inbound-events";
import type { Notifier } from "./notifier";
import type { NotificationNames, RecipientDirectory } from "./ports";

export type NotificationListenerDeps = {
  notifier: Notifier;
  recipients: RecipientDirectory;
  names: NotificationNames;
};

/** Who a draft goes to, before the matrix check. */
type Audience =
  /** Every holder of the menu's N flag and `flag` (on the Project). */
  | { kind: "holders"; menu: MenuKey; flag: Flag; projectId: string | null }
  /** These users only, if they hold N and `flag` (assignees, creators). */
  | {
      kind: "direct";
      menu: MenuKey;
      flag: Flag;
      projectId: string | null;
      userIds: readonly string[];
    }
  /** The requester of a report or backup: no flag (ADR CM-0021 §6). */
  | { kind: "requester"; userId: string };

type Plan = {
  audience: Audience;
  except: string | null;
  draft: NotificationDraft;
};

function key(event: DomainEvent, ...parts: string[]): string {
  return [...parts, event.occurredAt.toISOString()].join(":");
}

/**
 * Turns other modules' events into notifications (ADR CM-0021 §6): one
 * insert per event, to the members the matrix allows, never the actor.
 * Unknown events are ignored. The composition root wraps this so a
 * failure is logged and never fails the command that raised the event.
 */
export class NotificationListeners implements DomainEventListener {
  constructor(private readonly deps: NotificationListenerDeps) {}

  async handle(event: DomainEvent): Promise<void> {
    for (const plan of await this.plan(event)) await this.deliver(event, plan);
  }

  private async deliver(event: DomainEvent, plan: Plan): Promise<void> {
    const { audience } = plan;
    let recipients: string[];
    if (audience.kind === "requester") recipients = [audience.userId];
    else {
      const among =
        audience.kind === "direct"
          ? audience.userIds.filter((id): id is string => id !== "")
          : undefined;
      if (among?.length === 0) return;
      recipients = await this.deps.recipients.holders({
        workspaceId: event.workspaceId,
        menu: audience.menu,
        flag: audience.flag,
        projectId: audience.projectId,
        exceptUserId: plan.except,
        among,
      });
    }
    await this.deps.notifier.notify(event.workspaceId, recipients, plan.draft);
  }

  private projectName(event: DomainEvent, projectId: string | null) {
    return projectId == null
      ? Promise.resolve(null)
      : this.deps.names.project(event.workspaceId, projectId);
  }

  private async plan(event: DomainEvent): Promise<Plan[]> {
    switch (event.type) {
      case "TaskAssigned":
        return this.taskAssigned(event as InboundTaskAssigned);
      case "TaskCompleted":
        return this.taskCompleted(event as InboundTaskCompleted);
      case "IssueAssigned":
      case "IssueUpdated":
      case "IssueSolved":
      case "IssueReopened":
        return this.issue(event as InboundIssueEvent);
      case "InspectionRequested":
        return this.inspectionRequested(event as InboundInspectionRequested);
      case "InspectionDecided":
        return this.inspectionDecided(event as InboundInspectionDecided);
      case "document.submitted":
        return this.submitted(event as DocumentSubmitted);
      case "document.approved":
      case "document.rejected":
        return this.decided(event as DocumentApproved | DocumentRejected);
      case "EquipmentFuelOverrun":
        return this.fuelOverrun(event as InboundEquipmentFuelOverrun);
      case "procurement.material_transfer_sent":
        return this.transferSent(event as InboundMaterialTransferSent);
      case "procurement.material_transfer_delivered":
        return this.transferDelivered(
          event as InboundMaterialTransferDelivered,
        );
      case "procurement.material_request_raised":
        return this.requestRaised(event as InboundMaterialRequestRaised);
      case "procurement.material_request_delivered":
        return this.requestDelivered(event as InboundMaterialRequestDelivered);
      case "procurement.stock_below_minimum":
        return this.stockBelowMinimum(event as InboundStockBelowMinimum);
      case "hrms.salary_approved":
      case "hrms.salary_paid":
        return this.salary(event as InboundSalaryDecided);
      case "ReportFinished":
        return this.reportFinished(event as InboundReportFinished);
      case "BackupFinished":
        return this.backupFinished(event as InboundBackupFinished);
      default:
        return [];
    }
  }

  // -------------------------------------------------------------------------
  // Tracking
  // -------------------------------------------------------------------------

  private async taskAssigned(event: InboundTaskAssigned): Promise<Plan[]> {
    const [assignees, title, project] = await Promise.all([
      this.deps.recipients.usersOfMembers(event.workspaceId, event.memberIds),
      this.deps.names.task(event.workspaceId, event.taskId),
      this.projectName(event, event.projectId),
    ]);
    return [
      {
        audience: {
          kind: "direct",
          menu: "tracking.tasks",
          flag: "read",
          projectId: event.projectId,
          userIds: assignees,
        },
        except: event.by,
        draft: {
          type: "task.assigned",
          menu: "tracking.tasks",
          projectId: event.projectId,
          title: `You were assigned ${taskName(event.taskNo, title)}`,
          body: project,
          href: LINKS.task(event.projectId, event.taskId),
          sourceKey: key(event, "task.assigned", event.taskId),
        },
      },
    ];
  }

  private async taskCompleted(event: InboundTaskCompleted): Promise<Plan[]> {
    const [assignees, title, project] = await Promise.all([
      this.deps.recipients.usersOfMembers(
        event.workspaceId,
        event.assigneeMemberIds,
      ),
      this.deps.names.task(event.workspaceId, event.taskId),
      this.projectName(event, event.projectId),
    ]);
    return [
      {
        audience: {
          kind: "direct",
          menu: "tracking.tasks",
          flag: "read",
          projectId: event.projectId,
          userIds: [event.createdBy, ...assignees],
        },
        except: event.by,
        draft: {
          type: "task.completed",
          menu: "tracking.tasks",
          projectId: event.projectId,
          title: `${taskName(event.taskNo, title)} is completed`,
          body: project,
          href: LINKS.task(event.projectId, event.taskId),
          sourceKey: key(event, "task.completed", event.taskId),
        },
      },
    ];
  }

  private async issue(event: InboundIssueEvent): Promise<Plan[]> {
    const [assignees, project] = await Promise.all([
      this.deps.recipients.usersOfMembers(
        event.workspaceId,
        event.assigneeMemberId == null ? [] : [event.assigneeMemberId],
      ),
      this.projectName(event, event.projectId),
    ]);
    const name = `Issue ${event.number}`;
    const words = {
      IssueAssigned: {
        type: "issue.assigned",
        title: `${name} was assigned to you`,
        body: project,
      },
      IssueUpdated: {
        type: "issue.updated",
        title: `New update on ${name}`,
        body: project,
      },
      IssueSolved: {
        type: "issue.solved",
        title: `${name} was marked solved`,
        body: project,
      },
      IssueReopened: {
        type: "issue.reopened",
        title: `${name} was reopened`,
        body: event.type === "IssueReopened" ? event.reason : project,
      },
    }[event.type];
    // Assigned goes to the assignee; the rest to the creator and assignee.
    const userIds =
      event.type === "IssueAssigned"
        ? assignees
        : [event.createdBy, ...assignees];
    return [
      {
        audience: {
          kind: "direct",
          menu: "tracking.issues",
          flag: "read",
          projectId: event.projectId,
          userIds,
        },
        except: event.by,
        draft: {
          type: words.type,
          menu: "tracking.issues",
          projectId: event.projectId,
          title: words.title,
          body: words.body,
          href: LINKS.issue(event.projectId, event.issueId),
          sourceKey: key(event, words.type, event.issueId),
        },
      },
    ];
  }

  private async inspectionRequested(
    event: InboundInspectionRequested,
  ): Promise<Plan[]> {
    if (event.inspectorMemberId == null) return [];
    const [inspectors, project] = await Promise.all([
      this.deps.recipients.usersOfMembers(event.workspaceId, [
        event.inspectorMemberId,
      ]),
      this.projectName(event, event.projectId),
    ]);
    return [
      {
        audience: {
          kind: "direct",
          menu: "tracking.inspection_requests",
          flag: "read",
          projectId: event.projectId,
          userIds: inspectors,
        },
        except: event.requestedBy,
        draft: {
          type: "inspection.requested",
          menu: "tracking.inspection_requests",
          projectId: event.projectId,
          title: `Inspection Request ${event.number} is waiting for you`,
          body: project,
          href: LINKS.inspection(event.projectId, event.inspectionId),
          sourceKey: key(event, "inspection.requested", event.inspectionId),
        },
      },
    ];
  }

  private async inspectionDecided(
    event: InboundInspectionDecided,
  ): Promise<Plan[]> {
    const project = await this.projectName(event, event.projectId);
    return [
      {
        audience: {
          kind: "direct",
          menu: "tracking.inspection_requests",
          flag: "read",
          projectId: event.projectId,
          userIds: [event.requestedBy],
        },
        except: event.decidedBy,
        draft: {
          type: "inspection.decided",
          menu: "tracking.inspection_requests",
          projectId: event.projectId,
          title: `Your Inspection Request ${event.number} was ${event.status}`,
          body: event.reason ?? project,
          href: LINKS.inspection(event.projectId, event.inspectionId),
          sourceKey: key(event, "inspection.decided", event.inspectionId),
        },
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Approvals of any document
  // -------------------------------------------------------------------------

  private async submitted(event: DocumentSubmitted): Promise<Plan[]> {
    const document = approvalDocument(event.documentType);
    if (document == null) return [];
    const project = await this.projectName(event, event.projectId);
    const ref = { id: event.documentId, projectId: event.projectId };
    return [
      {
        audience: {
          kind: "holders",
          menu: document.menu,
          flag: "approve",
          projectId: event.projectId,
        },
        except: event.submittedBy,
        draft: {
          type: "approval.requested",
          menu: document.menu,
          projectId: event.projectId,
          title: `${documentName(document.label, event.number)} is waiting for your approval`,
          body: project,
          href: document.approverHref(ref),
          sourceKey: key(
            event,
            "approval.requested",
            event.documentType,
            event.documentId,
          ),
        },
      },
    ];
  }

  private async decided(
    event: DocumentApproved | DocumentRejected,
  ): Promise<Plan[]> {
    const document = approvalDocument(event.documentType);
    const createdBy = event.createdBy ?? null;
    if (document == null || createdBy == null) return [];
    const approved = event.type === "document.approved";
    const by = approved ? event.approvedBy : event.rejectedBy;
    const project = await this.projectName(event, event.projectId);
    const name = documentName(document.label, event.number ?? null);
    return [
      {
        audience: {
          kind: "direct",
          menu: document.menu,
          flag: "read",
          projectId: event.projectId,
          userIds: [createdBy],
        },
        except: by,
        draft: {
          type: "approval.decided",
          menu: document.menu,
          projectId: event.projectId,
          title: `Your ${name.replace(/^A /, "")} was ${approved ? "approved" : "rejected"}`,
          body: approved ? project : (event.reason ?? project),
          href: document.creatorHref({
            id: event.documentId,
            projectId: event.projectId,
          }),
          sourceKey: key(
            event,
            "approval.decided",
            event.documentType,
            event.documentId,
          ),
        },
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Site work and materials
  // -------------------------------------------------------------------------

  private async fuelOverrun(
    event: InboundEquipmentFuelOverrun,
  ): Promise<Plan[]> {
    const project = await this.projectName(event, event.projectId);
    const sheet =
      event.number == null
        ? "an Equipment Usage sheet"
        : `Equipment Usage sheet ${event.number}`;
    return [
      {
        audience: {
          kind: "holders",
          menu: "site_work.equipment_usage",
          flag: "read",
          projectId: event.projectId,
        },
        except: event.by ?? null,
        draft: {
          type: "equipment.fuel_overrun",
          menu: "site_work.equipment_usage",
          projectId: event.projectId,
          title: `Fuel overrun on ${sheet}`,
          body: [
            `${event.fuelQty} used, more than the expected efficiency allows.`,
            project,
          ]
            .filter((part) => part != null)
            .join(" "),
          href: LINKS.equipmentSheet(event.projectId, event.sheetId),
          sourceKey: key(event, "equipment.fuel_overrun", event.sheetId),
        },
      },
    ];
  }

  private transferName(number: string | null): string {
    return number == null
      ? "A Material Transfer"
      : `Material Transfer ${number}`;
  }

  private async transferSent(
    event: InboundMaterialTransferSent,
  ): Promise<Plan[]> {
    const [from, to] = await Promise.all([
      this.deps.names.location(event.workspaceId, event.from),
      this.deps.names.location(event.workspaceId, event.to),
    ]);
    return [
      {
        // The receiving side: its Project's holders, or every holder for a
        // Central Store (stores are not Project-scoped).
        audience: {
          kind: "holders",
          menu: "procurement.material_transfers",
          flag: "read",
          projectId: event.to.kind === "project" ? event.to.id : null,
        },
        except: event.by,
        draft: {
          type: "material_transfer.sent",
          menu: "procurement.material_transfers",
          projectId: event.to.kind === "project" ? event.to.id : null,
          title: `${this.transferName(event.number)} is on its way${to == null ? "" : ` to ${to}`}`,
          body: from == null ? null : `From ${from}`,
          href: LINKS.transfer(event.to, event.transferId),
          sourceKey: key(event, "material_transfer.sent", event.transferId),
        },
      },
    ];
  }

  private async transferDelivered(
    event: InboundMaterialTransferDelivered,
  ): Promise<Plan[]> {
    const to = await this.deps.names.location(event.workspaceId, event.to);
    const fromProject = event.from.kind === "project" ? event.from.id : null;
    return [
      {
        audience: {
          kind: "direct",
          menu: "procurement.material_transfers",
          flag: "read",
          projectId: fromProject,
          userIds: [event.createdBy],
        },
        except: event.by,
        draft: {
          type: "material_transfer.delivered",
          menu: "procurement.material_transfers",
          projectId: fromProject,
          title: `${this.transferName(event.number)} was delivered`,
          body: to == null ? null : `At ${to}`,
          href: LINKS.transfer(event.from, event.transferId),
          sourceKey: key(
            event,
            "material_transfer.delivered",
            event.transferId,
          ),
        },
      },
    ];
  }

  private requestName(number: string | null): string {
    return number == null ? "A Material Request" : `Material Request ${number}`;
  }

  private async requestRaised(
    event: InboundMaterialRequestRaised,
  ): Promise<Plan[]> {
    const project = await this.projectName(event, event.projectId);
    return [
      {
        audience: {
          kind: "holders",
          menu: "procurement.material_requests",
          flag: "read",
          projectId: null,
        },
        except: event.by,
        draft: {
          type: "material_request.raised",
          menu: "procurement.material_requests",
          projectId: event.projectId,
          title: `${this.requestName(event.number)} was raised`,
          body: project,
          href: LINKS.centralMaterialRequest(event.requestId),
          sourceKey: key(event, "material_request.raised", event.requestId),
        },
      },
    ];
  }

  private async requestDelivered(
    event: InboundMaterialRequestDelivered,
  ): Promise<Plan[]> {
    const project = await this.projectName(event, event.projectId);
    return [
      {
        audience: {
          kind: "direct",
          menu: "procurement.material_requests",
          flag: "read",
          projectId: null,
          userIds: [event.requestedBy],
        },
        except: event.by,
        draft: {
          type: "material_request.delivered",
          menu: "procurement.material_requests",
          projectId: event.projectId,
          title: `Your ${this.requestName(event.number).replace(/^A /, "")} was delivered`,
          body: project,
          href: LINKS.projectMaterialRequest(event.projectId, event.requestId),
          sourceKey: key(event, "material_request.delivered", event.requestId),
        },
      },
    ];
  }

  private async stockBelowMinimum(
    event: InboundStockBelowMinimum,
  ): Promise<Plan[]> {
    const location = { kind: event.locationKind, id: event.locationId };
    const [material, place] = await Promise.all([
      this.deps.names.material(event.workspaceId, event.materialId),
      this.deps.names.location(event.workspaceId, location),
    ]);
    const atProject = event.locationKind === "project";
    // A Central Store has no Current Inventory menu of its own: its holders
    // are the Central Store (MR) menu's.
    const menu: MenuKey = atProject
      ? "procurement.current_inventory"
      : "procurement.material_requests";
    return [
      {
        audience: {
          kind: "holders",
          menu,
          flag: "read",
          projectId: atProject ? event.locationId : null,
        },
        except: null,
        draft: {
          type: "stock.below_minimum",
          menu,
          projectId: atProject ? event.locationId : null,
          title: `${material ?? "A material"} is below its minimum stock`,
          body: `${event.stock} left${place == null ? "" : ` at ${place}`}; the minimum is ${event.minimum}.`,
          href: LINKS.inventory(location),
          // Once a day per material and place: a burst of issues is one alert.
          sourceKey: [
            "stock.below_minimum",
            event.locationId,
            event.materialId,
            event.occurredAt.toISOString().slice(0, 10),
          ].join(":"),
        },
      },
    ];
  }

  // -------------------------------------------------------------------------
  // HRMS
  // -------------------------------------------------------------------------

  private salary(event: InboundSalaryDecided): Plan[] {
    const paid = event.type === "hrms.salary_paid";
    const type = paid ? "salary.paid" : "salary.approved";
    return [
      {
        audience: {
          kind: "direct",
          menu: "hrms.salaries",
          flag: "read",
          projectId: null,
          userIds: event.slips.flatMap((slip) =>
            slip.userId == null ? [] : [slip.userId],
          ),
        },
        except: event.by,
        draft: {
          type,
          menu: "hrms.salaries",
          projectId: null,
          title: `Your salary for ${monthLabel(event.month)} was ${paid ? "paid" : "approved"}`,
          body: null,
          href: LINKS.mySalary,
          sourceKey: key(event, type, event.month),
        },
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  private async reportFinished(event: InboundReportFinished): Promise<Plan[]> {
    const title = this.deps.names.reportTitle(event.kind);
    const done = event.status === "done";
    const downloads = done
      ? await this.deps.names.reportDownloads(
          event.workspaceId,
          event.reportJobId,
        )
      : [];
    return [
      {
        audience: { kind: "requester", userId: event.requestedBy },
        except: null,
        draft: {
          type: done ? "report.ready" : "report.failed",
          menu: null,
          projectId: event.projectId,
          title: done
            ? `Your ${title} is ready`
            : `Your ${title} could not be generated`,
          body: done ? event.fileName : event.error,
          href: LINKS.downloads,
          attachment: done
            ? { kind: "report", id: event.reportJobId, downloads }
            : null,
          sourceKey: `report:${event.reportJobId}:${event.status}`,
        },
      },
    ];
  }

  /**
   * A backup or data export finished (CM-906): its requester only, no N
   * flag, with the signed ZIP link as the download.
   */
  private backupFinished(event: InboundBackupFinished): Plan[] {
    const done = event.status === "done";
    const exported = event.scope === "my_data";
    const what = exported ? "Your data export" : `Your ${event.title}`;
    return [
      {
        audience: { kind: "requester", userId: event.requestedBy },
        except: null,
        draft: {
          type: exported
            ? done
              ? "export.ready"
              : "export.failed"
            : done
              ? "backup.ready"
              : "backup.failed",
          menu: null,
          projectId: event.projectId,
          title: done ? `${what} is ready` : `${what} could not be made`,
          body: done
            ? `${event.fileName ?? "ZIP"} · the link works for 7 days`
            : event.error,
          href: LINKS.downloads,
          attachment:
            done && event.downloadHref != null
              ? {
                  kind: exported ? "export" : "backup",
                  id: event.backupJobId,
                  downloads: [{ label: "ZIP", href: event.downloadHref }],
                }
              : null,
          sourceKey: `backup:${event.backupJobId}:${event.status}`,
        },
      },
    ];
  }
}
