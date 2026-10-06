import { prisma } from "@repo/db";

import {
  ClassService,
  type MeetingGateway,
} from "../application/class-service";
import { createCalendarScheduleReader } from "./create-calendar-schedule-reader";
import { PrismaClassExceptionsReader } from "./prisma-class-change-store";
import { PrismaClassOccurrenceStore } from "./prisma-class-occurrence-store";
import {
  RealtimeKitMeetingGateway,
  realtimeKitConfigFromEnv,
} from "./realtimekit-meeting-gateway";

function gateway(): RealtimeKitMeetingGateway {
  return new RealtimeKitMeetingGateway(realtimeKitConfigFromEnv());
}

export function createClassService(): ClassService {
  const meetings: MeetingGateway = {
    ensureConfigured: () => {
      realtimeKitConfigFromEnv();
    },
    createMeeting: (title) => gateway().createMeeting(title),
    addParticipant: (meetingId, input) =>
      gateway().addParticipant(meetingId, input),
    startRecording: (meetingId, occurrence) =>
      gateway().startRecording(meetingId, occurrence),
    endMeeting: (meetingId) => gateway().endMeeting(meetingId),
    deactivateMeeting: (meetingId) => gateway().deactivateMeeting(meetingId),
  };
  return new ClassService({
    schedule: createCalendarScheduleReader(prisma),
    exceptions: new PrismaClassExceptionsReader(prisma),
    occurrences: new PrismaClassOccurrenceStore(prisma),
    meetings,
    now: () => new Date(),
  });
}
