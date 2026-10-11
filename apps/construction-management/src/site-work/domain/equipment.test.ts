import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  availabilityChange,
  equipmentFields,
  equipmentState,
  type EquipmentFieldsInput,
} from "./equipment";

const OWNED: EquipmentFieldsInput = {
  ownership: "owned",
  name: " JCB  3DX ",
  equipmentNumber: "TN-09-AB-1234",
  purchaseYear: 2019,
  fuelType: "diesel",
  fuelUnit: "litre",
  utilisationBasis: "hourly",
  workingTimeMethod: "both",
  targetValue: "8",
  targetUnit: "hours_per_day",
  minUtilisationPct: "60",
  expectedFuelEfficiency: "6.5",
};

const RENTED: EquipmentFieldsInput = {
  ownership: "rented",
  name: "Tipper",
  equipmentNumber: "TN-10-X-9",
  utilisationBasis: "trip",
  workingTimeMethod: "meter_reading",
  hirePartyId: "0190f1f0-0000-7000-8000-000000000001",
  hireBasis: "trip",
  hireRate: 150_000,
  idleChargeable: true,
};

function refusal(fn: () => unknown): { code: string; field: unknown } {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("Expected a refusal");
}

describe("equipmentFields", () => {
  it("tidies an owned machine", () => {
    const fields = equipmentFields(OWNED, 2026);
    expect(fields).toMatchObject({
      name: "JCB 3DX",
      purchaseYear: 2019,
      targetValue: "8.00",
      targetUnit: "hours_per_day",
      minUtilisationPct: "60.00",
      expectedFuelEfficiency: "6.500",
      hirePartyId: null,
      hireRate: null,
      idleChargeable: false,
    });
  });

  it("keeps a rented machine's hire details", () => {
    const fields = equipmentFields(RENTED, 2026);
    expect(fields.hireRate).toBe(150_000n);
    expect(fields.hireBasis).toBe("trip");
    expect(fields.idleChargeable).toBe(true);
  });

  it("needs a name and a number", () => {
    expect(
      refusal(() => equipmentFields({ ...OWNED, name: "  " }, 2026)),
    ).toEqual({
      code: "EQUIPMENT_NAME_REQUIRED",
      field: "name",
    });
    expect(
      refusal(() => equipmentFields({ ...OWNED, equipmentNumber: "" }, 2026)),
    ).toEqual({ code: "EQUIPMENT_NUMBER_REQUIRED", field: "equipmentNumber" });
  });

  it("takes a purchase year only for owned equipment, 1950 to this year", () => {
    expect(
      refusal(() => equipmentFields({ ...RENTED, purchaseYear: 2020 }, 2026)),
    ).toEqual({ code: "PURCHASE_YEAR_OWNED_ONLY", field: "purchaseYear" });
    for (const year of [1949, 2027, 2019.5])
      expect(
        refusal(() => equipmentFields({ ...OWNED, purchaseYear: year }, 2026))
          .code,
      ).toBe("PURCHASE_YEAR_INVALID");
    expect(
      equipmentFields({ ...OWNED, purchaseYear: 2026 }, 2026).purchaseYear,
    ).toBe(2026);
  });

  it("allows Both only with Hourly", () => {
    expect(
      refusal(() =>
        equipmentFields(
          { ...OWNED, utilisationBasis: "km", targetUnit: "km_per_day" },
          2026,
        ),
      ),
    ).toEqual({
      code: "WORKING_TIME_METHOD_INVALID",
      field: "workingTimeMethod",
    });
  });

  it("needs a target's unit, fitting the basis", () => {
    expect(
      refusal(() => equipmentFields({ ...OWNED, targetUnit: null }, 2026)),
    ).toEqual({ code: "TARGET_UNIT_REQUIRED", field: "targetUnit" });
    expect(
      refusal(() =>
        equipmentFields({ ...OWNED, targetUnit: "km_per_day" }, 2026),
      ),
    ).toEqual({ code: "TARGET_UNIT_INVALID", field: "targetUnit" });
    expect(
      equipmentFields({ ...OWNED, targetUnit: "days_per_month" }, 2026)
        .targetUnit,
    ).toBe("days_per_month");
    expect(
      refusal(() =>
        equipmentFields(
          { ...RENTED, targetValue: "4", targetUnit: "hours_per_day" },
          2026,
        ),
      ).code,
    ).toBe("TARGET_UNIT_INVALID");
    // A unit with no target is dropped.
    expect(
      equipmentFields(
        { ...OWNED, targetValue: "", targetUnit: "hours_per_day" },
        2026,
      ).targetUnit,
    ).toBeNull();
    expect(
      refusal(() => equipmentFields({ ...OWNED, targetValue: "0" }, 2026)).code,
    ).toBe("TARGET_VALUE_INVALID");
  });

  it("keeps min utilisation within 0–100 and efficiency above 0", () => {
    expect(
      equipmentFields({ ...OWNED, minUtilisationPct: "0" }, 2026)
        .minUtilisationPct,
    ).toBe("0.00");
    expect(
      equipmentFields({ ...OWNED, minUtilisationPct: "100" }, 2026)
        .minUtilisationPct,
    ).toBe("100.00");
    for (const value of ["100.01", "-1", "abc", "1.234"])
      expect(
        refusal(() =>
          equipmentFields({ ...OWNED, minUtilisationPct: value }, 2026),
        ).code,
      ).toBe("MIN_UTILISATION_INVALID");
    for (const value of ["0", "0.000", "1.2345"])
      expect(
        refusal(() =>
          equipmentFields({ ...OWNED, expectedFuelEfficiency: value }, 2026),
        ).code,
      ).toBe("FUEL_EFFICIENCY_INVALID");
  });

  it("needs a hire party, basis and rate ≥ 0 when rented", () => {
    expect(
      refusal(() => equipmentFields({ ...RENTED, hirePartyId: null }, 2026)),
    ).toEqual({ code: "HIRE_PARTY_REQUIRED", field: "hirePartyId" });
    expect(
      refusal(() => equipmentFields({ ...RENTED, hireBasis: null }, 2026)),
    ).toEqual({ code: "HIRE_BASIS_REQUIRED", field: "hireBasis" });
    expect(
      refusal(() => equipmentFields({ ...RENTED, hireRate: null }, 2026)),
    ).toEqual({ code: "HIRE_RATE_REQUIRED", field: "hireRate" });
    expect(
      refusal(() => equipmentFields({ ...RENTED, hireRate: -1 }, 2026)).code,
    ).toBe("HIRE_RATE_INVALID");
    expect(equipmentFields({ ...RENTED, hireRate: 0 }, 2026).hireRate).toBe(0n);
  });

  it("refuses hire details and chargeable idle on owned equipment", () => {
    expect(
      refusal(() => equipmentFields({ ...OWNED, hireRate: 100 }, 2026)),
    ).toEqual({ code: "HIRE_DETAILS_RENTED_ONLY", field: "hireRate" });
    expect(
      refusal(() => equipmentFields({ ...OWNED, idleChargeable: true }, 2026)),
    ).toEqual({
      code: "IDLE_CHARGEABLE_RENTED_ONLY",
      field: "idleChargeable",
    });
  });

  it("checks the contact number", () => {
    expect(
      refusal(() =>
        equipmentFields({ ...OWNED, contactPersonNumber: "call me" }, 2026),
      ).code,
    ).toBe("CONTACT_NUMBER_INVALID");
    expect(
      equipmentFields(
        { ...OWNED, contactPersonNumber: "+91 98400 12345" },
        2026,
      ).contactPersonNumber,
    ).toBe("+91 98400 12345");
  });
});

describe("equipment state", () => {
  it("puts maintenance before availability", () => {
    expect(
      equipmentState({ inMaintenance: true, availableForEntry: false }),
    ).toBe("in_maintenance");
    expect(
      equipmentState({ inMaintenance: false, availableForEntry: false }),
    ).toBe("unavailable");
    expect(
      equipmentState({ inMaintenance: false, availableForEntry: true }),
    ).toBe("available");
  });

  it("marks unavailable since today and clears it", () => {
    expect(availabilityChange(false, "2026-10-11")).toEqual({
      availableForEntry: false,
      unavailableSince: "2026-10-11",
    });
    expect(availabilityChange(true, "2026-10-11")).toEqual({
      availableForEntry: true,
      unavailableSince: null,
    });
  });
});
