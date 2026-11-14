"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Spinner } from "@repo/ui/components/spinner";
import { cn } from "@repo/ui/lib/utils";

import {
  checkInPersonPhotoUrl,
  checkInPersonQuery,
  useRecordCheckIn,
  type CheckInAction,
  type CheckInKind,
  type RecordCheckInInput,
  type RecordCheckInResult,
} from "@/src/queries/check-ins";
import { QueryHttpError } from "@/src/queries/http";

import { CheckInAvatar } from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-avatar";
import {
  ACTION_LABELS,
  checkInFindPath,
  personLine,
  stateSentence,
} from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-format";

import { CameraCaptureError } from "./camera-frame";
import { CaptureCameraPanel } from "./capture-camera-panel";
import { CaptureConfirmation } from "./capture-confirmation";
import { CaptureSkeleton } from "./capture-skeletons";
import {
  LocationLine,
  ServerClock,
  TodayEntries,
  useDeviceLocationOnMount,
} from "./capture-parts";
import { useCheckInCamera, type CapturedPhoto } from "./use-camera";

export const PRIVACY_LINE =
  "A photo and this device's location are saved with the entry.";

const ACTION_ITEMS: { value: CheckInAction; label: string }[] = [
  { value: "check_in", label: ACTION_LABELS.check_in },
  { value: "check_out", label: ACTION_LABELS.check_out },
];

const SENDING: Record<CheckInAction, string> = {
  check_in: "Checking in…",
  check_out: "Checking out…",
};

type Problem =
  /** The server said no, in its own words; the camera stays live. */
  | { kind: "refused"; message: string }
  /** Nothing came back; the photo is kept for Try again. */
  | { kind: "network"; input: RecordCheckInInput }
  /** The photo could not be taken. */
  | { kind: "capture"; message: string };

const noSubscription = () => () => undefined;

/** The screen is portaled to `<body>`, which only exists in the browser. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/** The page behind the screen does not scroll while it is open. */
function useLockedPageScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, []);
}

/**
 * Escape goes back, except when it closes a popup (the action's list) or
 * the confirmation is showing.
 */
function useEscape(onEscape: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[role=listbox], [role=option]") != null) return;
      onEscape();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onEscape]);
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      replace
      className={buttonVariants({
        variant: "ghost",
        size: "lg",
        className: "-ml-3 px-3",
      })}
    >
      <ArrowLeft aria-hidden="true" />
      Back
    </Link>
  );
}

function ProblemAlert({
  problem,
  onRetake,
}: {
  problem: Problem;
  onRetake: () => void;
}) {
  if (problem.kind === "network")
    return (
      <Alert variant="destructive">
        <WifiOff aria-hidden="true" />
        <AlertTitle>Could not reach the server</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Check the signal, then press Try again. The photo taken is kept.
          </p>
          <Button type="button" variant="outline" onClick={onRetake}>
            Take a new photo
          </Button>
        </AlertDescription>
      </Alert>
    );
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{problem.message}</AlertTitle>
    </Alert>
  );
}

function Capture({
  projectId,
  kind,
  personId,
  back,
  labelId,
}: {
  projectId: string;
  kind: CheckInKind;
  personId: string;
  back: string;
  labelId: string;
}) {
  const { data, dataUpdatedAt } = useSuspenseQuery(
    checkInPersonQuery(projectId, kind, personId),
  );
  const { person, timeZone } = data;
  const camera = useCheckInCamera();
  const [location, retryLocation] = useDeviceLocationOnMount();
  const record = useRecordCheckIn();
  const router = useRouter();

  const defaultAction: CheckInAction =
    person.state.status === "in" ? "check_out" : "check_in";
  const [chosen, setChosen] = useState<CheckInAction | null>(null);
  const action = chosen ?? defaultAction;
  const [frozen, setFrozen] = useState<CapturedPhoto | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [done, setDone] = useState<{
    result: RecordCheckInResult;
    photo: CapturedPhoto;
  } | null>(null);

  const finish = useCallback(() => {
    router.replace(checkInFindPath(projectId));
  }, [router, projectId]);
  const leave = useCallback(() => {
    if (done == null) router.replace(back);
    else finish();
  }, [done, router, back, finish]);
  useEscape(leave);

  const send = (input: RecordCheckInInput, photo: CapturedPhoto) => {
    setProblem(null);
    record.mutate(input, {
      onSuccess: (result) => {
        camera.stop();
        setDone({ result, photo });
      },
      onError: (error) => {
        if (error instanceof QueryHttpError && error.status < 500) {
          // The person is read again, so the default action follows.
          setFrozen(null);
          setChosen(null);
          setProblem({ kind: "refused", message: error.message });
        } else setProblem({ kind: "network", input });
      },
    });
  };

  const submit = async () => {
    if (problem?.kind === "network" && frozen != null) {
      send(problem.input, frozen);
      return;
    }
    setProblem(null);
    let photo: CapturedPhoto;
    try {
      photo = await camera.capture();
    } catch (error) {
      setProblem({
        kind: "capture",
        message:
          error instanceof CameraCaptureError
            ? error.message
            : "The photo could not be taken. Try again.",
      });
      return;
    }
    setFrozen(photo);
    send(
      {
        projectId,
        kind,
        personId,
        action,
        photo: photo.base64,
        location:
          location.status === "found"
            ? {
                latitude: location.location.latitude,
                longitude: location.location.longitude,
                accuracyMetres: location.location.accuracyMetres,
              }
            : null,
      },
      photo,
    );
  };

  const sending = record.isPending;
  const retrying = problem?.kind === "network" && frozen != null;
  const canSubmit = !sending && (retrying || camera.status === "live");
  const photoUrl = person.hasPhoto
    ? checkInPersonPhotoUrl(projectId, kind, personId)
    : null;
  const line = personLine(person);

  return (
    <>
      <div className="grid gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,1fr)] lg:grid-rows-[auto_1fr]">
        <div className="flex items-center gap-4 lg:col-start-2 lg:row-start-1">
          <CheckInAvatar
            name={person.name}
            photoUrl={photoUrl}
            className="size-16 text-lg"
          />
          <div className="min-w-0">
            <h1
              id={labelId}
              className="text-2xl font-semibold tracking-tight break-words"
            >
              {person.name}
            </h1>
            {line === "" ? null : (
              <p className="text-muted-foreground text-base">{line}</p>
            )}
          </div>
        </div>

        <div className="space-y-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <CaptureCameraPanel
            camera={camera}
            frozenUrl={frozen?.previewUrl ?? null}
          />
          <p className="text-muted-foreground text-center text-sm">
            {PRIVACY_LINE}
          </p>
        </div>

        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-start-2">
          <ServerClock
            now={data.now}
            receivedAt={dataUpdatedAt}
            timeZone={timeZone}
          />
          <div className="space-y-1.5">
            <Label htmlFor="check-in-action">Entry</Label>
            <Select
              items={ACTION_ITEMS}
              value={action}
              disabled={sending || retrying}
              onValueChange={(value) => {
                if (value == null) return;
                setChosen(value);
              }}
            >
              <SelectTrigger
                id="check-in-action"
                size="lg"
                className="w-full text-base"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-sm">
              {stateSentence(person, timeZone)}
            </p>
          </div>
          <LocationLine
            state={location}
            siteFence={data.siteFence}
            onRetry={retryLocation}
          />
          <TodayEntries entries={data.entries} timeZone={timeZone} />
          <div className="bg-background/95 sticky bottom-0 -mx-4 mt-auto space-y-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:backdrop-blur-none">
            {problem == null ? null : (
              <ProblemAlert
                problem={problem}
                onRetake={() => {
                  setFrozen(null);
                  setProblem(null);
                }}
              />
            )}
            <Button
              type="button"
              size="lg"
              className="h-14 w-full text-lg"
              disabled={!canSubmit}
              onClick={() => {
                void submit();
              }}
            >
              {sending ? (
                <>
                  <Spinner aria-hidden="true" />
                  {SENDING[action]}
                </>
              ) : retrying ? (
                "Try again"
              ) : (
                ACTION_LABELS[action]
              )}
            </Button>
          </div>
        </div>
      </div>
      {done == null ? null : (
        <CaptureConfirmation
          result={done.result}
          photoUrl={done.photo.previewUrl}
          timeZone={timeZone}
          onDone={finish}
        />
      )}
    </>
  );
}

function Screen({
  labelId,
  children,
}: {
  labelId: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLockedPageScroll();
  useEffect(() => {
    root.current?.focus();
  }, []);
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      tabIndex={-1}
      className="bg-background text-foreground fixed inset-0 z-50 overflow-y-auto overscroll-contain outline-none"
    >
      {children}
    </div>
  );
}

/**
 * Capture (ADR CM-0043 §7): the whole window, over the sidebar in both
 * menu layouts, so it is portaled to `<body>` and does not depend on
 * either `<main>` (ADR CM-0039). The camera, the server's clock, Check In
 * or Check Out, the location and today's entries; the photo is taken at
 * the moment of submitting.
 */
export function CheckInCaptureScreen({
  projectId,
  kind,
  personId,
}: {
  projectId: string;
  kind: CheckInKind;
  personId: string;
}) {
  const [q] = useQueryState("q", parseAsString.withDefault(""));
  const back = checkInFindPath(projectId, q);
  const labelId = useId();
  const isClient = useIsClient();
  if (!isClient) return null;
  return createPortal(
    <Screen labelId={labelId}>
      <div
        className={cn(
          "mx-auto flex min-h-full w-full max-w-7xl flex-col gap-4 px-4 pt-3 sm:px-6 sm:pt-4 lg:pb-6",
        )}
      >
        <header className="flex items-center">
          <BackLink href={back} />
        </header>
        <Suspense fallback={<CaptureSkeleton />}>
          <Capture
            projectId={projectId}
            kind={kind}
            personId={personId}
            back={back}
            labelId={labelId}
          />
        </Suspense>
      </div>
    </Screen>,
    document.body,
  );
}
