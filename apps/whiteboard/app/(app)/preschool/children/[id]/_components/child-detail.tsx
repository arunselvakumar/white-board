"use client";

import { CurrencyInrIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { ChildAvatar } from "@/app/(app)/preschool/_components/child-avatar";
import { PhoneLinks } from "@/app/(app)/preschool/_components/phone-links";
import { formatDate } from "@/app/(app)/preschool/_components/preschool-format";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import {
  AddressFields,
  ChildDetailsFields,
  childSectionSchema,
  DocumentFields,
  EmergencyFields,
  healthSectionSchema,
  HealthFields,
  ParentFields,
  parentsSectionSchema,
  PickupFields,
  pickupsSectionSchema,
  profileToValues,
  type ChildFormValues,
} from "@/app/(app)/preschool/children/_components/child-form-fields";
import { todayInIndia } from "@/src/preschool/domain/dates";
import {
  PRESCHOOL_CHILD_STATUS_LABELS,
  type PreschoolAdmission,
  type PreschoolChildProfile,
} from "@/src/queries/preschool/children";
import type { PreschoolRole } from "@/src/queries/preschool/me";

import {
  ChildAdmissionDialog,
  type AdmissionActionKind,
} from "./child-admission-actions";
import { ChildSection } from "./child-section-editor";

const GENDER_LABEL = { girl: "Girl", boy: "Boy", other: "Other" } as const;
const END_REASON_LABEL = {
  promoted: "Promoted",
  withdrawn: "Withdrawn",
  classroom_changed: "Moved Classroom",
  graduated: "Graduated",
} as const;
const DOCUMENT_LABELS: [keyof PreschoolChildProfile["documents"], string][] = [
  ["hasBirthCertificate", "Birth certificate"],
  ["hasAadhaar", "Aadhaar"],
  ["hasImmunisationCard", "Immunisation card"],
  ["hasPhotos", "Photos"],
  ["hasAddressProof", "Address proof"],
];

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

function Phone({
  phone,
  name,
}: {
  phone: string | null;
  name?: string | null;
}) {
  return phone == null ? null : (
    <PhoneLinks phone={phone} label={name ?? undefined} />
  );
}

/** A card beside the Child's sections; other areas add theirs to `overviewCards`. */
type OverviewCard = { key: string; node: ReactNode };

/**
 * Cards in the Child page's side column. Attendance this month, the latest
 * Daily Report, Stock received and Observations each add one entry here.
 */
function overviewCards(
  child: PreschoolChildProfile,
  role: PreschoolRole,
): OverviewCard[] {
  const managers = role === "owner" || role === "centre_head";
  return managers
    ? [
        {
          key: "fees",
          node: (
            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  <h2 className="flex items-center gap-2">
                    <CurrencyInrIcon aria-hidden="true" className="size-4" />
                    Fees
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Invoices, Fee Payments and Receipts for {child.firstName}.
                </p>
                <Link
                  href={`/preschool/fees/children/${child.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Open fees
                </Link>
              </CardContent>
            </Card>
          ),
        },
      ]
    : [];
}

function AdmissionHistory({
  admissions,
}: {
  admissions: PreschoolAdmission[];
}) {
  if (admissions.length === 0)
    return <p className="text-muted-foreground text-sm">No Admission yet.</p>;
  return (
    <ol className="space-y-3">
      {admissions.map((admission) => (
        <li key={admission.id} className="rounded-xl border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {admission.classroomName} · {admission.programmeName}
            </p>
            {admission.status === "active" ? (
              <Badge>Current</Badge>
            ) : admission.endReason == null ? null : (
              <Badge variant="outline">
                {END_REASON_LABEL[admission.endReason]}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {admission.academicYearName} · from{" "}
            {formatDate(admission.admittedOn)}
            {admission.endedOn == null
              ? null
              : ` to ${formatDate(admission.endedOn)}`}
          </p>
        </li>
      ))}
    </ol>
  );
}

export type ChildDetailActions = {
  saveProfile: (values: ChildFormValues) => Promise<void>;
  saveParents: (values: ChildFormValues) => Promise<void>;
  savePickups: (values: ChildFormValues) => Promise<void>;
  saveHealth: (values: ChildFormValues) => Promise<void>;
  reload: () => Promise<void>;
  move: (input: { classroomId: string; movedOn: string }) => Promise<void>;
  promote: (input: {
    academicYearId: string;
    programmeId: string;
    classroomId: string;
  }) => Promise<void>;
  withdraw: (input: { withdrawnOn: string; reason: string }) => Promise<void>;
};

/**
 * A Child's page. Managers edit each section in place and move, promote or
 * withdraw; a Teacher reads (no fee link); a withdrawn Child is read only.
 */
export function ChildDetail({
  child,
  role,
  ageWarning,
  actions,
}: {
  child: PreschoolChildProfile;
  role: PreschoolRole;
  ageWarning: string | null;
  actions: ChildDetailActions;
}) {
  const [dialog, setDialog] = useState<AdmissionActionKind | null>(null);
  const managers = role === "owner" || role === "centre_head";
  const active = child.status === "active";
  const editable = managers && active;
  const values = profileToValues(child, todayInIndia(new Date()));
  const current = child.currentAdmission;
  const cards = overviewCards(child, role);
  const section = {
    editable,
    defaultValues: values,
    onReload: actions.reload,
  };

  return (
    <PreschoolPage
      title={child.name}
      watermark="Children"
      leading={
        <ChildAvatar
          childId={child.id}
          name={child.name}
          photoUrl={child.photoUrl}
          className="size-12"
        />
      }
      meta={[
        child.admissionNumber,
        child.ageText,
        current?.classroomName ?? null,
      ]
        .filter((part) => part != null)
        .join(" · ")}
      back={{ href: "/preschool/children", label: "Children" }}
      actions={
        editable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialog("move");
              }}
            >
              Move Classroom
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialog("promote");
              }}
            >
              Promote
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                setDialog("withdraw");
              }}
            >
              Withdraw
            </Button>
          </div>
        ) : undefined
      }
    >
      {active ? null : (
        <Alert>
          <AlertTitle>
            {PRESCHOOL_CHILD_STATUS_LABELS[child.status]}
            {child.withdrawnOn == null
              ? null
              : ` on ${formatDate(child.withdrawnOn)}`}
          </AlertTitle>
          <AlertDescription>
            {child.withdrawReason ?? "This record can only be read."}
          </AlertDescription>
        </Alert>
      )}
      {child.health.allergies == null ? null : (
        <Alert variant="destructive">
          <WarningIcon aria-hidden="true" />
          <AlertTitle>Allergies</AlertTitle>
          <AlertDescription>{child.health.allergies}</AlertDescription>
        </Alert>
      )}
      {ageWarning == null ? null : (
        <Alert>
          <AlertTitle>Admitted, with an age warning</AlertTitle>
          <AlertDescription>{ageWarning}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Tabs defaultValue="profile" className="min-w-0">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList aria-label="Child's record">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="family">Family</TabsTrigger>
              <TabsTrigger value="pickups">Pickups</TabsTrigger>
              <TabsTrigger value="health">Health & documents</TabsTrigger>
              <TabsTrigger value="admissions">Admissions</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="profile" className="space-y-4 pt-4">
            <ChildSection
              title="Profile"
              schema={childSectionSchema}
              fields={(form) => (
                <>
                  <ChildDetailsFields form={form} />
                  <AddressFields form={form} />
                </>
              )}
              onSave={actions.saveProfile}
              {...section}
            >
              <Facts
                facts={[
                  ["Name", child.name],
                  ["Date of birth", formatDate(child.dateOfBirth)],
                  ["Age", child.ageText],
                  ["Gender", GENDER_LABEL[child.gender]],
                  ["Blood group", child.bloodGroup],
                  ["Mother tongue", child.motherTongue],
                  [
                    "Address",
                    [
                      child.address.line,
                      child.address.city,
                      child.address.state,
                      child.address.pincode,
                    ]
                      .filter((part) => part != null)
                      .join(", ") || null,
                  ],
                  ["Admission number", child.admissionNumber],
                ]}
              />
            </ChildSection>
          </TabsContent>
          <TabsContent value="family" className="space-y-4 pt-4">
            <ChildSection
              title="Family"
              schema={parentsSectionSchema}
              fields={(form) => (
                <div className="space-y-6">
                  <ParentFields form={form} who="father" />
                  <ParentFields form={form} who="mother" />
                  <fieldset className="space-y-3">
                    <legend className="mb-2 font-medium">
                      Emergency contact
                    </legend>
                    <EmergencyFields form={form} />
                  </fieldset>
                </div>
              )}
              onSave={actions.saveParents}
              {...section}
            >
              <div className="space-y-6">
                {(["father", "mother"] as const).map((who) => {
                  const parent = child[who];
                  return (
                    <div key={who} className="space-y-2">
                      <h3 className="text-sm font-semibold">
                        {who === "father" ? "Father" : "Mother"}
                      </h3>
                      <Facts
                        facts={[
                          ["Name", parent.name],
                          [
                            "Mobile",
                            <Phone
                              key="phone"
                              phone={parent.phone}
                              name={parent.name}
                            />,
                          ],
                          ["Email", parent.email],
                          ["Occupation", parent.occupation],
                        ]}
                      />
                    </div>
                  );
                })}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Emergency contact</h3>
                  <Facts
                    facts={[
                      [
                        "Name",
                        [
                          child.emergencyContact.name,
                          child.emergencyContact.relationship,
                        ]
                          .filter((part) => part != null)
                          .join(" · ") || null,
                      ],
                      [
                        "Phone",
                        <Phone
                          key="phone"
                          phone={child.emergencyContact.phone}
                          name={child.emergencyContact.name}
                        />,
                      ],
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Siblings</h3>
                  {child.siblings.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No other Child shares a parent&apos;s phone or email.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {child.siblings.map((sibling) => (
                        <li key={sibling.id}>
                          <Link
                            href={`/preschool/children/${sibling.id}`}
                            className="underline underline-offset-4"
                          >
                            {sibling.name}
                          </Link>
                          {sibling.classroomName == null
                            ? null
                            : ` · ${sibling.classroomName}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </ChildSection>
          </TabsContent>
          <TabsContent value="pickups" className="space-y-4 pt-4">
            <ChildSection
              title="Authorised Pickups"
              schema={pickupsSectionSchema}
              fields={(form) => <PickupFields form={form} />}
              onSave={actions.savePickups}
              {...section}
            >
              {child.authorisedPickups.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Only the Parents may collect {child.firstName}.
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {child.authorisedPickups.map((pickup) => (
                    <li
                      key={pickup.id}
                      className="flex min-w-0 items-center gap-3 rounded-xl border p-3 text-sm"
                    >
                      <ChildAvatar
                        childId={pickup.id}
                        name={pickup.name}
                        photoUrl={pickup.photoUrl}
                        className="size-10"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{pickup.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {pickup.relationship}
                        </p>
                        <PhoneLinks phone={pickup.phone} label={pickup.name} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ChildSection>
          </TabsContent>
          <TabsContent value="health" className="space-y-4 pt-4">
            <ChildSection
              title="Health & documents"
              schema={healthSectionSchema}
              fields={(form) => (
                <>
                  <HealthFields form={form} />
                  <DocumentFields form={form} />
                </>
              )}
              onSave={actions.saveHealth}
              {...section}
            >
              <div className="space-y-4">
                <Facts
                  facts={[
                    ["Allergies", child.health.allergies],
                    ["Medical conditions", child.health.medicalConditions],
                    ["Doctor", child.health.doctorName],
                    ["Doctor's phone", child.health.doctorPhone],
                    [
                      "Immunisation",
                      child.health.immunisationUpToDate == null
                        ? null
                        : child.health.immunisationUpToDate
                          ? "Up to date"
                          : "Not up to date",
                    ],
                  ]}
                />
                <ul className="flex flex-wrap gap-2" aria-label="Documents">
                  {DOCUMENT_LABELS.map(([key, label]) => (
                    <li key={key}>
                      <Badge
                        variant={child.documents[key] ? "secondary" : "outline"}
                      >
                        {child.documents[key] ? "✓ " : "Missing: "}
                        {label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </ChildSection>
          </TabsContent>
          <TabsContent value="admissions" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Admissions</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AdmissionHistory admissions={child.admissions} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        {cards.length === 0 ? null : (
          <aside className="space-y-4" aria-label="At a glance">
            {cards.map((card) => (
              <div key={card.key}>{card.node}</div>
            ))}
          </aside>
        )}
      </div>
      {editable ? (
        <ChildAdmissionDialog
          kind={dialog}
          child={child}
          onClose={() => {
            setDialog(null);
          }}
          onMove={actions.move}
          onPromote={actions.promote}
          onWithdraw={actions.withdraw}
        />
      ) : null}
    </PreschoolPage>
  );
}
