import type { IsoDate } from "../domain/dates";

/** One Fee Payment allocation received in the month, with its Invoice's Fee Head. */
export type RoyaltyAllocation = {
  centreId: string;
  paymentId: string;
  receiptNumber: string;
  receivedOn: IsoDate;
  childId: string;
  childName: string;
  feeHeadId: string;
  amountPaise: number;
};

export type RoyaltyFeeHead = {
  id: string;
  name: string;
  royaltyBearing: boolean;
  sortOrder: number;
};

export type RoyaltyCentre = {
  id: string;
  name: string;
  code: string;
  ownership: "company_owned" | "franchised";
  status: "active" | "closed";
  franchiseeName: string | null;
  royaltyBps: number;
};

export type RoyaltyStore = {
  /** Centres that are not deleted, by name; one Centre when `centreId` is given. */
  centres(workspaceId: string, centreId?: string): Promise<RoyaltyCentre[]>;
  feeHeads(workspaceId: string): Promise<RoyaltyFeeHead[]>;
  /** Allocations of Fee Payments received between the dates, at these Centres. */
  allocations(
    workspaceId: string,
    centreIds: readonly string[],
    span: { startsOn: IsoDate; endsOn: IsoDate },
  ): Promise<RoyaltyAllocation[]>;
};
