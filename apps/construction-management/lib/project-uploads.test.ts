import { describe, expect, it } from "vitest";

import { acceptOf, checkUploadFile } from "./project-uploads";

const MB = 1024 * 1024;

describe("project upload checks (CM-408, CM-409)", () => {
  it("takes drawings as PDF, images, DWG or DXF up to 100 MB", () => {
    expect(checkUploadFile("drawing", { name: "GF.DWG", size: 10 })).toBeNull();
    expect(
      checkUploadFile("drawing", { name: "GF.dxf", size: 100 * MB }),
    ).toBeNull();
    expect(
      checkUploadFile("drawing", { name: "GF.pdf", size: 100 * MB + 1 })?.code,
    ).toBe("FILE_TOO_LARGE");
    expect(checkUploadFile("drawing", { name: "BOQ.zip", size: 1 })?.code).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
    expect(acceptOf("drawing")).toBe(".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf");
  });

  it("takes testing reports as a PDF or image up to 25 MB", () => {
    expect(
      checkUploadFile("testing_report", { name: "cube.jpg", size: 10 }),
    ).toBeNull();
    expect(
      checkUploadFile("testing_report", { name: "cube.dwg", size: 10 })?.code,
    ).toBe("FILE_TYPE_NOT_ALLOWED");
    expect(
      checkUploadFile("testing_report", { name: "cube.pdf", size: 0 })?.code,
    ).toBe("FILE_EMPTY");
    expect(
      checkUploadFile("testing_report", { name: "cube.pdf", size: 25 * MB + 1 })
        ?.code,
    ).toBe("FILE_TOO_LARGE");
  });
});
