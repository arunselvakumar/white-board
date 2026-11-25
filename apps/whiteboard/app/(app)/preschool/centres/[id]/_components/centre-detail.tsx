"use client";

import { Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import { FormAlert } from "@/components/auth/form-alert";
import {
  CentreDetailsForm,
  CentreOwnershipForm,
  centreToDetailsValues,
  centreToOwnershipValues,
  OWNERSHIP_LABEL,
} from "@/app/(app)/preschool/centres/_components/centre-form";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import type {
  PreschoolCentre,
  PreschoolCentreDetailsInput,
  PreschoolCentreFranchiseInput,
} from "@/src/queries/preschool/centres";

function formatDate(date: string | null): string | null {
  if (date == null) return null;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Facts({ facts }: { facts: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      {facts.map(([label, value]) => (
        <div key={label} className="min-w-0 space-y-0.5">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="break-words">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function EditButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Pencil aria-hidden="true" />
      {label}
    </Button>
  );
}

/**
 * One Centre for the Owner: its details and its ownership, each edited in
 * place, and Close or Reopen.
 */
export function CentreDetail({
  centre,
  onSaveDetails,
  onSaveOwnership,
  onClose,
  onReopen,
}: {
  centre: PreschoolCentre;
  onSaveDetails: (input: PreschoolCentreDetailsInput) => Promise<void>;
  onSaveOwnership: (input: PreschoolCentreFranchiseInput) => Promise<void>;
  onClose: () => Promise<void>;
  onReopen: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<"details" | "ownership" | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const franchised = centre.ownership === "franchised";
  const closed = centre.status === "closed";

  const changeStatus = async (change: () => Promise<void>) => {
    setStatusError(null);
    setChangingStatus(true);
    try {
      await change();
      setConfirmingClose(false);
    } catch (error) {
      setConfirmingClose(false);
      setStatusError(
        error instanceof Error && error.message !== ""
          ? error.message
          : "Could not change this Centre. Please try again.",
      );
    } finally {
      setChangingStatus(false);
    }
  };

  const address = [
    centre.addressLine,
    centre.city,
    centre.state,
    centre.pincode,
  ]
    .filter((part) => part != null)
    .join(", ");

  return (
    <PreschoolPage
      title={centre.name}
      watermark="Centres"
      meta={`${centre.code} · ${OWNERSHIP_LABEL[centre.ownership]}`}
      back={{ href: "/preschool/centres", label: "Centres" }}
      leading={closed ? <Badge variant="destructive">Closed</Badge> : undefined}
      actions={
        closed ? (
          <Button
            type="button"
            disabled={changingStatus}
            onClick={() => {
              void changeStatus(onReopen);
            }}
          >
            Reopen Centre
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setConfirmingClose(true);
            }}
          >
            Close Centre
          </Button>
        )
      }
    >
      <FormAlert message={statusError ?? undefined} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-xs">Active Children</p>
            <p className="text-2xl font-semibold tabular-nums">
              {centre.activeChildren}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Classrooms this Academic Year
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {centre.classrooms}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Centre details</h2>
          </CardTitle>
          {editing === "details" ? null : (
            <CardAction>
              <EditButton
                label="Edit details"
                onClick={() => {
                  setEditing("details");
                }}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {editing === "details" ? (
            <CentreDetailsForm
              defaultValues={centreToDetailsValues(centre)}
              onCancel={() => {
                setEditing(null);
              }}
              onSubmit={async (input) => {
                await onSaveDetails(input);
                setEditing(null);
              }}
            />
          ) : (
            <Facts
              facts={[
                ["Centre code", centre.code],
                ["Phone", centre.phone],
                ["Email", centre.email],
                ["Address", address === "" ? null : address],
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Ownership and royalty</h2>
          </CardTitle>
          {editing === "ownership" ? null : (
            <CardAction>
              <EditButton
                label="Edit ownership"
                onClick={() => {
                  setEditing("ownership");
                }}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {editing === "ownership" ? (
            <CentreOwnershipForm
              defaultValues={centreToOwnershipValues(centre)}
              onCancel={() => {
                setEditing(null);
              }}
              onSubmit={async (input) => {
                await onSaveOwnership(input);
                setEditing(null);
              }}
            />
          ) : (
            <Facts
              facts={[
                ["Ownership", OWNERSHIP_LABEL[centre.ownership]],
                ...(franchised
                  ? ([
                      ["Franchisee", centre.franchiseeName],
                      ["Franchisee phone", centre.franchiseePhone],
                      ["Franchisee email", centre.franchiseeEmail],
                      [
                        "Agreement",
                        centre.agreementStartOn == null &&
                        centre.agreementEndOn == null
                          ? null
                          : `${formatDate(centre.agreementStartOn) ?? "…"} to ${formatDate(centre.agreementEndOn) ?? "…"}`,
                      ],
                      ["Royalty", `${centre.royaltyPercent}%`],
                    ] satisfies [string, ReactNode][])
                  : []),
                [
                  "Fee amounts",
                  centre.mayOverrideFees
                    ? "The Centre may change them"
                    : "As Head Office sets them",
                ],
              ]}
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmingClose}
        onOpenChange={(open) => {
          if (!open) setConfirmingClose(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {centre.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A closed Centre takes no new Admissions. A Centre with active
              Children cannot close; you can reopen it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it open</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={changingStatus}
              onClick={() => {
                void changeStatus(onClose);
              }}
            >
              Close Centre
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PreschoolPage>
  );
}
