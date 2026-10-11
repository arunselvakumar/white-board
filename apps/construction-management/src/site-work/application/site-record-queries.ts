import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  storedLocationRef,
  type LocationRef,
} from "@/src/shared-kernel/location-ref";

import {
  daysLost,
  HINDRANCE_CAUSE_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  type HindranceCause,
  type HindranceStatus,
  type ResponsibleParty,
} from "../domain/hindrance";
import {
  WEATHER_LABELS,
  type SiteDiaryInstruction,
  type SiteDiaryVisitor,
  type Weather,
} from "../domain/site-diary";
import type { HindranceHandlers, HindranceStore } from "./hindrance-handlers";
import type { SiteDiaryHandlers } from "./site-diary-handlers";

/**
 * What the Daily Progress Report (CM-606, ADR CM-0016 §15) prints of the
 * Site Diary and the Hindrance register for one Project and date. Plain
 * data with labels resolved, so the report needs no site-diary code.
 */
export type DprSiteDiary = {
  id: string;
  diaryDate: CalendarDate;
  weatherMorning: { value: Weather; label: string } | null;
  weatherAfternoon: { value: Weather; label: string } | null;
  /** mm, decimal string ("12.5"), or null when not recorded. */
  rainfallMm: string | null;
  siteCondition: string | null;
  notes: string | null;
  visitors: SiteDiaryVisitor[];
  instructions: SiteDiaryInstruction[];
};

export type DprHindrance = {
  id: string;
  number: string;
  startDate: CalendarDate;
  /** Null while it continues. */
  endDate: CalendarDate | null;
  /** As on the report date: Closed only when it ended on or before it. */
  status: HindranceStatus;
  /** Calendar days from the start up to the report date (or the end). */
  daysLost: number;
  hoursLost: string | null;
  cause: HindranceCause;
  causeLabel: string;
  affectedActivity: string;
  /** Resolve with the Project's LocationResolver / `LocationLabel`. */
  siteLocation: LocationRef | null;
  responsibleParty: ResponsibleParty;
  responsiblePartyLabel: string;
  contractorName: string | null;
  description: string | null;
  signOff: {
    teamMemberName: string | null;
    partyName: string;
    partyRole: string | null;
    signedOn: CalendarDate;
  } | null;
};

/** The reads the DPR uses; `createSiteRecordQueries()` wires them. */
export type SiteRecordReads = {
  /** The Project's Site Diary for `date`, or null when none was written. */
  diaryForDate(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<DprSiteDiary | null>;
  /**
   * Hindrances on the register for `date`: started on or before it and
   * not ended before it (open, or ending on or after it), oldest first.
   */
  hindrancesOn(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<DprHindrance[]>;
};

function weather(value: Weather | null) {
  return value == null ? null : { value, label: WEATHER_LABELS[value] };
}

/**
 * Site Diary and Hindrance reads for the DPR. No permission checks: the
 * report job checks Progress Report access before it reads.
 */
export class SiteRecordQueries implements SiteRecordReads {
  constructor(
    private readonly diaries: Pick<SiteDiaryHandlers, "onDate">,
    private readonly hindrances: Pick<HindranceHandlers, "readModels">,
    private readonly openOn: (
      workspaceId: string,
      projectId: string,
      date: CalendarDate,
    ) => ReturnType<HindranceStore["openOn"]>,
  ) {}

  async diaryForDate(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<DprSiteDiary | null> {
    const diary = await this.diaries.onDate(workspaceId, projectId, date);
    if (diary == null) return null;
    return {
      id: diary.id,
      diaryDate: diary.diaryDate,
      weatherMorning: weather(diary.weatherMorning),
      weatherAfternoon: weather(diary.weatherAfternoon),
      rainfallMm: diary.rainfallMm,
      siteCondition: diary.siteCondition,
      notes: diary.notes,
      visitors: diary.visitors,
      instructions: diary.instructions,
    };
  }

  async hindrancesOn(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<DprHindrance[]> {
    const day = assertCalendarDate(date);
    const rows = await this.openOn(workspaceId, projectId, day);
    const models = await this.hindrances.readModels(workspaceId, rows, day);
    return models.map((h) => {
      const endedBy = h.endDate != null && h.endDate <= day;
      return {
        id: h.id,
        number: h.number,
        startDate: h.startDate,
        endDate: h.endDate,
        status: endedBy ? "closed" : "open",
        daysLost: daysLost(h.startDate, endedBy ? h.endDate : null, day),
        hoursLost: h.hoursLost,
        cause: h.cause,
        causeLabel: HINDRANCE_CAUSE_LABELS[h.cause],
        affectedActivity: h.affectedActivity,
        siteLocation: storedLocationRef(h.siteLocation),
        responsibleParty: h.responsibleParty,
        responsiblePartyLabel: RESPONSIBLE_PARTY_LABELS[h.responsibleParty],
        contractorName: h.contractorName,
        description: h.description,
        signOff:
          h.signOff == null
            ? null
            : {
                teamMemberName: h.signOffUserName,
                partyName: h.signOff.partyName,
                partyRole: h.signOff.partyRole,
                signedOn: h.signOff.signedOn,
              },
      };
    });
  }
}
