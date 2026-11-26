import type { IsoDate } from "../domain/dates";

/** What one Centre's Head Office row is computed from. */
export type HeadOfficeCentreFacts = {
  id: string;
  activeChildren: number;
  capacity: number;
  presentToday: number;
  collectedPaise: number;
  outstanding: {
    dueOn: IsoDate;
    amountPaise: number;
    concessionPaise: number;
    paidPaise: number;
  }[];
  openEnquiries: number;
  admissions: number;
};

export type HeadOfficeStore = {
  /** For each Centre: today's figures and the month's collections and admissions. */
  facts(
    workspaceId: string,
    centreIds: readonly string[],
    window: { today: IsoDate; startsOn: IsoDate; endsOn: IsoDate },
  ): Promise<HeadOfficeCentreFacts[]>;
};
