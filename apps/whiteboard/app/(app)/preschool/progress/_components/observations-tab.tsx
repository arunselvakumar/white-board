"use client";

import { NotePencilIcon } from "@phosphor-icons/react/ssr";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { Suspense, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { ChildAvatar } from "@/app/(app)/preschool/_components/child-avatar";
import { formatDate } from "@/app/(app)/preschool/_components/preschool-format";
import { childName } from "@/src/preschool/domain/child";
import { todayInIndia } from "@/src/preschool/domain/dates";
import { QueryHttpError } from "@/src/queries/http";
import { classroomQueryOptions } from "@/src/queries/preschool/classrooms";
import {
  createPreschoolObservation,
  preschoolDomainsQueryOptions,
  preschoolObservationKeys,
  preschoolObservationsQueryOptions,
  removePreschoolObservation,
  updatePreschoolObservation,
  type PreschoolDevelopmentDomain,
  type PreschoolObservation,
} from "@/src/queries/preschool/observations";

type RosterChild = { id: string; name: string; photoUrl: string | null };

const ANY = "any";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof QueryHttpError && error.message !== ""
    ? error.message
    : fallback;
}

/** Pick a Child, pick a Domain, write the note: built for a phone. */
export function QuickAdd({
  roster,
  domains,
  onSaved,
}: {
  roster: readonly RosterChild[];
  domains: readonly PreschoolDevelopmentDomain[];
  onSaved: () => Promise<void>;
}) {
  const today = todayInIndia(new Date());
  const [childId, setChildId] = useState<string | null>(null);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [observedOn, setObservedOn] = useState(today);
  const [errors, setErrors] = useState<{
    child?: string;
    domain?: string;
    note?: string;
    form?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const submit = async () => {
    const next = {
      child: childId == null ? "Choose a Child" : undefined,
      domain: domainId == null ? "Choose a Development Domain" : undefined,
      note: note.trim() === "" ? "Write what you observed" : undefined,
    };
    setErrors(next);
    setSaved(null);
    if (childId == null || domainId == null || next.note != null) return;
    setSaving(true);
    try {
      await createPreschoolObservation({
        childId,
        domainId,
        note,
        observedOn,
      });
      const name = roster.find((child) => child.id === childId)?.name ?? "";
      setNote("");
      setSaved(`Saved for ${name}.`);
      await onSaved();
    } catch (error) {
      setErrors({
        form: messageOf(error, "Could not save. Please try again."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>New Observation</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          aria-label="New Observation"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FormAlert message={errors.form} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Child</legend>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {roster.map((child) => (
                <li key={child.id}>
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={childId === child.id}
                    onClick={() => {
                      setChildId(child.id);
                    }}
                    className={cn(
                      "h-auto w-full flex-col gap-1 rounded-xl p-2 text-xs font-normal",
                      childId === child.id && "border-primary bg-primary/10",
                    )}
                  >
                    <ChildAvatar
                      childId={child.id}
                      name={child.name}
                      photoUrl={child.photoUrl}
                      className="size-10"
                    />
                    <span className="w-full truncate text-center">
                      {child.name.split(" ")[0]}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
            <FieldError message={errors.child} />
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Development Domain</legend>
            <div className="flex flex-wrap gap-2">
              {domains.map((domain) => (
                <Button
                  key={domain.id}
                  type="button"
                  size="sm"
                  variant={domainId === domain.id ? "default" : "outline"}
                  aria-pressed={domainId === domain.id}
                  className="h-auto min-h-9 rounded-full whitespace-normal"
                  onClick={() => {
                    setDomainId(domain.id);
                  }}
                >
                  {domain.name}
                </Button>
              ))}
            </div>
            <FieldError message={errors.domain} />
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="observation-note" required>
              What you observed
            </Label>
            <Textarea
              id="observation-note"
              rows={3}
              value={note}
              aria-invalid={errors.note != null}
              onChange={(event) => {
                setNote(event.target.value);
              }}
              placeholder="Built a tower of six blocks and counted them aloud."
            />
            <FieldError message={errors.note} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="observation-date">Day</Label>
              <Input
                id="observation-date"
                type="date"
                className="h-10"
                max={today}
                value={observedOn}
                onChange={(event) => {
                  setObservedOn(event.target.value || today);
                }}
              />
            </div>
            <Button type="submit" className="h-10" disabled={saving}>
              {saving ? "Saving…" : "Save Observation"}
            </Button>
          </div>
          {saved == null ? null : (
            <p
              role="status"
              className="text-sm text-emerald-700 dark:text-emerald-300"
            >
              {saved}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Edit one Observation in place: its note, Development Domain and date.
 * For its author and the Centre's managers (the API's `canEdit`).
 */
function ObservationEditForm({
  item,
  domains,
  onDone,
}: {
  item: PreschoolObservation;
  domains: readonly PreschoolDevelopmentDomain[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const today = todayInIndia(new Date());
  const [note, setNote] = useState(item.note);
  const [domainId, setDomainId] = useState(item.domainId);
  const [observedOn, setObservedOn] = useState(item.observedOn);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const items = domains.map((domain) => ({
    value: domain.id,
    label: domain.name,
  }));
  if (!items.some((domain) => domain.value === item.domainId))
    items.push({ value: item.domainId, label: item.domainName });
  const noteId = `observation-note-${item.id}`;
  const dateId = `observation-date-${item.id}`;
  const domainFieldId = `observation-domain-${item.id}`;

  return (
    <form
      noValidate
      aria-label={`Edit the Observation on ${item.childName}`}
      className="min-w-0 flex-1 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (note.trim() === "") {
          setError("Write what you noticed.");
          return;
        }
        if (observedOn === "" || observedOn > today) {
          setError("Choose a day up to today.");
          return;
        }
        setError(undefined);
        setSaving(true);
        updatePreschoolObservation(item.id, {
          note: note.trim(),
          domainId,
          observedOn,
        })
          .then(async () => {
            await queryClient.invalidateQueries({
              queryKey: preschoolObservationKeys.all,
            });
            onDone();
          })
          .catch((caught: unknown) => {
            setError(messageOf(caught, "Could not save it."));
          })
          .finally(() => {
            setSaving(false);
          });
      }}
    >
      <p className="font-medium">{item.childName}</p>
      <FormAlert message={error} />
      <div className="space-y-1.5">
        <Label htmlFor={noteId} required>
          Note
        </Label>
        <Textarea
          id={noteId}
          rows={3}
          aria-required
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={domainFieldId}>Development Domain</Label>
          <Select
            items={items}
            value={domainId}
            onValueChange={(value) => {
              if (value != null) setDomainId(value);
            }}
          >
            <SelectTrigger
              id={domainFieldId}
              size="lg"
              className="w-full min-w-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {items.map((domain) => (
                <SelectItem key={domain.value} value={domain.value}>
                  {domain.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={dateId}>Date</Label>
          <Input
            id={dateId}
            type="date"
            className="h-10"
            max={today}
            value={observedOn}
            onChange={(event) => {
              setObservedOn(event.target.value);
            }}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="h-11" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Feed({
  classroomId,
  childId,
  domainId,
  roster,
}: {
  classroomId: string;
  childId: string;
  domainId: string;
  roster: readonly RosterChild[];
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<string | null>(null);
  const { data: domains } = useSuspenseQuery(preschoolDomainsQueryOptions());
  const { data } = useSuspenseQuery(
    preschoolObservationsQueryOptions(
      childId === ANY
        ? { classroomId, domainId: domainId === ANY ? undefined : domainId }
        : { childId, domainId: domainId === ANY ? undefined : domainId },
    ),
  );
  if (data.items.length === 0)
    return (
      <EmptyState
        size="sm"
        className="border"
        icon={NotePencilIcon}
        tone="sky"
        title="No Observations yet"
        description="What you notice each day becomes the term's Progress Report."
      />
    );
  const photo = new Map(roster.map((child) => [child.id, child.photoUrl]));
  const editingItem = data.items.find((item) => item.id === editing);
  return (
    <div className="space-y-2">
      <FormAlert message={error} />
      <ul className="space-y-2">
        {data.items.map((item) => (
          <li
            key={item.id}
            className="bg-card flex gap-3 rounded-xl border p-3 text-sm"
          >
            <ChildAvatar
              childId={item.childId}
              name={item.childName}
              photoUrl={photo.get(item.childId)}
              className="size-9 shrink-0"
            />
            {editingItem?.id === item.id ? (
              <ObservationEditForm
                item={item}
                domains={domains.items}
                onDone={() => {
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.childName}</span>
                    <Badge variant="secondary">{item.domainName}</Badge>
                  </p>
                  <p className="break-words whitespace-pre-line">{item.note}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(item.observedOn)} · {item.createdByName}
                  </p>
                </div>
                {item.canEdit ? (
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={`Edit the Observation on ${item.childName}`}
                      onClick={() => {
                        setError(undefined);
                        setEditing(item.id);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={`Remove the Observation on ${item.childName}`}
                      onClick={() => {
                        setError(undefined);
                        void removePreschoolObservation(item.id)
                          .then(() =>
                            queryClient.invalidateQueries({
                              queryKey: preschoolObservationKeys.all,
                            }),
                          )
                          .catch((caught: unknown) => {
                            setError(messageOf(caught, "Could not remove it."));
                          });
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      {data.total > data.items.length ? (
        <p className="text-muted-foreground text-xs">
          Showing the newest {data.items.length} of {data.total}.
        </p>
      ) : null}
    </div>
  );
}

/** The Classroom's Observations: quick add on top, the feed below. */
export function ObservationsTab({ classroomId }: { classroomId: string }) {
  const queryClient = useQueryClient();
  const { data: classroom } = useSuspenseQuery(
    classroomQueryOptions(classroomId),
  );
  const { data: domains } = useSuspenseQuery(preschoolDomainsQueryOptions());
  const [childId, setChildId] = useState(ANY);
  const [domainId, setDomainId] = useState(ANY);
  const roster = classroom.roster.map((child) => ({
    id: child.childId,
    name: childName(child.firstName, child.lastName),
    photoUrl: child.photoUrl,
  }));
  const childOptions = [
    { value: ANY, label: "Every Child" },
    ...roster.map((child) => ({ value: child.id, label: child.name })),
  ];
  const domainOptions = [
    { value: ANY, label: "Every Domain" },
    ...domains.items.map((domain) => ({
      value: domain.id,
      label: domain.name,
    })),
  ];
  return (
    <div className="space-y-6">
      <QuickAdd
        roster={roster}
        domains={domains.items}
        onSaved={() =>
          queryClient.invalidateQueries({
            queryKey: preschoolObservationKeys.all,
          })
        }
      />
      <section aria-labelledby="recent-observations" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="recent-observations" className="text-lg font-semibold">
            Recent Observations
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(
              [
                ["Child", childOptions, childId, setChildId],
                ["Domain", domainOptions, domainId, setDomainId],
              ] as const
            ).map(([label, options, value, set]) => (
              <Select
                key={label}
                items={options}
                value={value}
                onValueChange={(next) => {
                  if (next != null) set(next);
                }}
              >
                <SelectTrigger
                  aria-label={`Filter by ${label}`}
                  className="w-full min-w-0 sm:w-52"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" alignItemWithTrigger={false}>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>
        </div>
        <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
          <Feed
            classroomId={classroomId}
            childId={childId}
            domainId={domainId}
            roster={roster}
          />
        </Suspense>
      </section>
    </div>
  );
}
