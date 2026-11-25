import { z } from "zod";

const paise = z.number().int();

export const PreschoolRoyaltyParamsModel = z.object({ centreId: z.uuid() });

const centreRoyaltyFields = {
  centreId: z.uuid(),
  name: z.string(),
  code: z.string(),
  franchiseeName: z.string().nullable(),
  royaltyBps: z.number().int(),
  royaltyPercent: z.number(),
  byFeeHead: z.array(
    z.object({
      feeHeadId: z.uuid(),
      name: z.string(),
      royaltyBearing: z.boolean(),
      collectedPaise: paise,
    }),
  ),
  royaltyBearingPaise: paise,
  otherPaise: paise,
  royaltyPaise: paise,
};

export const PreschoolRoyaltyStatementResponseModel = z.object({
  month: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  centres: z.array(z.object(centreRoyaltyFields)),
  totals: z.object({
    royaltyBearingPaise: paise,
    otherPaise: paise,
    royaltyPaise: paise,
  }),
});

export const PreschoolCentreRoyaltyStatementResponseModel = z.object({
  ...centreRoyaltyFields,
  month: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  payments: z.array(
    z.object({
      paymentId: z.uuid(),
      receiptNumber: z.string(),
      receivedOn: z.iso.date(),
      childId: z.uuid(),
      childName: z.string(),
      royaltyBearingPaise: paise,
      otherPaise: paise,
    }),
  ),
});
