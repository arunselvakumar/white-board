import { describe, expect, it } from "vitest";

import { groupByClient, sameClientName } from "./client-groups";

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

  it("treats accents as the same client, as the sort does", () => {
    const groups = groupByClient([
      p("A", "Café Builders"),
      p("B", "Cafe Builders"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.clientName).toBe("Café Builders");
  });

  it("keeps Tamil names apart that differ by a vowel sign", () => {
    const groups = groupByClient([
      p("A", "கா கட்டுமானம்"),
      p("B", "க கட்டுமானம்"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps numbered clients apart", () => {
    expect(groupByClient([p("A", "Block 01"), p("B", "Block 1")])).toHaveLength(
      2,
    );
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

describe("sameClientName (ADR CM-0027 §1, CM-0040 §12)", () => {
  it("ignores case and spacing", () => {
    expect(
      sameClientName("Sri Balaji Developers", "  sri balaji   DEVELOPERS "),
    ).toBe(true);
  });

  it("ignores accents", () => {
    expect(sameClientName("Café Builders", "Cafe Builders")).toBe(true);
  });

  it("keeps Tamil names apart that differ by a vowel sign", () => {
    expect(sameClientName("கா கட்டுமானம்", "க கட்டுமானம்")).toBe(false);
    expect(sameClientName("கா கட்டுமானம்", "கா கட்டுமானம்")).toBe(true);
  });

  it("keeps numbered clients apart", () => {
    expect(sameClientName("Block 01", "Block 1")).toBe(false);
  });

  it("keeps other names apart", () => {
    expect(sameClientName("Sri Balaji Developers", "Sri Balaji Devs")).toBe(
      false,
    );
  });

  it("never matches a blank or missing name", () => {
    expect(sameClientName(null, null)).toBe(false);
    expect(sameClientName("", "")).toBe(false);
    expect(sameClientName("   ", " ")).toBe(false);
    expect(sameClientName("Sri Balaji Developers", null)).toBe(false);
    expect(sameClientName(null, "Sri Balaji Developers")).toBe(false);
  });
});
