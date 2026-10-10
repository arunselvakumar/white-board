import type { Prisma } from "@repo/construction-db";

import type { PurchaseRequestReadModel } from "../application/purchase-request-handlers";
import {
  DocumentPdfWriter,
  MARGIN,
  printDate,
  printQuantity,
  type Column,
} from "./purchase-order-pdf-writer";

/** The Company as a document header prints it. */
export type CompanyHeader = {
  name: string;
  address: string | null;
  gstin: string | null;
  mobile: string | null;
  email: string | null;
};

/**
 * The Company's profile (`construction_organization.company_profiles`),
 * read by id like the other plain reads of another context's table.
 */
export async function readCompanyHeader(
  db: Pick<Prisma.TransactionClient, "constructionOrganizationCompanyProfile">,
  workspaceId: string,
): Promise<CompanyHeader> {
  const row = await db.constructionOrganizationCompanyProfile.findUnique({
    where: { workspaceId },
    select: {
      name: true,
      address: true,
      gstin: true,
      mobile: true,
      email: true,
    },
  });
  return {
    name: row?.name ?? "",
    address: row?.address ?? null,
    gstin: row?.gstin ?? null,
    mobile: row?.mobile ?? null,
    email: row?.email ?? null,
  };
}

/** Company name, address and contacts at the top left; the title at the right. */
export function companyBlock(
  writer: DocumentPdfWriter,
  company: CompanyHeader,
  title: string,
  number: string,
): void {
  const top = writer.y;
  writer.text(title, { right: writer.right, size: 15, bold: true });
  writer.down(16);
  writer.text(number, { right: writer.right, size: 10, bold: true });
  writer.y = top;
  writer.paragraph(company.name, {
    size: 13,
    bold: true,
    width: writer.contentWidth * 0.6,
  });
  const lines = [
    company.address ?? "",
    [company.mobile, company.email].filter((v) => v != null).join(" · "),
    company.gstin == null ? "" : `GSTIN: ${company.gstin}`,
  ].filter((line) => line !== "");
  for (const line of lines)
    writer.paragraph(line, {
      muted: true,
      size: 8.5,
      width: writer.contentWidth * 0.6,
    });
  writer.down(6);
  writer.rule();
  writer.down(14);
}

export type PurchaseRequestPdfInput = {
  company: CompanyHeader;
  projectName: string;
  locationLabel: string | null;
  request: PurchaseRequestReadModel;
};

const APPROVAL_LABEL = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

const ORDER_LABEL = {
  not_ordered: "Not ordered",
  partially_ordered: "Partially ordered",
  ordered: "Ordered",
  excess_ordered: "Excess ordered",
} as const;

/** The Purchase Request PDF (CM-503): header, details, lines, remarks. */
export async function renderPurchaseRequestPdf(
  input: PurchaseRequestPdfInput,
): Promise<Uint8Array> {
  const { request, company } = input;
  const texts = [
    company.name,
    company.address ?? "",
    input.projectName,
    input.locationLabel ?? "",
    request.remark ?? "",
    request.commonRemark ?? "",
    request.createdByName ?? "",
    request.decidedByName ?? "",
    request.approval.rejectionReason ?? "",
    ...request.items.flatMap((item) => [
      item.materialName,
      item.uomName,
      item.remark ?? "",
    ]),
  ];
  const writer = await DocumentPdfWriter.create(
    `Purchase Request ${request.number}`,
    texts,
  );
  companyBlock(writer, company, "Purchase Request", request.number);
  const status =
    request.approval.status === "approved"
      ? `${APPROVAL_LABEL.approved} · ${ORDER_LABEL[request.orderStatus]}`
      : APPROVAL_LABEL[request.approval.status];
  writer.facts([
    ["Project", input.projectName],
    ["Purchase Request Date", printDate(request.requestDate)],
    ["Required Date", printDate(request.requiredDate)],
    ["Location", input.locationLabel ?? ""],
    ["Status", status],
    ["Raised by", request.createdByName ?? ""],
  ]);
  if (request.approval.decidedAt != null)
    writer.facts([
      [
        request.approval.status === "rejected" ? "Rejected by" : "Approved by",
        request.decidedByName ?? "",
      ],
      [
        request.approval.status === "rejected" ? "Reason" : "On",
        request.approval.status === "rejected"
          ? (request.approval.rejectionReason ?? "")
          : printDate(request.approval.decidedAt.toISOString().slice(0, 10)),
      ],
    ]);

  writer.heading("Materials");
  const width = writer.contentWidth;
  const columns: Column[] = [
    { label: "#", width: 22 },
    {
      label: "Material",
      width: request.separateRemarks ? width * 0.38 : width * 0.55,
    },
    { label: "Category", width: width * 0.17 },
    { label: "Quantity", width: width * 0.12, align: "right" },
    { label: "Unit", width: width * 0.1 },
  ];
  const used = columns.reduce((sum, column) => sum + column.width, 0);
  if (request.separateRemarks)
    columns.push({ label: "Remark", width: width - used });
  else {
    const last = columns.at(-1);
    if (last != null) last.width += width - used;
  }
  writer.table(
    columns,
    request.items.map((item, index) => {
      const row = [
        String(index + 1),
        item.materialName,
        item.categoryId == null
          ? ""
          : (request.categoryNames.get(item.categoryId) ?? ""),
        printQuantity(item.quantity),
        item.uomName,
      ];
      if (request.separateRemarks) row.push(item.remark ?? "");
      return row;
    }),
  );
  if (!request.separateRemarks && request.commonRemark != null) {
    writer.heading("Remark");
    writer.paragraph(request.commonRemark);
  }
  if (request.remark != null) {
    writer.heading(
      request.separateRemarks || request.commonRemark == null
        ? "Remark"
        : "Note",
    );
    writer.paragraph(request.remark);
  }
  writer.down(30);
  writer.room(30);
  writer.text("Requested by", { x: MARGIN, muted: true });
  writer.text("Approved by", { right: writer.right, muted: true });
  return writer.save(`${request.number} · ${company.name}`);
}
