import { describe, expect, it, vi } from "vitest";

import { QueryHttpError } from "./http";
import type { StudentResponse } from "./students";
import { admitStudent } from "./student-admission";

const student = { id: "student_one", name: "Anita" } as StudentResponse;
const input = { name: "Anita", phone: "9876543210" };

describe("Add Student with optional Enrollment", () => {
  it("saves a Student without an Enrollment when no Batch is selected", async () => {
    const create = vi.fn(() => Promise.resolve(student));
    const enroll = vi.fn();
    const hasEnrollment = vi.fn();
    const result = await admitStudent(input, null, undefined, undefined, {
      create,
      enroll,
      hasEnrollment,
    });
    expect(result).toEqual({ student, enrollment: "skipped" });
    expect(create).toHaveBeenCalledOnce();
    expect(enroll).not.toHaveBeenCalled();
  });

  it("creates an Enrollment with Batch defaults after saving the Student", async () => {
    const calls: string[] = [];
    const create = vi.fn(() => {
      calls.push("student");
      return Promise.resolve(student);
    });
    const enroll = vi.fn(() => {
      calls.push("enrollment");
      return Promise.resolve();
    });
    const hasEnrollment = vi.fn(() => Promise.resolve(false));
    const result = await admitStudent(
      input,
      "batch_one",
      undefined,
      undefined,
      { create, enroll, hasEnrollment },
    );
    expect(calls).toEqual(["student", "enrollment"]);
    expect(enroll).toHaveBeenCalledWith({
      studentId: student.id,
      batchId: "batch_one",
      timingSource: "batch",
      classModeOverride: null,
    });
    expect(result).toEqual({ student, enrollment: "enrolled" });
  });

  it("preserves the saved Student when Enrollment fails so retry cannot create a duplicate", async () => {
    const create = vi.fn(() => Promise.resolve(student));
    const enroll = vi.fn(() => Promise.reject(new Error("Batch is full")));
    const hasEnrollment = vi.fn(() => Promise.resolve(false));
    const result = await admitStudent(
      input,
      "batch_one",
      undefined,
      undefined,
      { create, enroll, hasEnrollment },
    );
    expect(result).toMatchObject({
      student,
      enrollment: "failed",
      error: new Error("Batch is full"),
      uncertain: true,
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("recognizes an Enrollment that succeeded after its response was lost", async () => {
    const create = vi.fn(() => Promise.resolve(student));
    const enroll = vi.fn(() => Promise.reject(new TypeError("Network error")));
    const hasEnrollment = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const result = await admitStudent(
      input,
      "batch_one",
      "request_one",
      undefined,
      {
        create,
        enroll,
        hasEnrollment,
      },
    );
    expect(result.enrollment).toBe("enrolled");
    expect(create).toHaveBeenCalledWith(input, "request_one");
    expect(hasEnrollment).toHaveBeenCalledTimes(2);
  });

  it("allows another Batch after a confirmed Enrollment rejection", async () => {
    const create = vi.fn(() => Promise.resolve(student));
    const enroll = vi.fn(() =>
      Promise.reject(
        new QueryHttpError(409, {
          code: "BATCH_AT_CAPACITY",
          message: "Batch is full",
        }),
      ),
    );
    const hasEnrollment = vi.fn(() => Promise.resolve(false));
    const result = await admitStudent(
      input,
      "batch_one",
      undefined,
      undefined,
      {
        create,
        enroll,
        hasEnrollment,
      },
    );
    expect(result).toMatchObject({ enrollment: "failed", uncertain: false });
  });
});
