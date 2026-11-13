import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import type { PermissionGrants } from "@/src/shared-kernel/access";
import { thumbnailKeyOf } from "@/src/shared-kernel/attachments/attachment-key";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { storedBytes } from "@/src/shared-kernel/files/stored-files";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { bytesOf, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getCompany } from "../companies/[id]/route";
import { POST as createCompany } from "../companies/route";
import { POST as removeFile } from "./[id]/files/[fileId]/delete/route";
import { GET as readFile } from "./[id]/files/[fileId]/route";
import { POST as captionFile } from "./[id]/files/[fileId]/update/route";
import { POST as completeUpload } from "./[id]/files/route";
import { POST as receiveUpload } from "./[id]/files/uploads/app/route";
import { POST as presignUpload } from "./[id]/files/uploads/presign/route";
import { POST as startUpload } from "./[id]/files/uploads/route";
import { POST as receiveThumbnail } from "./[id]/files/uploads/thumbnail/route";
import { POST as deleteVisit } from "./[id]/delete/route";
import { GET as getVisit } from "./[id]/route";
import { POST as createVisit } from "./route";

const VISITS = `${TEST_ORIGIN}/api/construction/marketing/visits`;
const COMPANIES = `${TEST_ORIGIN}/api/construction/marketing/companies`;
const MB = 1024 * 1024;

const PDF = new TextEncoder().encode("%PDF-1.7\nRequirement sheet\n%%EOF");
/** A RIFF/WEBP header: the app sniffs only the signature. */
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  0x38, 0x20,
]);

type Session = { cookie: string };

type VisitFile = {
  id: string;
  fileName: string;
  contentType: string;
  caption: string | null;
  canChange: boolean;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const visitParams = (id: string) => ({ params: Promise.resolve({ id }) });
const fileParams = (id: string, fileId: string) => ({
  params: Promise.resolve({ id, fileId }),
});

const MARKETING: PermissionGrants = {
  "marketing.visits": ["create", "read", "update"],
  "marketing.companies": ["create", "read", "update"],
};

async function aVisit(who: Session, visitorIds?: string[]) {
  const company = await json<{ id: string }>(
    await createCompany(
      jsonRequest(COMPANIES, who.cookie, {
        name: `Kaveri Steel ${randomUUID().slice(0, 6)}`,
      }),
    ),
  );
  const visit = await json<{ id: string }>(
    await createVisit(
      jsonRequest(VISITS, who.cookie, {
        status: "planned",
        prospectCompanyId: company.id,
        visitAt: new Date(Date.now() + 86_400_000).toISOString(),
        ...(visitorIds == null ? {} : { visitorIds }),
      }),
    ),
  );
  return { companyId: company.id, visitId: visit.id };
}

function start(
  who: Session,
  visitId: string,
  fileName: string,
  bytes: number,
): Promise<Response> {
  return startUpload(
    jsonRequest(`${VISITS}/${visitId}/files/uploads`, who.cookie, {
      fileName,
      bytes,
    }),
    visitParams(visitId),
  );
}

/** Raw bytes to one of our upload routes, as the browser sends them. */
function bytesRequest(
  who: Session,
  url: string,
  bytes: Uint8Array<ArrayBuffer>,
): Request {
  return new Request(`${TEST_ORIGIN}${url}`, {
    method: "POST",
    headers: { cookie: who.cookie, "content-type": "application/octet-stream" },
    body: bytes,
  });
}

type Started = { key: string; url: string; thumbnailUrl: string };

/** Start and send: the key awaits completion. */
async function send(
  who: Session,
  visitId: string,
  fileName: string,
  bytes: Uint8Array<ArrayBuffer>,
  declared = bytes.byteLength,
): Promise<Started> {
  const started = await start(who, visitId, fileName, declared);
  expect(started.status).toBe(StatusCodes.CREATED);
  const body = await json<{
    key: string;
    upload: { via: string; url: string };
    thumbnailUrl: string;
  }>(started);
  expect(body.upload.via).toBe("app");
  const sent = await receiveUpload(
    bytesRequest(who, body.upload.url, bytes),
    visitParams(visitId),
  );
  expect(sent.status).toBe(StatusCodes.NO_CONTENT);
  return {
    key: body.key,
    url: body.upload.url,
    thumbnailUrl: body.thumbnailUrl,
  };
}

function finish(
  who: Session,
  visitId: string,
  key: string,
  fileName: string,
  caption: string | null = null,
): Promise<Response> {
  return completeUpload(
    jsonRequest(`${VISITS}/${visitId}/files`, who.cookie, {
      key,
      fileName,
      caption,
    }),
    visitParams(visitId),
  );
}

/** The browser's flow through our routes: start, send, thumbnail, finish. */
async function upload(
  who: Session,
  visitId: string,
  fileName: string,
  bytes: Uint8Array<ArrayBuffer>,
  options: { caption?: string; declared?: number; thumbnail?: boolean } = {},
): Promise<Response> {
  const sent = await send(who, visitId, fileName, bytes, options.declared);
  if (options.thumbnail === true) {
    const thumb = await receiveThumbnail(
      bytesRequest(who, sent.thumbnailUrl, WEBP),
      visitParams(visitId),
    );
    expect(thumb.status).toBe(StatusCodes.NO_CONTENT);
  }
  return finish(who, visitId, sent.key, fileName, options.caption ?? null);
}

describe("Visit photos and files (ADR CM-0040 §9)", () => {
  it("adds a photo and a PDF, serves them, and lists them on the Visit, its history and the company", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const { companyId, visitId } = await aVisit(ravi);

    const photo = await upload(ravi, visitId, "card.png", pngBytes(2048), {
      caption: "  Visiting card ",
    });
    expect(photo.status).toBe(StatusCodes.CREATED);
    const added = await json<VisitFile>(photo);
    expect(added).toMatchObject({
      fileName: "card.png",
      contentType: "image/png",
      caption: "Visiting card",
      canChange: true,
    });
    expect((await upload(ravi, visitId, "requirement.pdf", PDF)).status).toBe(
      StatusCodes.CREATED,
    );

    const served = await readFile(
      jsonRequest(`${VISITS}/${visitId}/files/${added.id}`, ravi.cookie),
      fileParams(visitId, added.id),
    );
    expect(served.status).toBe(StatusCodes.OK);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect((await bytesOf(served)).byteLength).toBe(2048);

    const visit = await json<{
      files: { fileName: string }[];
      history: { action: string; fileName: string | null }[];
    }>(
      await getVisit(
        jsonRequest(`${VISITS}/${visitId}`, ravi.cookie),
        visitParams(visitId),
      ),
    );
    expect(visit.files.map((file) => file.fileName)).toEqual([
      "card.png",
      "requirement.pdf",
    ]);
    expect(
      visit.history
        .filter((item) => item.action === "file_added")
        .map((item) => item.fileName),
    ).toEqual(["requirement.pdf", "card.png"]);

    const company = await json<{ timeline: { kind: string }[] }>(
      await getCompany(
        jsonRequest(`${COMPANIES}/${companyId}`, ravi.cookie),
        visitParams(companyId),
      ),
    );
    expect(
      company.timeline.filter((item) => item.kind === "file"),
    ).toHaveLength(2);
    await expect(
      prisma.constructionOrganizationStoredFile.count({
        where: { key: { contains: `/marketing_visit/${visitId}/` } },
      }),
    ).resolves.toBe(2);
  }, 20_000);

  it("holds images to 10 MB and PDFs to 25 MB, by name at start and by content at finish", async () => {
    const owner = await ownerWithCompany();
    const { visitId } = await aVisit(owner);

    const bigImage = await start(owner, visitId, "site.jpg", 10 * MB + 1);
    expect(bigImage.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(bigImage)).toMatchObject({
      code: "FILE_TOO_LARGE",
      details: { maxBytes: 10 * MB },
    });
    expect((await start(owner, visitId, "brochure.pdf", 20 * MB)).status).toBe(
      StatusCodes.CREATED,
    );
    const tooBigPdf = await start(owner, visitId, "tender.pdf", 25 * MB + 1);
    expect(await json(tooBigPdf)).toMatchObject({ code: "FILE_TOO_LARGE" });

    // An 11 MB image sent under a PDF's name is caught by its content.
    const disguised = await upload(
      owner,
      visitId,
      "scan.pdf",
      pngBytes(11 * MB),
    );
    expect(disguised.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(disguised)).toMatchObject({
      code: "FILE_TOO_LARGE",
      details: { maxBytes: 10 * MB },
    });
  }, 20_000);

  it("keeps 20 files a Visit", async () => {
    const owner = await ownerWithCompany();
    const { visitId } = await aVisit(owner);
    await prisma.constructionMarketingVisitFile.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        visitId,
        fileKey: `companies/${owner.workspaceId}/marketing_visit/${visitId}/${randomUUID()}.png`,
        fileName: `photo-${String(index)}.png`,
        contentType: "image/png",
        bytes: 64,
        createdBy: owner.userId,
      })),
    });
    const full = await start(owner, visitId, "one-more.png", 64);
    expect(full.status).toBe(StatusCodes.CONFLICT);
    expect(await json(full)).toMatchObject({ code: "VISIT_FILE_LIMIT" });
  });

  it("serves a Visit's files only to those who may see the Visit, and lets only the uploader or View all change one", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const priya = await memberWith(owner, MARKETING);
    const anil = await memberWith(owner, MARKETING);
    const { visitId } = await aVisit(ravi, [ravi.memberId, priya.memberId]);
    const file = await json<VisitFile>(
      await upload(ravi, visitId, "card.png", pngBytes()),
    );

    // Anil is not on it: 404 on every route, as for the Visit.
    const waiting = await send(ravi, visitId, "plant.png", pngBytes());
    const asAnil: [string, Promise<Response>][] = [
      [
        "read",
        readFile(
          jsonRequest(`${VISITS}/${visitId}/files/${file.id}`, anil.cookie),
          fileParams(visitId, file.id),
        ),
      ],
      ["start", start(anil, visitId, "x.png", 64)],
      [
        "presign",
        presignUpload(
          jsonRequest(
            `${VISITS}/${visitId}/files/uploads/presign`,
            anil.cookie,
            {
              type: "blob.generate-presigned-url",
              payload: {
                pathname: waiting.key,
                multipart: false,
                clientPayload: null,
              },
            },
          ),
          visitParams(visitId),
        ),
      ],
      [
        "app upload",
        receiveUpload(
          bytesRequest(anil, waiting.url, pngBytes()),
          visitParams(visitId),
        ),
      ],
      [
        "thumbnail",
        receiveThumbnail(
          bytesRequest(anil, waiting.thumbnailUrl, WEBP),
          visitParams(visitId),
        ),
      ],
      ["finish", finish(anil, visitId, waiting.key, "plant.png")],
      [
        "caption",
        captionFile(
          jsonRequest(
            `${VISITS}/${visitId}/files/${file.id}/update`,
            anil.cookie,
            { caption: "Mine now" },
          ),
          fileParams(visitId, file.id),
        ),
      ],
      [
        "remove",
        removeFile(
          jsonRequest(
            `${VISITS}/${visitId}/files/${file.id}/delete`,
            anil.cookie,
            {},
          ),
          fileParams(visitId, file.id),
        ),
      ],
    ];
    for (const [route, answered] of asAnil) {
      const response = await answered;
      expect(response.status, route).toBe(StatusCodes.NOT_FOUND);
      expect(await json(response), route).toMatchObject({
        code: "VISIT_NOT_FOUND",
      });
    }

    // A key minted for another Visit does not finish on this one.
    const other = await aVisit(ravi);
    const elsewhere = await send(ravi, other.visitId, "gate.png", pngBytes());
    const misplaced = await finish(ravi, visitId, elsewhere.key, "gate.png");
    expect(misplaced.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(misplaced)).toMatchObject({ code: "UPLOAD_KEY_INVALID" });

    // Priya went on it: she sees and adds, but cannot change Ravi's file.
    const seen = await readFile(
      jsonRequest(`${VISITS}/${visitId}/files/${file.id}`, priya.cookie),
      fileParams(visitId, file.id),
    );
    expect(seen.status).toBe(StatusCodes.OK);
    const refused = await removeFile(
      jsonRequest(
        `${VISITS}/${visitId}/files/${file.id}/delete`,
        priya.cookie,
        {},
      ),
      fileParams(visitId, file.id),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);

    const captioned = await captionFile(
      jsonRequest(`${VISITS}/${visitId}/files/${file.id}/update`, ravi.cookie, {
        caption: "Plant gate",
      }),
      fileParams(visitId, file.id),
    );
    expect((await json<VisitFile>(captioned)).caption).toBe("Plant gate");

    // The Owner holds View all and removes it.
    const removed = await removeFile(
      jsonRequest(
        `${VISITS}/${visitId}/files/${file.id}/delete`,
        owner.cookie,
        {},
      ),
      fileParams(visitId, file.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await readFile(
      jsonRequest(`${VISITS}/${visitId}/files/${file.id}`, ravi.cookie),
      fileParams(visitId, file.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    // A removed file's caption is not changed, and no event is written.
    const late = await captionFile(
      jsonRequest(`${VISITS}/${visitId}/files/${file.id}/update`, ravi.cookie, {
        caption: "Too late",
      }),
      fileParams(visitId, file.id),
    );
    expect(late.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(late)).toMatchObject({ code: "VISIT_FILE_NOT_FOUND" });
    await expect(
      prisma.constructionOrganizationStoredFile.count({
        where: {
          key: { contains: `/marketing_visit/${visitId}/` },
          deletedAt: null,
        },
      }),
    ).resolves.toBe(0);
  });

  it("takes a thumbnail only while its file awaits finishing", async () => {
    const owner = await ownerWithCompany();
    const { visitId } = await aVisit(owner);
    const sent = await send(owner, visitId, "card.png", pngBytes());
    expect((await finish(owner, visitId, sent.key, "card.png")).status).toBe(
      StatusCodes.CREATED,
    );
    const late = await receiveThumbnail(
      bytesRequest(owner, sent.thumbnailUrl, WEBP),
      visitParams(visitId),
    );
    expect(late.status).toBe(StatusCodes.CONFLICT);
    expect(await json(late)).toMatchObject({
      code: "VISIT_FILE_ALREADY_SAVED",
    });
    expect(await objectStorage().head(thumbnailKeyOf(sent.key))).toBeNull();
  }, 20_000);

  it("removes a deleted Visit's files, so they stop counting towards the Company's storage", async () => {
    const owner = await ownerWithCompany();
    const { visitId } = await aVisit(owner);
    const added = await json<VisitFile>(
      await upload(owner, visitId, "card.png", pngBytes(2048), {
        thumbnail: true,
      }),
    );
    const where = { key: { contains: `/marketing_visit/${visitId}/` } };
    const rows = await prisma.constructionOrganizationStoredFile.findMany({
      where,
    });
    expect(rows).toHaveLength(2);
    const before = await storedBytes(prisma, owner.workspaceId);

    const visit = await json<{ updatedAt: string }>(
      await getVisit(
        jsonRequest(`${VISITS}/${visitId}`, owner.cookie),
        visitParams(visitId),
      ),
    );
    const deleted = await deleteVisit(
      jsonRequest(`${VISITS}/${visitId}/delete`, owner.cookie, {
        expectedUpdatedAt: visit.updatedAt,
      }),
      visitParams(visitId),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);

    const served = await readFile(
      jsonRequest(`${VISITS}/${visitId}/files/${added.id}`, owner.cookie),
      fileParams(visitId, added.id),
    );
    expect(served.status).toBe(StatusCodes.NOT_FOUND);
    await expect(
      prisma.constructionOrganizationStoredFile.count({
        where: { ...where, deletedAt: null },
      }),
    ).resolves.toBe(0);
    expect(await storedBytes(prisma, owner.workspaceId)).toBe(
      before - rows.reduce((sum, row) => sum + row.bytes, 0),
    );
    await expect(
      prisma.constructionMarketingVisitFile.findUniqueOrThrow({
        where: { id: added.id },
        select: { deletedAt: true },
      }),
    ).resolves.toMatchObject({ deletedAt: expect.any(Date) as unknown });
    for (const row of rows)
      expect(await objectStorage().head(row.key)).toBeNull();
    const audit =
      await prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
        where: {
          workspaceId: owner.workspaceId,
          entityId: visitId,
          action: "visit.deleted",
        },
      });
    expect(audit.before).toMatchObject({ fileIds: [added.id] });
  }, 20_000);

  it("refuses anything but an image or a PDF, and uploads without Visits update", async () => {
    const owner = await ownerWithCompany();
    const reader = await memberWith(owner, {
      "marketing.visits": ["read", "view_all"],
    });
    const { visitId } = await aVisit(owner);
    const sheet = await start(owner, visitId, "rates.xlsx", 2048);
    expect(await json(sheet)).toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    expect((await start(reader, visitId, "card.png", 64)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });
});
