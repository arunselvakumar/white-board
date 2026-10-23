import { describe, expect, it } from "vitest";

import { groupByClient } from "./client-groups";

const p = (name: string, clientName: string | null) => ({ name, clientName });

describe("groupByClient (ADR CM-0027 §1)", () => {
  it("groups by client name, by name, with no client last", () => {
    const groups = groupByClient([
      p("Zen Villas", null),
      p("Kumari Heights", "Sri Balaji Developers"),
      p("NH-44 Culvert", "NHAI"),
      p("Vadasery Plots", null),
      p("Anugraha Residency", "Sri Balaji Developers"),
    ]);
    expect(
      groups.map((group) => [
        group.clientName,
        group.projects.map((item) => item.name),
      ]),
    ).toEqual([
      ["NHAI", ["NH-44 Culvert"]],
      ["Sri Balaji Developers", ["Kumari Heights", "Anugraha Residency"]],
      [null, ["Zen Villas", "Vadasery Plots"]],
    ]);
  });

  it("treats case and spacing as the same client, spelt as it first comes", () => {
    const groups = groupByClient([
      p("A", "  Sri Balaji   Developers "),
      p("B", "sri balaji developers"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "sri balaji developers",
      clientName: "Sri Balaji Developers",
    });
  });

  it("spells a client as the full list does, whatever is filtered out", () => {
    const shown = p("B", "sri balaji developers");
    const all = [p("A", "Sri Balaji Developers"), shown];
    const groups = groupByClient([shown], all);
    expect(groups[0]?.clientName).toBe("Sri Balaji Developers");
    expect(groups[0]?.projects).toEqual([shown]);
  });

  it("puts a blank client with no client", () => {
    const groups = groupByClient([p("A", "   "), p("B", null)]);
    expect(groups).toEqual([
      { key: "", clientName: null, projects: [p("A", "   "), p("B", null)] },
    ]);
  });

  it("returns no groups for no Projects", () => {
    expect(groupByClient([])).toEqual([]);
  });
});
