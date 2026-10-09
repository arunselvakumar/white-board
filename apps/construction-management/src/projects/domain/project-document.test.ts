import { describe, expect, it } from "vitest";

import {
  isBlockedDocumentName,
  isProjectDocumentKey,
  projectDocumentKey,
  storedExtension,
} from "./project-document";

const WORKSPACE = "ws_Anugraha-1";
const PROJECT = "0199c3a0-0000-7000-8000-000000000001";
const OTHER_PROJECT = "0199c3a0-0000-7000-8000-000000000002";
const FILE = "0199c3a0-1111-7000-8000-00000000000a";

describe("projectDocumentKey", () => {
  it("files the object under the Company and Project with a fresh uuid", () => {
    const key = projectDocumentKey(WORKSPACE, PROJECT, "Work Order.PDF");
    expect(key).toMatch(
      new RegExp(
        `^companies/${WORKSPACE}/project-documents/${PROJECT}/[0-9a-f-]{36}\\.pdf$`,
      ),
    );
    expect(projectDocumentKey(WORKSPACE, PROJECT, "a.pdf")).not.toBe(key);
    expect(isProjectDocumentKey(key, WORKSPACE, PROJECT)).toBe(true);
  });

  it("uses `bin` for a missing or odd extension", () => {
    expect(storedExtension("README")).toBe("bin");
    expect(storedExtension("drawing.dwg")).toBe("dwg");
    expect(storedExtension("x.verylongextension")).toBe("bin");
    expect(storedExtension("scan.jp g")).toBe("bin");
    expect(storedExtension("ஒப்பந்தம்.ஆவணம்")).toBe("bin");
  });

  it("refuses ids that could leave the folder", () => {
    expect(() => projectDocumentKey("../x", PROJECT, "a.pdf")).toThrow();
  });
});

describe("isProjectDocumentKey", () => {
  const base = `companies/${WORKSPACE}/project-documents/${PROJECT}`;

  it("accepts only this Company's and this Project's keys", () => {
    expect(
      isProjectDocumentKey(`${base}/${FILE}.pdf`, WORKSPACE, PROJECT),
    ).toBe(true);
    expect(
      isProjectDocumentKey(`${base}/${FILE}.pdf`, "ws_other", PROJECT),
    ).toBe(false);
    expect(
      isProjectDocumentKey(`${base}/${FILE}.pdf`, WORKSPACE, OTHER_PROJECT),
    ).toBe(false);
  });

  it("refuses traversal, extra segments, bad uuids and programs", () => {
    for (const key of [
      `${base}/../${OTHER_PROJECT}/${FILE}.pdf`,
      `${base}/x/${FILE}.pdf`,
      `${base}/${FILE}.pdf/..`,
      `${base}/not-a-uuid.pdf`,
      `${base}/${FILE.toUpperCase()}.pdf`,
      `${base}/${FILE}`,
      `${base}/${FILE}.PDF`,
      `${base}/${FILE}.exe`,
      `${base}/${FILE}.pdf.exe`,
      `/${base}/${FILE}.pdf`,
      `companies/${WORKSPACE}/labour-documents/${FILE}.pdf`,
    ])
      expect(isProjectDocumentKey(key, WORKSPACE, PROJECT), key).toBe(false);
  });
});

describe("isBlockedDocumentName", () => {
  it("refuses programs by name, ignoring case", () => {
    for (const name of [
      "setup.exe",
      "SETUP.EXE",
      "report.PDF.exe",
      "run.Bat",
      "install.msi",
      "script.ps1",
      "app.apk",
      "tool.jar",
      "virus.exe. ",
    ])
      expect(isBlockedDocumentName(name), name).toBe(true);
  });

  it("lets documents, drawings and zips through", () => {
    for (const name of [
      "LOA.pdf",
      "BOQ.xlsx",
      "site.dwg",
      "papers.zip",
      "exe",
      "notes",
      "my.exe.pdf",
    ])
      expect(isBlockedDocumentName(name), name).toBe(false);
  });
});
