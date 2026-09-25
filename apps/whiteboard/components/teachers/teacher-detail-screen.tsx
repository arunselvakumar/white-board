"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/components/select";

import { PageHeader } from "@/components/app-shell/page-header";
import { assignTeacherBatch, deactivateTeacher, inviteTeacher, teacherQueries, unassignTeacherBatch, updateTeacher } from "@/src/queries/teachers";
import { TeacherForm } from "./teacher-form";

const assignmentSchema = z.object({ batchId: z.uuid("Choose a Batch") });

export function TeacherDetailScreen({ id }: { id: string }) {
  const { orgId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [batchPage, setBatchPage] = useState(1);
  const [batchCursor, setBatchCursor] = useState<{ after?: string; before?: string }>({});
  const { data: teacher } = useSuspenseQuery(teacherQueries.detail(orgId, id));
  const { data: assigned } = useSuspenseQuery(teacherQueries.batches(orgId, id));
  const { data: batches } = useSuspenseQuery(teacherQueries.batchOptions(orgId, { limit: 100, ...batchCursor }));
  const form = useForm<z.infer<typeof assignmentSchema>>({ resolver: zodResolver(assignmentSchema), defaultValues: { batchId: "" } });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: teacherQueries.key.all });
  const update = useMutation({ mutationFn: (input: Parameters<typeof updateTeacher>[1]) => updateTeacher(id, input), onSuccess: refresh });
  const invite = useMutation({ mutationFn: () => inviteTeacher(id), onSuccess: refresh });
  const deactivate = useMutation({ mutationFn: () => deactivateTeacher(id), onSuccess: refresh });
  const assign = useMutation({ mutationFn: (batchId: string) => assignTeacherBatch(id, batchId), onSuccess: refresh });
  const unassign = useMutation({ mutationFn: (batchId: string) => unassignTeacherBatch(id, batchId), onSuccess: refresh });
  const available = batches.items.filter((batch) => batch.closedAt == null && !assigned.items.some((item) => item.id === batch.id));

  return <main className="w-full p-6"><div className="max-w-4xl space-y-7">
    <PageHeader back={{ href: "/teachers", label: "Teachers" }} title={teacher.name} />
    <div className="rounded-xl border p-5 space-y-2"><p className="text-sm">Invitation: <strong>{teacher.invitationStatus}</strong></p>
      {teacher.invitationStatus === "failed" && <p role="alert" className="text-sm text-destructive">The invitation failed. Resend it to grant access.</p>}
      {teacher.deactivatedAt && <p className="text-sm">This Teacher is inactive.</p>}
      {!teacher.deactivatedAt && <div className="flex gap-2">
        {!teacher.clerkUserId && <Button variant="outline" disabled={invite.isPending} onClick={() => { invite.mutate(); }}>{invite.isPending ? "Sending…" : "Resend invitation"}</Button>}
        <Button variant="outline" disabled={deactivate.isPending} onClick={() => { deactivate.mutate(); }}>Deactivate Teacher</Button>
      </div>}
      {(invite.isError || deactivate.isError) && <p role="alert" className="text-sm text-destructive">Could not complete the action. Please try again.</p>}
    </div>
    <section className="space-y-4"><h2 className="text-lg font-semibold">Profile</h2>{teacher.deactivatedAt ? <p className="text-sm">{teacher.email} · {teacher.kind === "visiting_tutor" ? "Visiting Tutor" : "Centre Teacher"}</p> : <TeacherForm teacher={teacher} onSubmit={async (input) => { await update.mutateAsync(input); }} onCancel={() => { router.push("/teachers"); }} />}</section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">Assigned Batches</h2>
      {assigned.items.length === 0 ? <p className="text-muted-foreground text-sm">No Batches assigned.</p> : <div className="divide-y rounded-xl border">{assigned.items.map((batch) => <div key={batch.id} className="flex items-center justify-between p-4"><span>{batch.name}</span><Button variant="outline" disabled={unassign.isPending || !!teacher.deactivatedAt} onClick={() => { unassign.mutate(batch.id); }}>Unassign</Button></div>)}</div>}
      {!teacher.deactivatedAt && <form className="flex items-end gap-3" onSubmit={form.handleSubmit(async ({ batchId }) => { await assign.mutateAsync(batchId); form.reset(); })}>
        <div className="min-w-60 space-y-1.5"><Label htmlFor="teacher-batch">Batch</Label><Controller name="batchId" control={form.control} render={({ field }) => <Select items={available.map((batch) => ({ value: batch.id, label: batch.name }))} value={field.value} onValueChange={(value) => { if (value) field.onChange(value); }}><SelectTrigger id="teacher-batch" className="w-full"><SelectValue placeholder="Choose Batch" /></SelectTrigger><SelectContent align="start" alignItemWithTrigger={false}>{available.map((batch) => <SelectItem key={batch.id} value={batch.id}>{batch.name}</SelectItem>)}</SelectContent></Select>} />{form.formState.errors.batchId && <p className="text-sm text-destructive">Choose a Batch.</p>}</div>
        <Button type="submit" disabled={assign.isPending || available.length === 0}>Assign Batch</Button>
      </form>}
      {batches.total > 100 && !teacher.deactivatedAt && <div className="flex items-center gap-3"><Button variant="outline" disabled={!batches.prevCursor} onClick={() => { if (batches.prevCursor) { setBatchCursor({ before: batches.prevCursor }); setBatchPage((current) => current - 1); } }}>Previous Batches</Button><span className="text-sm">Page {batchPage}</span><Button variant="outline" disabled={!batches.nextCursor} onClick={() => { if (batches.nextCursor) { setBatchCursor({ after: batches.nextCursor }); setBatchPage((current) => current + 1); } }}>Next Batches</Button></div>}
      {(assign.isError || unassign.isError) && <p role="alert" className="text-sm text-destructive">Could not change the Batch assignment.</p>}
    </section>
  </div></main>;
}
