import type { PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { companyFileKey, type ObjectStorage } from "@/src/shared-kernel/files";
import { recordStoredFile } from "@/src/shared-kernel/files/stored-files";

import type {
  PayslipFiles,
  SalaryCompanyProfile,
  SalaryCompanyReader,
} from "../application/salary-run-ports";

export const PDF_CONTENT_TYPE = "application/pdf";

/**
 * Payslip PDFs in the Company's private storage (CM-316), under
 * `companies/<id>/payslips/`, counted in storage usage (`stored_files`,
 * kind `payslip`). A slip's key is set once and never replaced, so the
 * payslip a member downloaded is the one kept; the slip's `updatedAt` is
 * not touched, as nothing on the slip changed.
 */
export class PrismaPayslipFiles implements PayslipFiles {
  constructor(
    private readonly db: PrismaClient,
    private readonly storage: ObjectStorage,
  ) {}

  async read(key: string): Promise<Uint8Array | null> {
    const object = await this.storage.get(key);
    if (object == null) return null;
    return new Uint8Array(await new Response(object.body).arrayBuffer());
  }

  async store(input: {
    workspaceId: string;
    slipId: string;
    bytes: Uint8Array;
    by: string;
    now: Date;
  }): Promise<{ key: string; ours: boolean }> {
    const { workspaceId, slipId, bytes, by, now } = input;
    const key = companyFileKey(workspaceId, "payslips", "pdf");
    await this.storage.put(key, bytes, PDF_CONTENT_TYPE);
    const ours = await this.db.$transaction(async (tx) => {
      const updated = await tx.constructionHrmsSalarySlip.updateMany({
        where: { id: slipId, workspaceId, payslipKey: null },
        data: { payslipKey: key },
      });
      if (updated.count === 0) return false;
      await recordStoredFile(tx, {
        workspaceId,
        key,
        kind: "payslip",
        contentType: PDF_CONTENT_TYPE,
        bytes: bytes.byteLength,
        createdBy: by,
        createdAt: now,
      });
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action: "salary_slip.payslip_stored",
        entityType: "salary_slip",
        entityId: slipId,
        after: { payslipKey: key, bytes: bytes.byteLength },
        occurredAt: now,
      });
      return true;
    });
    if (ours) return { key, ours };
    await this.storage.delete(key).catch(() => undefined);
    const row = await this.db.constructionHrmsSalarySlip.findFirst({
      where: { id: slipId, workspaceId },
      select: { payslipKey: true },
    });
    return { key: row?.payslipKey ?? key, ours: false };
  }
}

/** The Company as printed on payslips: a plain read of its profile. */
export class PrismaSalaryCompanyReader implements SalaryCompanyReader {
  constructor(
    private readonly db: Pick<
      PrismaClient,
      "constructionOrganizationCompanyProfile"
    >,
  ) {}

  async profileFor(workspaceId: string): Promise<SalaryCompanyProfile> {
    const row = await this.db.constructionOrganizationCompanyProfile.findUnique(
      {
        where: { workspaceId },
        select: { name: true, currency: true, timezone: true },
      },
    );
    return {
      name: row?.name ?? "",
      currency: row?.currency ?? "INR",
      timezone: row?.timezone ?? "Asia/Kolkata",
    };
  }
}
