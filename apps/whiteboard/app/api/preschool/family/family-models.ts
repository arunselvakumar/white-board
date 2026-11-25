import { z } from "zod";

const paise = z.number().int();
const clock = z.string().regex(/^\d{2}:\d{2}$/);

export const PreschoolFamilyHomeResponseModel = z.object({
  date: z.iso.date(),
  children: z.array(
    z.object({
      child: z.object({
        id: z.uuid(),
        name: z.string(),
        firstName: z.string(),
        photoUrl: z.string().nullable(),
        ageText: z.string(),
        admissionNumber: z.string(),
        classroomName: z.string().nullable(),
        programmeName: z.string().nullable(),
        centre: z.object({
          id: z.uuid(),
          name: z.string(),
          phone: z.string().nullable(),
        }),
      }),
      classTeachers: z.array(z.string()),
      today: z.object({
        status: z.enum(["present", "absent", "leave"]).nullable(),
        checkInTime: clock.nullable(),
        checkOutTime: clock.nullable(),
        collectedBy: z
          .object({ name: z.string(), relationship: z.string().nullable() })
          .nullable(),
      }),
      latestDailyReport: z
        .object({
          date: z.iso.date(),
          publishedAt: z.iso.datetime().nullable(),
          meals: z.array(
            z.object({
              meal: z.enum(["breakfast", "snack", "lunch"]),
              menu: z.string().nullable(),
              ate: z.enum(["all", "some", "none"]),
            }),
          ),
          napFrom: clock.nullable(),
          napTo: clock.nullable(),
          toilet: z.array(
            z.object({
              time: clock,
              kind: z.enum(["diaper_wet", "diaper_soiled", "potty", "toilet"]),
            }),
          ),
          mood: z
            .enum(["happy", "calm", "tired", "fussy", "unwell"])
            .nullable(),
          activities: z.array(z.string()),
          note: z.string().nullable(),
          photos: z.array(z.string()),
        })
        .nullable(),
      fees: z.object({
        duePaise: paise,
        overduePaise: paise,
        nextDue: z
          .object({ dueOn: z.iso.date(), label: z.string(), duePaise: paise })
          .nullable(),
      }),
    }),
  ),
});
