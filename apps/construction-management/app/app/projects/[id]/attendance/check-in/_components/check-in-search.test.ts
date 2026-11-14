import { describe, expect, it } from "vitest";

import type { CheckInPerson } from "@/src/queries/check-ins";

import { matchesPerson } from "./check-in-search";

const murugan: CheckInPerson = {
  kind: "labour",
  id: "0199c4a0-0000-7000-8000-0000000000a1",
  name: "Murugan Ganesan",
  role: "Mason",
  code: "L-0042",
  phone: "+919876543210",
  hasPhoto: false,
  state: { status: "none", since: null },
  entriesToday: 0,
};

describe("matchesPerson", () => {
  it("matches everyone on an empty search", () => {
    expect(matchesPerson(murugan, "  ")).toBe(true);
  });

  it("matches any part of the name, role or ID, ignoring case", () => {
    expect(matchesPerson(murugan, "gan")).toBe(true);
    expect(matchesPerson(murugan, "MASON")).toBe(true);
    expect(matchesPerson(murugan, "l-004")).toBe(true);
    expect(matchesPerson(murugan, "carpenter")).toBe(false);
  });

  it("matches the phone on digits alone, from three digits up", () => {
    expect(matchesPerson(murugan, "98765")).toBe(true);
    expect(matchesPerson(murugan, "+91 98765 43210")).toBe(true);
    expect(matchesPerson(murugan, "098765")).toBe(true);
    expect(matchesPerson(murugan, "543")).toBe(true);
    expect(matchesPerson(murugan, "54")).toBe(false);
    expect(matchesPerson(murugan, "11111")).toBe(false);
  });

  it("does not read digits inside words as a phone", () => {
    expect(matchesPerson(murugan, "Mason 987")).toBe(false);
  });

  it("matches a person with no phone, role or ID by name", () => {
    const vendor: CheckInPerson = {
      ...murugan,
      kind: "vendor",
      role: "Vendor",
      code: null,
      phone: null,
    };
    expect(matchesPerson(vendor, "murugan")).toBe(true);
    expect(matchesPerson(vendor, "98765")).toBe(false);
  });
});
