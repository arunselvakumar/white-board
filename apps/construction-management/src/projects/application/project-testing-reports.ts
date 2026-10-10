import {
  AttachmentUploads,
  storedFilesOf,
  type CheckedUpload,
  type RecordedUpload,
  type StartedUpload,
  type UploadTarget,
} from "@/src/shared-kernel/attachments";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { notFound } from "@/src/shared-kernel/domain-error";
import type {
  NewStoredFile,
  ObjectStorage,
  StoredObject,
} from "@/src/shared-kernel/files";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import type { PlanGate } from "@/src/shared-kernel/plan";

import type { ProjectRepository } from "../domain/project-repository";
import { TESTING_REPORT_POLICY } from "../domain/project-upload-policies";
import {
  testingItemName,
  testingReportDetails,
  type TestingItem,
  type TestingReport,
  type TestingReportDetailsInput,
} from "../domain/testing-report";
import { thumbnailNotFound, type UploaderNames } from "./project-documents";
import type { ProjectViewer } from "./project-handlers";
import { assertProjectVisible } from "./project-visibility";

/** `stored_files.kind` of a testing report's file. */
export const TESTING_REPORT_FILE_KIND = "testing_report";

export type TestingItemWithCount = TestingItem & { reportCount: number };

/**
 * What a key belongs to: a live report, or nothing live any more (the
 * report was deleted or its file replaced; the key stays taken).
 */
export type ReportAtKey =
  { state: "live"; report: TestingReport } | { state: "retired" };

export type TestingReportPage = {
  items: TestingReport[];
  total: number;
  /** More rows past the page in the direction asked. */
  hasMore: boolean;
};

/**
 * The rows behind Testing Reports. Each write is one transaction with its
 * audit event; a write that adds a file also writes its `stored_files`
 * rows and Gallery row (source `testing_report`).
 */
export type TestingReportStore = {
  /** Live items with their live report counts, by name. */
  listItems(
    workspaceId: string,
    projectId: string,
  ): Promise<TestingItemWithCount[]>;
  findItem(
    workspaceId: string,
    projectId: string,
    itemId: string,
  ): Promise<TestingItem | null>;
  /** 409 `TESTING_ITEM_NAME_IN_USE`. */
  insertItem(item: TestingItem, by: string, audit: AuditEvent): Promise<void>;
  /** 409 `TESTING_ITEM_CHANGED` on a stale `updatedAt`, `TESTING_ITEM_NAME_IN_USE`. */
  renameItem(input: {
    item: TestingItem;
    name: string;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<TestingItem>;
  /** 409 `TESTING_ITEM_NOT_EMPTY` while it has a live report. */
  deleteItem(input: {
    item: TestingItem;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<void>;
  /**
   * One page of an item's live reports, newest report date first, then
   * newest id; `q` matches the name ignoring case. `after` pages towards
   * older reports, `before` back towards newer ones.
   */
  listReports(input: {
    workspaceId: string;
    projectId: string;
    itemId: string;
    q?: string;
    limit: number;
    after?: ListCursor;
    before?: ListCursor;
  }): Promise<TestingReportPage>;
  findReport(
    workspaceId: string,
    projectId: string,
    reportId: string,
  ): Promise<TestingReport | null>;
  findReportByKey(
    workspaceId: string,
    projectId: string,
    key: string,
  ): Promise<ReportAtKey | null>;
  /** While the Project and item are live; `duplicate` for a recorded key. */
  addReport(input: {
    report: TestingReport;
    files: NewStoredFile[];
    audit: AuditEvent;
  }): Promise<"added" | "duplicate">;
  /**
   * Writes the edit; 409 `TESTING_REPORT_CHANGED` on a stale `updatedAt`.
   * With `replaced`, the old file's stored rows and Gallery row go and the
   * new file's are written (`duplicate` when its key is already recorded).
   */
  updateReport(input: {
    report: TestingReport;
    expectedUpdatedAt: Date;
    by: string;
    files: NewStoredFile[];
    replaced: TestingReport | null;
    audit: AuditEvent;
  }): Promise<"updated" | "duplicate">;
  /** Tombstones the report, its stored files and Gallery row. */
  deleteReport(input: {
    report: TestingReport;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
};

/**
 * The Back-dated Entry policy for module `material_testing_report`
 * (module 12) for one Team Member: `create` before adding a report,
 * `edit` before changing or deleting one. The returned check throws the
 * kernel's `BACKDATED_*` / `FINANCIAL_PERIOD_CLOSED`.
 */
export type TestingReportBackdatedGuard = {
  forActor(
    viewer: ProjectViewer,
  ): Promise<(action: "create" | "edit", date: CalendarDate) => void>;
};

export type TestingReportView = TestingReport & {
  /** A PDF or an image; always true for a testing report. */
  viewable: boolean;
  createdByName: string | null;
};

const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const testingItemNotFound = () =>
  notFound("TESTING_ITEM_NOT_FOUND", "This testing material was not found.");

export const testingReportNotFound = () =>
  notFound("TESTING_REPORT_NOT_FOUND", "This testing report was not found.");

function view(
  report: TestingReport,
  names: ReadonlyMap<string, string>,
): TestingReportView {
  return {
    ...report,
    viewable: VIEWABLE.has(report.contentType),
    createdByName: names.get(report.createdBy) ?? null,
  };
}

function summary(report: TestingReport) {
  return {
    projectId: report.projectId,
    itemId: report.itemId,
    name: report.name,
    reportDate: report.reportDate,
    remark: report.remark,
    fileName: report.fileName,
    bytes: report.bytes,
  };
}

/**
 * Testing Reports (CM-409, ADR CM-0013 §9). Testing items hold reports;
 * each report has a name, a report date under the back-dated policy for
 * `material_testing_report`, an optional remark and exactly one PDF or
 * image (policy `TESTING_REPORT_POLICY`, at most 25 MB) uploaded through
 * the attachments service. Every report is in the Gallery.
 *
 * Routes check `projects.testing_reports` first; this applies Project
 * visibility.
 */
export class ProjectTestingReports {
  private readonly uploads: AttachmentUploads;

  constructor(
    private readonly projects: Pick<ProjectRepository, "findById">,
    private readonly store: TestingReportStore,
    storage: ObjectStorage,
    plan: PlanGate,
    private readonly names: UploaderNames,
    private readonly guard: TestingReportBackdatedGuard,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.uploads = new AttachmentUploads(storage, plan, clock);
  }

  private target(viewer: ProjectViewer, projectId: string): UploadTarget {
    return {
      workspaceId: viewer.workspaceId,
      ownerId: projectId,
      policy: TESTING_REPORT_POLICY,
    };
  }

  private visible(viewer: ProjectViewer, projectId: string): Promise<void> {
    return assertProjectVisible(this.projects, viewer, projectId);
  }

  private async liveItem(
    viewer: ProjectViewer,
    projectId: string,
    itemId: string,
  ): Promise<TestingItem> {
    await this.visible(viewer, projectId);
    const item = await this.store.findItem(
      viewer.workspaceId,
      projectId,
      itemId,
    );
    if (item == null) throw testingItemNotFound();
    return item;
  }

  private async liveReport(
    viewer: ProjectViewer,
    projectId: string,
    reportId: string,
  ): Promise<TestingReport> {
    await this.visible(viewer, projectId);
    const report = await this.store.findReport(
      viewer.workspaceId,
      projectId,
      reportId,
    );
    if (report == null) throw testingReportNotFound();
    return report;
  }

  private async views(
    workspaceId: string,
    reports: readonly TestingReport[],
  ): Promise<TestingReportView[]> {
    const names = await this.names.namesOf(workspaceId, [
      ...new Set(reports.map((report) => report.createdBy)),
    ]);
    return reports.map((report) => view(report, names));
  }

  private audit(
    workspaceId: string,
    by: string,
    action: string,
    entity: { type: string; id: string },
    now: Date,
    extra: Partial<AuditEvent> = {},
  ): AuditEvent {
    return {
      workspaceId,
      actorUserId: by,
      action,
      entityType: entity.type,
      entityId: entity.id,
      occurredAt: now,
      ...extra,
    };
  }

  private files(
    upload: CheckedUpload,
    workspaceId: string,
    by: string,
    now: Date,
  ): NewStoredFile[] {
    return storedFilesOf(upload, {
      workspaceId,
      kind: TESTING_REPORT_FILE_KIND,
      by,
      now,
    });
  }

  private recordedAt(
    viewer: ProjectViewer,
    projectId: string,
    key: string,
  ): () => Promise<RecordedUpload<TestingReport>> {
    return async () => {
      const found = await this.store.findReportByKey(
        viewer.workspaceId,
        projectId,
        key,
      );
      if (found == null) return null;
      return found.state === "live"
        ? { state: "live", value: found.report }
        : { state: "deleted" };
    };
  }

  // Testing items.

  /** The Project's testing items by name, with their report counts. */
  async items(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<TestingItemWithCount[]> {
    await this.visible(viewer, projectId);
    return this.store.listItems(viewer.workspaceId, projectId);
  }

  async item(
    viewer: ProjectViewer,
    projectId: string,
    itemId: string,
  ): Promise<TestingItem> {
    return this.liveItem(viewer, projectId, itemId);
  }

  /** 409 `TESTING_ITEM_NAME_IN_USE` for a name already on the Project. */
  async addItem(input: {
    viewer: ProjectViewer;
    projectId: string;
    name: string;
    by: string;
  }): Promise<TestingItemWithCount> {
    await this.visible(input.viewer, input.projectId);
    const now = this.clock();
    const item: TestingItem = {
      id: newId(now.getTime()),
      workspaceId: input.viewer.workspaceId,
      projectId: input.projectId,
      name: testingItemName(input.name),
      isSeed: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.insertItem(
      item,
      input.by,
      this.audit(
        item.workspaceId,
        input.by,
        "testing_item.created",
        { type: "testing_item", id: item.id },
        now,
        { after: { projectId: item.projectId, name: item.name } },
      ),
    );
    return { ...item, reportCount: 0 };
  }

  async renameItem(input: {
    viewer: ProjectViewer;
    projectId: string;
    itemId: string;
    name: string;
    expectedUpdatedAt: Date;
    by: string;
  }): Promise<TestingItem> {
    const item = await this.liveItem(
      input.viewer,
      input.projectId,
      input.itemId,
    );
    const name = testingItemName(input.name);
    const now = this.clock();
    return this.store.renameItem({
      item,
      name,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.by,
      now,
      audit: this.audit(
        item.workspaceId,
        input.by,
        "testing_item.renamed",
        { type: "testing_item", id: item.id },
        now,
        { before: { name: item.name }, after: { name } },
      ),
    });
  }

  /** 409 `TESTING_ITEM_NOT_EMPTY` while it has reports (ADR CM-0013 §9). */
  async deleteItem(input: {
    viewer: ProjectViewer;
    projectId: string;
    itemId: string;
    by: string;
  }): Promise<void> {
    const item = await this.liveItem(
      input.viewer,
      input.projectId,
      input.itemId,
    );
    const now = this.clock();
    await this.store.deleteItem({
      item,
      by: input.by,
      now,
      audit: this.audit(
        item.workspaceId,
        input.by,
        "testing_item.deleted",
        { type: "testing_item", id: item.id },
        now,
        { before: { projectId: item.projectId, name: item.name } },
      ),
    });
  }

  // Reports.

  /** An item's reports, newest report date first, searched by name. */
  async reports(input: {
    viewer: ProjectViewer;
    projectId: string;
    itemId: string;
    q?: string;
    limit: number;
    after?: ListCursor;
    before?: ListCursor;
  }): Promise<{
    item: TestingItemWithCount;
    items: TestingReportView[];
    total: number;
    hasMore: boolean;
  }> {
    const item = await this.liveItem(
      input.viewer,
      input.projectId,
      input.itemId,
    );
    const q = input.q?.trim() ?? "";
    const page = await this.store.listReports({
      workspaceId: input.viewer.workspaceId,
      projectId: input.projectId,
      itemId: input.itemId,
      ...(q.length === 0 ? {} : { q }),
      limit: input.limit,
      ...(input.after == null ? {} : { after: input.after }),
      ...(input.before == null ? {} : { before: input.before }),
    });
    const counted =
      q.length === 0
        ? page.total
        : ((
            await this.store.listItems(
              input.viewer.workspaceId,
              input.projectId,
            )
          ).find((candidate) => candidate.id === item.id)?.reportCount ?? 0);
    return {
      item: { ...item, reportCount: counted },
      items: await this.views(input.viewer.workspaceId, page.items),
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  async report(
    viewer: ProjectViewer,
    projectId: string,
    reportId: string,
  ): Promise<TestingReportView> {
    const report = await this.liveReport(viewer, projectId, reportId);
    const [found] = await this.views(viewer.workspaceId, [report]);
    if (found == null) throw testingReportNotFound();
    return found;
  }

  /** Step 1 of uploading a report's file (CM-407). */
  async start(input: {
    viewer: ProjectViewer;
    projectId: string;
    fileName: string;
    bytes: number;
  }): Promise<StartedUpload> {
    await this.visible(input.viewer, input.projectId);
    return this.uploads.start(this.target(input.viewer, input.projectId), {
      fileName: input.fileName,
      bytes: input.bytes,
    });
  }

  async answerDirectUpload(input: {
    viewer: ProjectViewer;
    projectId: string;
    request: Request;
    body: unknown;
  }): Promise<unknown> {
    const { viewer, projectId } = input;
    return this.uploads.answerDirectUpload(this.target(viewer, projectId), {
      request: input.request,
      body: input.body,
      authorize: () => this.visible(viewer, projectId),
    });
  }

  async receive(input: {
    viewer: ProjectViewer;
    projectId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    if (this.uploads.takesDirectUploads())
      throw notFound("NOT_FOUND", "Uploads go straight to storage here.");
    await this.visible(input.viewer, input.projectId);
    await this.uploads.receive(this.target(input.viewer, input.projectId), {
      key: input.key,
      bytes: input.bytes,
    });
  }

  async receiveThumbnail(input: {
    viewer: ProjectViewer;
    projectId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void> {
    await this.visible(input.viewer, input.projectId);
    await this.uploads.receiveThumbnail(
      this.target(input.viewer, input.projectId),
      { key: input.key, bytes: input.bytes },
    );
  }

  /**
   * Step 3 for a new report: its details and the file at `key`. 403
   * `BACKDATED_CREATE_BLOCKED` / `FINANCIAL_PERIOD_CLOSED` for a report
   * date the member may not enter (the file is then dropped). A retry
   * returns the report already recorded (`created` false).
   */
  async addReport(input: {
    viewer: ProjectViewer;
    projectId: string;
    itemId: string;
    details: TestingReportDetailsInput;
    key: string;
    fileName: string;
    by: string;
  }): Promise<{ report: TestingReportView; created: boolean }> {
    const { viewer, projectId } = input;
    const { workspaceId } = viewer;
    await this.liveItem(viewer, projectId, input.itemId);
    const details = testingReportDetails(input.details);
    const { value, created } = await this.uploads.complete<TestingReport>(
      this.target(viewer, projectId),
      {
        key: input.key,
        fileName: input.fileName,
        recorded: this.recordedAt(viewer, projectId, input.key),
        record: async (upload) => {
          (await this.guard.forActor(viewer))("create", details.reportDate);
          const now = this.clock();
          const report: TestingReport = {
            id: newId(now.getTime()),
            workspaceId,
            projectId,
            itemId: input.itemId,
            ...details,
            fileKey: upload.key,
            fileName: upload.fileName,
            contentType: upload.contentType,
            bytes: upload.bytes,
            thumbKey: upload.thumbnail?.key ?? null,
            createdAt: now,
            updatedAt: now,
            createdBy: input.by,
          };
          const result = await this.store.addReport({
            report,
            files: this.files(upload, workspaceId, input.by, now),
            audit: this.audit(
              workspaceId,
              input.by,
              "testing_report.created",
              { type: "testing_report", id: report.id },
              now,
              { after: summary(report) },
            ),
          });
          return result === "duplicate" ? "duplicate" : report;
        },
      },
    );
    return { report: await this.report(viewer, projectId, value.id), created };
  }

  /**
   * Edits a report's details and, with `file`, replaces its file (the old
   * one leaves storage and the Gallery). The back-dated `edit` check runs
   * on the stored date and on the new one. 409 `TESTING_REPORT_CHANGED`
   * when someone saved in between.
   */
  async updateReport(input: {
    viewer: ProjectViewer;
    projectId: string;
    reportId: string;
    details: TestingReportDetailsInput;
    expectedUpdatedAt: Date;
    file?: { key: string; fileName: string } | null;
    by: string;
  }): Promise<TestingReportView> {
    const { viewer, projectId } = input;
    const { workspaceId } = viewer;
    const stored = await this.liveReport(viewer, projectId, input.reportId);
    const details = testingReportDetails(input.details);
    const check = await this.guard.forActor(viewer);
    check("edit", stored.reportDate);
    if (details.reportDate !== stored.reportDate)
      check("edit", details.reportDate);
    const audit = (report: TestingReport, now: Date) =>
      this.audit(
        workspaceId,
        input.by,
        "testing_report.updated",
        { type: "testing_report", id: report.id },
        now,
        { before: summary(stored), after: summary(report) },
      );

    const file = input.file;
    if (file == null) {
      const now = this.clock();
      const report: TestingReport = { ...stored, ...details, updatedAt: now };
      await this.store.updateReport({
        report,
        expectedUpdatedAt: input.expectedUpdatedAt,
        by: input.by,
        files: [],
        replaced: null,
        audit: audit(report, now),
      });
      return this.report(viewer, projectId, stored.id);
    }

    const { value } = await this.uploads.complete<TestingReport>(
      this.target(viewer, projectId),
      {
        key: file.key,
        fileName: file.fileName,
        recorded: this.recordedAt(viewer, projectId, file.key),
        record: async (upload) => {
          const now = this.clock();
          const report: TestingReport = {
            ...stored,
            ...details,
            fileKey: upload.key,
            fileName: upload.fileName,
            contentType: upload.contentType,
            bytes: upload.bytes,
            thumbKey: upload.thumbnail?.key ?? null,
            updatedAt: now,
          };
          const result = await this.store.updateReport({
            report,
            expectedUpdatedAt: input.expectedUpdatedAt,
            by: input.by,
            files: this.files(upload, workspaceId, input.by, now),
            replaced: stored,
            audit: audit(report, now),
          });
          return result === "duplicate" ? "duplicate" : report;
        },
      },
    );
    if (value.id !== stored.id) throw testingReportNotFound();
    if (value.fileKey !== stored.fileKey)
      await this.uploads.discard(
        stored.fileKey,
        ...(stored.thumbKey == null ? [] : [stored.thumbKey]),
      );
    return this.report(viewer, projectId, stored.id);
  }

  /** Tombstones the report (back-dated `edit` check), then its file goes. */
  async deleteReport(input: {
    viewer: ProjectViewer;
    projectId: string;
    reportId: string;
    by: string;
  }): Promise<void> {
    const report = await this.liveReport(
      input.viewer,
      input.projectId,
      input.reportId,
    );
    (await this.guard.forActor(input.viewer))("edit", report.reportDate);
    const now = this.clock();
    const removed = await this.store.deleteReport({
      report,
      by: input.by,
      now,
      audit: this.audit(
        report.workspaceId,
        input.by,
        "testing_report.deleted",
        { type: "testing_report", id: report.id },
        now,
        { before: summary(report) },
      ),
    });
    if (!removed) throw testingReportNotFound();
    await this.uploads.discard(
      report.fileKey,
      ...(report.thumbKey == null ? [] : [report.thumbKey]),
    );
  }

  /** The report's file, to show or download. */
  async readFile(
    viewer: ProjectViewer,
    projectId: string,
    reportId: string,
  ): Promise<{ report: TestingReportView; object: StoredObject }> {
    const report = await this.liveReport(viewer, projectId, reportId);
    const object = await this.uploads.read(report.fileKey);
    if (object == null) throw testingReportNotFound();
    return { report: view(report, new Map()), object };
  }

  /** The report image's WebP thumbnail; 404 `THUMBNAIL_NOT_FOUND` without one. */
  async readThumbnail(
    viewer: ProjectViewer,
    projectId: string,
    reportId: string,
  ): Promise<StoredObject> {
    const report = await this.liveReport(viewer, projectId, reportId);
    const object =
      report.thumbKey == null ? null : await this.uploads.read(report.thumbKey);
    if (object == null) throw thumbnailNotFound();
    return object;
  }
}
