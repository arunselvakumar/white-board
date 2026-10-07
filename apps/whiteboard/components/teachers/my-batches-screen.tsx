"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useAuth } from "@repo/auth/react";
import Link from "next/link";

import { UpcomingDemosCard } from "@/components/enquiries/upcoming-demos-card";
import { myBatchQueries } from "@/src/queries/teachers";

export function MyBatchesScreen() {
  const { workspaceId, userId } = useAuth();
  const activation = useQuery(myBatchQueries.activation(workspaceId, userId));
  if (activation.isPending)
    return <main className="p-6">Opening My Batches…</main>;
  if (activation.isError)
    return (
      <main className="space-y-2 p-6">
        <h1 className="text-2xl font-semibold">My Batches</h1>
        <p role="alert">
          Your Teacher invitation could not be linked. Ask the Owner to check
          your invitation.
        </p>
      </main>
    );
  return <MyBatchesContent workspaceId={workspaceId} userId={userId} />;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function MyBatchesContent({
  workspaceId,
  userId,
}: {
  workspaceId: string | null | undefined;
  userId: string | null | undefined;
}) {
  const { data } = useSuspenseQuery(myBatchQueries.list(workspaceId, userId));
  return (
    <main className="w-full p-6">
      <div className="max-w-4xl space-y-6">
        <h1 className="text-2xl font-semibold">My Batches</h1>
        {data.items.length === 0 ? (
          <p className="text-muted-foreground">No Batches assigned yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.items.map((batch) => (
              <div key={batch.id} className="rounded-xl border p-5">
                <h2 className="font-semibold">{batch.name}</h2>
                <p className="text-muted-foreground text-sm">
                  {batch.classMode} · {batch.timezone}
                  {batch.room ? ` · ${batch.room}` : ""}
                </p>
                <div className="mt-3 text-sm">
                  {batch.timings.length === 0
                    ? "Timings to be confirmed"
                    : batch.timings.map((slot, index) => (
                        <p key={index}>
                          {slot.daysOfWeek
                            .map((day) => DAYS[day] ?? String(day))
                            .join(", ")}{" "}
                          · {slot.startTime}–{slot.endTime}
                        </p>
                      ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                  <Link
                    className="inline-block text-sm font-medium underline"
                    href={`/teacher/batches/${batch.id}/attendance`}
                  >
                    Take Attendance
                  </Link>
                  <Link
                    className="inline-block text-sm font-medium underline"
                    href={`/teacher/batches/${batch.id}/homework`}
                  >
                    Homework and Study Material
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
        <UpcomingDemosCard />
      </div>
    </main>
  );
}
