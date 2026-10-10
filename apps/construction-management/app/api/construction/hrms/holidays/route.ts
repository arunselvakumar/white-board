import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { holidays } from "./handlers";
import {
  CreateConstructionHrmsHolidayRequestModel,
  ListConstructionHrmsHolidaysRequestModel,
  toHolidayResponse,
  type ListConstructionHrmsHolidaysResponseModel,
} from "./holiday-models";

export const dynamic = "force-dynamic";

/** The Company's holidays in a year, by date (CM-305). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.holidays", "read");
    if (isResponse(session)) return session;
    const { year } = parseOrThrow(
      ListConstructionHrmsHolidaysRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const items = await holidays.list({
      access: session.access,
      year: Number(year),
    });
    const body: ListConstructionHrmsHolidaysResponseModel = {
      year: Number(year),
      items: items.map(toHolidayResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a holiday; a past date passes the Back-dated Entry policy (CM-305). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.holidays", "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionHrmsHolidayRequestModel.safeParse(await request.json()),
    );
    const created = await holidays.create({
      access: session.access,
      holiday: model,
    });
    return Response.json(toHolidayResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
