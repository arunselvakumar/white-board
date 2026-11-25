import { describe, expect, it } from "vitest";

import { PreschoolError } from "./errors";
import {
  assertRatingsUnique,
  assertReportComplete,
  domainName,
  observation,
  termOn,
  termSpan,
} from "./progress";

function errorOf(work: () => unknown): PreschoolError | null {
  try {
    work();
    return null;
  } catch (error) {
    if (error instanceof PreschoolError) return error;
    throw error;
  }
}

const YEAR = { startsOn: "2026-04-01", endsOn: "2027-03-31" };

describe("terms", () => {
  it("split the Academic Year in thirds", () => {
    expect(termSpan(YEAR, "term_1")).toEqual({
      startsOn: "2026-04-01",
      endsOn: "2026-07-31",
    });
    expect(termSpan(YEAR, "term_2")).toEqual({
      startsOn: "2026-08-01",
      endsOn: "2026-11-30",
    });
    expect(termSpan(YEAR, "term_3")).toEqual({
      startsOn: "2026-12-01",
      endsOn: "2027-03-31",
    });
  });

  it("follow a June start", () => {
    expect(
      termSpan({ startsOn: "2026-06-01", endsOn: "2027-05-31" }, "term_3"),
    ).toEqual({ startsOn: "2027-02-01", endsOn: "2027-05-31" });
  });

  it("find the term of a date", () => {
    expect(termOn(YEAR, "2026-11-25")).toBe("term_2");
    expect(termOn(YEAR, "2027-04-01")).toBeNull();
  });
});

describe("Observations", () => {
  it("need a note and a day that is not ahead", () => {
    expect(
      observation(
        { note: "  Stacked six blocks ", observedOn: "2026-11-25" },
        "2026-11-25",
      ),
    ).toEqual({ note: "Stacked six blocks", observedOn: "2026-11-25" });
    expect(
      errorOf(() =>
        observation({ note: " ", observedOn: "2026-11-25" }, "2026-11-25"),
      )?.code,
    ).toBe("OBSERVATION_NOTE_REQUIRED");
    expect(
      errorOf(() =>
        observation({ note: "x", observedOn: "2026-11-26" }, "2026-11-25"),
      )?.code,
    ).toBe("OBSERVATION_DATE_IN_FUTURE");
  });
});

describe("Development Domains and Progress Reports", () => {
  it("tidy a Domain's name", () => {
    expect(domainName("  Music   and  movement ")).toBe("Music and movement");
    expect(errorOf(() => domainName(" "))?.code).toBe("DOMAIN_NAME_REQUIRED");
  });

  it("rate each Domain once", () => {
    expect(
      errorOf(() => {
        assertRatingsUnique([{ domainId: "a" }, { domainId: "a" }]);
      })?.code,
    ).toBe("RATING_REPEATED");
  });

  it("publish only when every Domain in use is rated", () => {
    expect(
      errorOf(() => {
        assertReportComplete(["a", "b"], ["a", "b", "old"]);
      }),
    ).toBeNull();
    const incomplete = errorOf(() => {
      assertReportComplete(["a", "b", "c"], ["a"]);
    });
    expect(incomplete?.code).toBe("PROGRESS_REPORT_INCOMPLETE");
    expect(incomplete?.kind).toBe("conflict");
    expect(incomplete?.details).toEqual({ missingDomainIds: ["b", "c"] });
  });
});
