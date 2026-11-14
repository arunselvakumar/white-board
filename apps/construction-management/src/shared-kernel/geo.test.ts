import { describe, expect, it } from "vitest";

import { haversineMetres, isLatitude, isLongitude } from "./geo";

describe("haversineMetres", () => {
  it("is zero for the same point", () => {
    const point = { latitude: 13.0827, longitude: 80.2707 };
    expect(haversineMetres(point, point)).toBe(0);
  });

  it("measures short fence distances to the metre", () => {
    // 0.001° of latitude is about 111.2 m anywhere.
    const office = { latitude: 13.0827, longitude: 80.2707 };
    const gate = { latitude: 13.0837, longitude: 80.2707 };
    expect(haversineMetres(office, gate)).toBeCloseTo(111.2, 0);
    expect(haversineMetres(gate, office)).toBeCloseTo(
      haversineMetres(office, gate),
      9,
    );
  });

  it("measures city distances", () => {
    // Chennai Central to Bengaluru City station: about 290 km.
    const chennai = { latitude: 13.0827, longitude: 80.2752 };
    const bengaluru = { latitude: 12.9784, longitude: 77.5717 };
    const km = haversineMetres(chennai, bengaluru) / 1000;
    expect(km).toBeGreaterThan(285);
    expect(km).toBeLessThan(300);
  });
});

describe("coordinates", () => {
  it("are within the globe", () => {
    expect(isLatitude(90)).toBe(true);
    expect(isLatitude(-90.0001)).toBe(false);
    expect(isLongitude(180)).toBe(true);
    expect(isLongitude(Number.NaN)).toBe(false);
  });
});
