import { describe, expect, it } from "vitest";

import type { NotificationRecipientsQuery } from "@/src/shared-kernel/access/notification-recipients";
import type { DomainEvent } from "@/src/shared-kernel/events";

import type { NotificationDraft } from "../domain/notification";
import { NotificationListeners } from "./listeners";
import type { Notifier } from "./notifier";
import type { NotificationNames, RecipientDirectory } from "./ports";

const WS = "ws-1";
const AT = new Date("2026-10-16T05:00:00.000Z");
const PROJECT = "11111111-1111-4111-8111-111111111111";

type Sent = { recipients: string[]; draft: NotificationDraft };

/**
 * Listeners against fakes: the directory "grants" every direct recipient
 * and one holder (`holder-1`), minus the actor, and records each query.
 */
function setup() {
  const sent: Sent[] = [];
  const queries: NotificationRecipientsQuery[] = [];
  const recipients: RecipientDirectory = {
    holders(query) {
      queries.push(query);
      const pool = query.among ?? ["holder-1"];
      return Promise.resolve(
        pool.filter((userId) => userId !== query.exceptUserId),
      );
    },
    usersOfMembers(_workspaceId, memberIds) {
      return Promise.resolve(memberIds.map((id) => `user-of-${id}`));
    },
  };
  const names: NotificationNames = {
    project: () => Promise.resolve("Tower A"),
    task: () => Promise.resolve("Shuttering"),
    material: () => Promise.resolve("Cement"),
    location: (_ws, location) =>
      Promise.resolve(location.kind === "project" ? "Tower A" : "Main Store"),
    reportTitle: () => "Task Report",
    reportDownloads: (_ws, id) =>
      Promise.resolve([{ label: "PDF", href: `/download/${id}` }]),
  };
  const notifier = {
    notify(_workspaceId: string, to: readonly string[], draft) {
      sent.push({ recipients: [...to], draft });
      return Promise.resolve(to.map((_, index) => `n-${String(index)}`));
    },
  } as Pick<Notifier, "notify"> as Notifier;
  const listeners = new NotificationListeners({ notifier, recipients, names });
  return { listeners, sent, queries };
}

function event<T extends Record<string, unknown>>(
  type: string,
  fields: T,
): DomainEvent & T {
  return { type, workspaceId: WS, occurredAt: AT, ...fields };
}

describe("notification listeners (CM-904)", () => {
  it("tells new task assignees, never the one who assigned", async () => {
    const { listeners, sent, queries } = setup();
    await listeners.handle(
      event("TaskAssigned", {
        taskId: "task-1",
        projectId: PROJECT,
        taskNo: 12,
        memberIds: ["m-1", "m-2"],
        by: "user-of-m-2",
        createdBy: "creator",
      }),
    );
    expect(queries[0]).toMatchObject({
      menu: "tracking.tasks",
      flag: "read",
      projectId: PROJECT,
      exceptUserId: "user-of-m-2",
      among: ["user-of-m-1", "user-of-m-2"],
    });
    expect(sent).toEqual([
      {
        recipients: ["user-of-m-1"],
        draft: expect.objectContaining({
          type: "task.assigned",
          menu: "tracking.tasks",
          title: "You were assigned Task #12 — Shuttering",
          body: "Tower A",
          href: `/app/projects/${PROJECT}/tasks/task-1`,
          sourceKey: `task.assigned:task-1:${AT.toISOString()}`,
        }) as NotificationDraft,
      },
    ]);
  });

  it("tells the creator and assignees a task is completed", async () => {
    const { listeners, sent } = setup();
    await listeners.handle(
      event("TaskCompleted", {
        taskId: "task-1",
        projectId: PROJECT,
        taskNo: 3,
        actualEnd: "2026-10-16",
        by: "user-of-m-1",
        createdBy: "creator",
        assigneeMemberIds: ["m-1", "m-2"],
      }),
    );
    expect(sent[0]?.recipients).toEqual(["creator", "user-of-m-2"]);
    expect(sent[0]?.draft.title).toBe("Task #3 — Shuttering is completed");
  });

  it("tells an issue's assignee of the assignment, and creator and assignee of the rest", async () => {
    const { listeners, sent } = setup();
    const base = {
      issueId: "issue-1",
      projectId: PROJECT,
      number: "ISS/26-27/00001",
      createdBy: "creator",
      assigneeMemberId: "m-1",
      by: "someone",
    };
    await listeners.handle(event("IssueAssigned", base));
    await listeners.handle(
      event("IssueUpdated", { ...base, updateId: "u-1", by: "user-of-m-1" }),
    );
    await listeners.handle(event("IssueSolved", base));
    await listeners.handle(
      event("IssueReopened", { ...base, reason: "Cracks again" }),
    );
    expect(sent.map((item) => [item.draft.type, item.recipients])).toEqual([
      ["issue.assigned", ["user-of-m-1"]],
      ["issue.updated", ["creator"]],
      ["issue.solved", ["creator", "user-of-m-1"]],
      ["issue.reopened", ["creator", "user-of-m-1"]],
    ]);
    expect(sent[0]?.draft.title).toBe(
      "Issue ISS/26-27/00001 was assigned to you",
    );
    expect(sent[3]?.draft.body).toBe("Cracks again");
    expect(sent[0]?.draft.href).toBe(`/app/projects/${PROJECT}/issues/issue-1`);
  });

  it("tells the inspector of a request and the requester of the decision", async () => {
    const { listeners, sent } = setup();
    await listeners.handle(
      event("InspectionRequested", {
        inspectionId: "ir-1",
        projectId: PROJECT,
        number: "IR-0004",
        inspectorMemberId: "m-9",
        reinspectionOfId: null,
        requestedBy: "requester",
      }),
    );
    await listeners.handle(
      event("InspectionRequested", {
        inspectionId: "ir-2",
        projectId: PROJECT,
        number: "IR-0005",
        inspectorMemberId: null,
        reinspectionOfId: null,
        requestedBy: "requester",
      }),
    );
    await listeners.handle(
      event("InspectionDecided", {
        inspectionId: "ir-1",
        projectId: PROJECT,
        number: "IR-0004",
        status: "rejected",
        reason: "Rebar spacing",
        decidedBy: "user-of-m-9",
        requestedBy: "requester",
        snagIssueId: null,
      }),
    );
    expect(sent.map((item) => [item.draft.title, item.recipients])).toEqual([
      ["Inspection Request IR-0004 is waiting for you", ["user-of-m-9"]],
      ["Your Inspection Request IR-0004 was rejected", ["requester"]],
    ]);
  });

  it("asks the menu's approvers (Approve flag) when a document waits", async () => {
    const { listeners, sent, queries } = setup();
    await listeners.handle(
      event("document.submitted", {
        documentType: "purchase_request",
        documentId: "pr-1",
        projectId: PROJECT,
        number: "PR-0012",
        submittedBy: "creator",
      }),
    );
    expect(queries[0]).toEqual({
      workspaceId: WS,
      menu: "procurement.purchase_requests",
      flag: "approve",
      projectId: PROJECT,
      exceptUserId: "creator",
      among: undefined,
      ownerOnly: false,
    });
    expect(sent[0]?.draft).toMatchObject({
      type: "approval.requested",
      menu: "procurement.purchase_requests",
      title: "Purchase Request PR-0012 is waiting for your approval",
      href: `/app/projects/${PROJECT}/materials/purchase-requests/pr-1`,
    });
  });

  it("asks only the Owner about a Store's invoice settlement, which only the Owner may approve", async () => {
    const { listeners, queries } = setup();
    await listeners.handle(
      event("document.submitted", {
        documentType: "invoice_settlement",
        documentId: "set-1",
        projectId: null,
        number: null,
        submittedBy: "clerk",
      }),
    );
    await listeners.handle(
      event("document.submitted", {
        documentType: "invoice_settlement",
        documentId: "set-2",
        projectId: PROJECT,
        number: null,
        submittedBy: "clerk",
      }),
    );
    expect(queries.map((query) => [query.projectId, query.ownerOnly])).toEqual([
      [null, true],
      [PROJECT, false],
    ]);
  });

  it("tells the creator (or employee) of a decision, with the reason for a rejection", async () => {
    const { listeners, sent, queries } = setup();
    await listeners.handle(
      event("document.approved", {
        documentType: "worksheet",
        documentId: "ws-9",
        projectId: PROJECT,
        approvedBy: "approver",
        number: "WS-0003",
        createdBy: "creator",
      }),
    );
    await listeners.handle(
      event("document.rejected", {
        documentType: "leave_request",
        documentId: "leave-1",
        projectId: null,
        number: null,
        rejectedBy: "hr",
        createdBy: "employee",
        reason: "Site handover that week",
      }),
    );
    // No creator: nobody to tell. Unknown types are ignored.
    await listeners.handle(
      event("document.approved", {
        documentType: "purchase_order",
        documentId: "po-1",
        projectId: PROJECT,
        approvedBy: "approver",
      }),
    );
    await listeners.handle(
      event("document.submitted", {
        documentType: "delivery_note",
        documentId: "dn-1",
        projectId: null,
        number: null,
        submittedBy: "x",
      }),
    );
    expect(queries.map((query) => [query.menu, query.flag])).toEqual([
      ["site_work.daily_worksheet", "read"],
      ["hrms.leaves", "read"],
    ]);
    expect(sent.map((item) => [item.draft.title, item.recipients])).toEqual([
      ["Your Daily Worksheet WS-0003 was approved", ["creator"]],
      ["Your Leave request was rejected", ["employee"]],
    ]);
    expect(sent[1]?.draft).toMatchObject({
      body: "Site handover that week",
      href: "/app/workspace/hrms/leave/my",
    });
  });

  it("tells holders of a fuel overrun, the receiving side of a transfer and the sender of its delivery", async () => {
    const { listeners, sent, queries } = setup();
    await listeners.handle(
      event("EquipmentFuelOverrun", {
        sheetId: "sheet-1",
        equipmentId: "eq-1",
        projectId: PROJECT,
        date: "2026-10-15",
        fuelQty: "40",
        expectedFuelEfficiency: "2",
        by: "operator",
      }),
    );
    const transfer = {
      transferId: "mt-1",
      number: "MT-0002",
      from: { kind: "store", id: "store-1" },
      to: { kind: "project", id: PROJECT },
      by: "storekeeper",
      createdBy: "storekeeper",
    };
    await listeners.handle(
      event("procurement.material_transfer_sent", transfer),
    );
    await listeners.handle(
      event("procurement.material_transfer_delivered", {
        ...transfer,
        by: "site-engineer",
      }),
    );
    expect(queries.map((query) => [query.menu, query.projectId])).toEqual([
      ["site_work.equipment_usage", PROJECT],
      ["procurement.material_transfers", PROJECT],
      ["procurement.material_transfers", null],
    ]);
    expect(sent.map((item) => item.draft.title)).toEqual([
      "Fuel overrun on an Equipment Usage sheet",
      "Material Transfer MT-0002 is on its way to Tower A",
      "Material Transfer MT-0002 was delivered",
    ]);
    expect(sent[2]?.recipients).toEqual(["storekeeper"]);
    expect(sent[1]?.draft.href).toBe(
      `/app/projects/${PROJECT}/materials/transfers/mt-1`,
    );
    expect(sent[2]?.draft.href).toBe(
      "/app/workspace/central-store/store-1/transfers/mt-1",
    );
  });

  it("tells the Central Store of a Material Request and the requester of its delivery", async () => {
    const { listeners, sent, queries } = setup();
    await listeners.handle(
      event("procurement.material_request_raised", {
        requestId: "mr-1",
        number: "MR-0001",
        projectId: PROJECT,
        storeId: null,
        by: "site-engineer",
      }),
    );
    await listeners.handle(
      event("procurement.material_request_delivered", {
        requestId: "mr-1",
        number: "MR-0001",
        deliveryNoteId: "dn-1",
        deliveryNoteNumber: "DN-0001",
        projectId: PROJECT,
        requestedBy: "site-engineer",
        by: "storekeeper",
      }),
    );
    expect(queries.map((query) => query.menu)).toEqual([
      "procurement.material_requests",
      "procurement.material_requests",
    ]);
    expect(sent.map((item) => [item.draft.title, item.recipients])).toEqual([
      ["Material Request MR-0001 was raised", ["holder-1"]],
      ["Your Material Request MR-0001 was delivered", ["site-engineer"]],
    ]);
  });

  it("alerts once a day per material and place when stock falls below its minimum", async () => {
    const { listeners, sent, queries } = setup();
    await listeners.handle(
      event("procurement.stock_below_minimum", {
        locationKind: "project",
        locationId: PROJECT,
        materialId: "cement",
        stock: "12",
        minimum: "20",
      }),
    );
    await listeners.handle(
      event("procurement.stock_below_minimum", {
        locationKind: "store",
        locationId: "store-1",
        materialId: "cement",
        stock: "3",
        minimum: "5",
      }),
    );
    expect(queries.map((query) => [query.menu, query.projectId])).toEqual([
      ["procurement.current_inventory", PROJECT],
      ["procurement.material_requests", null],
    ]);
    expect(sent[0]?.draft).toMatchObject({
      title: "Cement is below its minimum stock",
      body: "12 left at Tower A; the minimum is 20.",
      sourceKey: `stock.below_minimum:${PROJECT}:cement:2026-10-16`,
    });
  });

  it("tells each employee their salary was approved or paid", async () => {
    const { listeners, sent } = setup();
    await listeners.handle(
      event("hrms.salary_paid", {
        month: "2026-09",
        slips: [
          { slipId: "s-1", userId: "emp-1" },
          { slipId: "s-2", userId: null },
          { slipId: "s-3", userId: "hr" },
        ],
        by: "hr",
      }),
    );
    expect(sent[0]).toMatchObject({
      recipients: ["emp-1"],
      draft: {
        type: "salary.paid",
        title: "Your salary for September 2026 was paid",
        href: "/app/workspace/hrms/salary/my",
      },
    });
  });

  it("tells only the requester that a report is ready, with its downloads, or that it failed", async () => {
    const { listeners, sent, queries } = setup();
    await listeners.handle(
      event("ReportFinished", {
        reportJobId: "job-1",
        kind: "task_report",
        projectId: PROJECT,
        requestedBy: "requester",
        status: "done",
        fileName: "Task Report 1–15 Oct 2026",
        error: null,
      }),
    );
    await listeners.handle(
      event("ReportFinished", {
        reportJobId: "job-2",
        kind: "task_report",
        projectId: null,
        requestedBy: "requester",
        status: "failed",
        fileName: null,
        error: "The report took too long.",
      }),
    );
    expect(queries).toEqual([]);
    expect(sent[0]).toEqual({
      recipients: ["requester"],
      draft: expect.objectContaining({
        type: "report.ready",
        menu: null,
        title: "Your Task Report is ready",
        href: "/app/downloads",
        attachment: {
          kind: "report",
          id: "job-1",
          downloads: [{ label: "PDF", href: "/download/job-1" }],
        },
        sourceKey: "report:job-1:done",
      }) as NotificationDraft,
    });
    expect(sent[1]?.draft).toMatchObject({
      type: "report.failed",
      title: "Your Task Report could not be generated",
      body: "The report took too long.",
      attachment: null,
    });
  });

  it("tells only the requester that a backup or data export is ready, with its ZIP link, or that it failed (CM-906)", async () => {
    const { listeners, sent, queries } = setup();
    const finished = (fields: Record<string, unknown>) =>
      event("BackupFinished", {
        backupJobId: "backup-1",
        scope: "project",
        projectId: PROJECT,
        requestedBy: "requester",
        status: "done",
        title: "Project backup",
        fileName: "project-backup-2026-10-16.zip",
        downloadHref:
          "/api/construction/reporting/backups/backup-1/download?expires=1&sig=s",
        error: null,
        ...fields,
      });
    await listeners.handle(finished({}));
    await listeners.handle(
      finished({
        backupJobId: "backup-2",
        status: "failed",
        fileName: null,
        downloadHref: null,
        error: "Too large — choose fewer modules or a shorter range",
      }),
    );
    await listeners.handle(
      finished({ backupJobId: "export-1", scope: "my_data", projectId: null }),
    );
    expect(queries).toEqual([]);
    expect(sent.map((one) => one.recipients)).toEqual([
      ["requester"],
      ["requester"],
      ["requester"],
    ]);
    expect(sent[0]?.draft).toMatchObject({
      type: "backup.ready",
      menu: null,
      title: "Your Project backup is ready",
      href: "/app/downloads",
      attachment: {
        kind: "backup",
        id: "backup-1",
        downloads: [
          {
            label: "ZIP",
            href: "/api/construction/reporting/backups/backup-1/download?expires=1&sig=s",
          },
        ],
      },
      sourceKey: "backup:backup-1:done",
    });
    expect(sent[1]?.draft).toMatchObject({
      type: "backup.failed",
      title: "Your Project backup could not be made",
      body: "Too large — choose fewer modules or a shorter range",
      attachment: null,
    });
    expect(sent[2]?.draft).toMatchObject({
      type: "export.ready",
      title: "Your data export is ready",
      attachment: { kind: "export", id: "export-1" },
    });
  });

  it("ignores events it does not know", async () => {
    const { listeners, sent } = setup();
    await listeners.handle(event("TaskProgressRecorded", { taskId: "t" }));
    await listeners.handle(event("ProjectMediaRemoved", {}));
    expect(sent).toEqual([]);
  });
});
