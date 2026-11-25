// JSON-ready. Money is whole paise; dates YYYY-MM-DD; months YYYY-MM.

export type RoyaltyFeeHeadView = {
  feeHeadId: string;
  name: string;
  royaltyBearing: boolean;
  /** Fee Payments received in the month allocated to this Fee Head's Invoices. */
  collectedPaise: number;
};

export type CentreRoyaltyView = {
  centreId: string;
  name: string;
  code: string;
  franchiseeName: string | null;
  royaltyBps: number;
  /** 0–100 with up to two decimals. */
  royaltyPercent: number;
  /** By Fee Head order; only Fee Heads with collections. */
  byFeeHead: RoyaltyFeeHeadView[];
  royaltyBearingPaise: number;
  otherPaise: number;
  royaltyPaise: number;
};

/** The Royalty Statement for a month: every Franchised Centre. */
export type RoyaltyStatementView = {
  month: string;
  startsOn: string;
  endsOn: string;
  centres: CentreRoyaltyView[];
  totals: {
    royaltyBearingPaise: number;
    otherPaise: number;
    royaltyPaise: number;
  };
};

export type RoyaltyPaymentView = {
  paymentId: string;
  receiptNumber: string;
  receivedOn: string;
  childId: string;
  childName: string;
  royaltyBearingPaise: number;
  otherPaise: number;
};

/** One Franchised Centre's statement with the Fee Payments behind it, for printing. */
export type CentreRoyaltyStatementView = CentreRoyaltyView & {
  month: string;
  startsOn: string;
  endsOn: string;
  /** By date received, then Receipt number. */
  payments: RoyaltyPaymentView[];
};
