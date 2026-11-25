"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import { ChildAvatar } from "@/app/(app)/preschool/_components/child-avatar";
import { shortDate } from "@/app/(app)/preschool/family/_components/family-format";
import { FamilyPage } from "@/app/(app)/preschool/family/_components/family-page";
import type { MeChildView } from "@/src/preschool/application/me";
import {
  preschoolChildQueryOptions,
  type PreschoolChildProfile,
} from "@/src/queries/preschool/children";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Facts({ facts }: { facts: [string, ReactNode][] }) {
  const shown = facts.filter(([, value]) => value != null && value !== "");
  if (shown.length === 0)
    return <p className="text-muted-foreground text-sm">Nothing recorded.</p>;
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function phoneLink(phone: string | null): ReactNode {
  return phone == null ? null : (
    <a href={`tel:${phone}`} className="underline-offset-4 hover:underline">
      {phone}
    </a>
  );
}

function Profile({ profile }: { profile: PreschoolChildProfile }) {
  const admission = profile.currentAdmission;
  const health = profile.health;
  const address = [
    profile.address.line,
    profile.address.city,
    profile.address.state,
    profile.address.pincode,
  ]
    .filter((part) => part != null && part !== "")
    .join(", ");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Details">
        <Facts
          facts={[
            ["Name", profile.name],
            [
              "Born",
              `${shortDate(profile.dateOfBirth)} ${profile.dateOfBirth.slice(0, 4)} · ${profile.ageText}`,
            ],
            ["Admission number", profile.admissionNumber],
            [
              "Classroom",
              admission == null
                ? null
                : `${admission.classroomName} · ${admission.programmeName}`,
            ],
            ["Blood group", profile.bloodGroup],
            ["Mother tongue", profile.motherTongue],
            ["Address", address],
          ]}
        />
      </Section>
      <Section title="Who may collect">
        {profile.authorisedPickups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Only the father and mother. Tell the Centre if someone else will
            collect.
          </p>
        ) : (
          <ul aria-label="Authorised Pickups" className="space-y-2">
            {profile.authorisedPickups.map((pickup) => (
              <li key={pickup.id} className="flex items-center gap-3">
                <ChildAvatar
                  childId={pickup.id}
                  name={pickup.name}
                  photoUrl={pickup.photoUrl}
                  className="size-11"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{pickup.name}</span>
                  <span className="text-muted-foreground block text-sm">
                    {pickup.relationship} · {pickup.phone}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Parents">
        <Facts
          facts={[
            ["Father", profile.father.name],
            ["Father's phone", phoneLink(profile.father.phone)],
            ["Father's email", profile.father.email],
            ["Mother", profile.mother.name],
            ["Mother's phone", phoneLink(profile.mother.phone)],
            ["Mother's email", profile.mother.email],
          ]}
        />
      </Section>
      <Section title="Emergency contact">
        <Facts
          facts={[
            ["Name", profile.emergencyContact.name],
            ["Relationship", profile.emergencyContact.relationship],
            ["Phone", phoneLink(profile.emergencyContact.phone)],
          ]}
        />
      </Section>
      <Section title="Health">
        <Facts
          facts={[
            ["Allergies", health.allergies],
            ["Medical conditions", health.medicalConditions],
            ["Doctor", health.doctorName],
            ["Doctor's phone", phoneLink(health.doctorPhone)],
            [
              "Immunisation",
              health.immunisationUpToDate == null
                ? null
                : health.immunisationUpToDate
                  ? "Up to date"
                  : "Not up to date",
            ],
          ]}
        />
      </Section>
    </div>
  );
}

function ChildDetails({ child }: { child: MeChildView }) {
  const { data } = useSuspenseQuery(preschoolChildQueryOptions(child.id));
  return (
    <div className="space-y-4">
      <Profile profile={data} />
      <p className="bg-muted/50 rounded-xl p-3 text-sm">
        To change anything, tell the Centre.
      </p>
    </div>
  );
}

/** A Child's record as the family sees it, read only. */
export function FamilyChildScreen() {
  return (
    <FamilyPage title={(child) => `${child.firstName}'s details`}>
      {(child) => <ChildDetails key={child.id} child={child} />}
    </FamilyPage>
  );
}
