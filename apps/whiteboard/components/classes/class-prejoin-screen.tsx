"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, ExternalLink, Radio, Video } from "lucide-react";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { classApiPath, classQueries } from "@/src/queries/classes";
import { apiJson } from "@/src/queries/http";
import { withAppBasePath } from "@/lib/app-base-path";

const RealtimeKitRoom = dynamic(() => import("./realtimekit-room"), { ssr: false });

export function ClassPrejoinScreen({ batchId, date, startTime }: { batchId: string; date: string; startTime: string }) {
  const { orgId, userId, orgRole } = useAuth();
  const { data, refetch } = useSuspenseQuery(classQueries.detail(`${orgId}:${userId}:${orgRole}`, batchId, date, startTime));
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiPath = classApiPath(batchId, date, startTime);
  const externalUrl = data.joinUrl && (() => { try { const url = new URL(data.joinUrl); return url.protocol === "https:" ? url.href : null; } catch { return null; } })();
  async function enter(action: "start" | "join") {
    setBusy(true); setError(null);
    try {
      const result = await apiJson<{ authToken: string }>(`${apiPath}/${action}`, { method: "POST" });
      setToken(result.authToken);
      await refetch();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open the class."); }
    finally { setBusy(false); }
  }

  return <main className="w-full p-6"><div className="mx-auto w-full max-w-4xl space-y-6">
    <Link href="/calendar" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Calendar</Link>
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Video className="size-6" /></div>
      <p className="text-sm font-medium text-muted-foreground">{data.courseName} · {data.batchName}</p>
      <h1 className="mt-1 text-2xl font-semibold">Join class</h1>
      <p className="mt-2 text-sm text-muted-foreground">{data.date} · {data.startTime}–{data.endTime} · {data.timezone}</p>
      <div className="mt-6 border-t pt-6">
        {data.meetingOption === "external" ? <>
          <p className="text-sm text-muted-foreground">This Batch uses an external meeting link. It opens in a new tab.</p>
          {externalUrl ? <a className={buttonVariants({ className: "mt-4" })} href={externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 size-4" /> Open meeting</a> : <p className="mt-4 text-sm text-muted-foreground">The meeting link has not been added yet.</p>}
        </> : token ? <RealtimeKitRoom authToken={token} /> : <>
          <p className="flex items-center gap-2 text-sm font-medium"><Radio className="size-4" /> {data.status === "live" ? "Class is live and being recorded" : data.status === "failed" ? "Recording could not start" : data.status === "ended" ? "Class has ended" : "Waiting for the class to start"}</p>
          {data.status !== "ended" && data.status !== "failed" && <p className="mt-2 text-sm text-muted-foreground">Your camera and microphone can be checked before you join.</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            {data.isHost && data.status !== "ended" && data.status !== "failed" && <Button disabled={busy} onClick={() => void enter("start")}>{busy ? "Opening…" : data.status === "scheduled" ? "Start class" : "Enter as host"}</Button>}
            {!data.isHost && data.status === "live" && <Button disabled={busy} onClick={() => void enter("join")}>{busy ? "Opening…" : "Join recorded class"}</Button>}
          </div>
          {data.isHost && data.status === "starting" && <p className="mt-3 text-sm text-muted-foreground">Students can join once recording starts.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        </>}
      </div>
    </div>
    {data.meetingOption === "whiteboard" && data.isHost && <div className="rounded-2xl border bg-card p-6"><h2 className="font-semibold">Class recording</h2><p className="mt-1 text-sm text-muted-foreground">{data.recordingStatus === "ready" ? "Ready to download" : data.recordingStatus === "uploading" ? "Uploading recording…" : data.recordingStatus === "recording" ? "Recording in progress" : data.recordingStatus === "error" ? "Recording failed" : "Available after the class ends and upload completes"}</p>{data.recordingReady && <a className={buttonVariants({ variant: "outline", className: "mt-4" })} href={withAppBasePath(`${apiPath}/recording`)}><Download className="mr-2 size-4" /> Download recording</a>}</div>}
  </div></main>;
}
