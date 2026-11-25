"use client";

import { ChalkboardIcon } from "@phosphor-icons/react/ssr";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import {
  emptyChildValues,
  type ChildFormValues,
} from "@/app/(app)/preschool/children/_components/child-form-fields";
import { todayInIndia } from "@/src/preschool/domain/dates";
import {
  admitPreschoolChild,
  preschoolChildFormOptionsQueryOptions,
  preschoolChildKeys,
  type PreschoolChildFormOptions,
} from "@/src/queries/preschool/children";
import {
  preschoolEnquiryKeys,
  preschoolEnquiryQueryOptions,
  type PreschoolEnquiry,
} from "@/src/queries/preschool/enquiries";

import { AdmissionForm } from "./admission-form";

/** The admission form prefilled from an Enquiry: the enquiring parent goes in as the father. */
function fromEnquiry(
  enquiry: PreschoolEnquiry,
  today: string,
): ChildFormValues {
  const values = emptyChildValues(today);
  const [firstName = "", ...rest] = enquiry.childName.trim().split(/\s+/);
  return {
    ...values,
    child: {
      ...values.child,
      firstName,
      lastName: rest.join(" "),
      dateOfBirth: enquiry.childDateOfBirth ?? "",
      ...(enquiry.childGender == null ? {} : { gender: enquiry.childGender }),
    },
    father: {
      name: enquiry.parentName,
      phone: enquiry.parentPhone,
      email: enquiry.parentEmail ?? "",
      occupation: "",
    },
    admission: {
      ...values.admission,
      programmeId: enquiry.programmeId ?? "",
    },
  };
}

function Admission({
  options,
  defaultValues,
  enquiryId,
  back,
}: {
  options: PreschoolChildFormOptions;
  defaultValues: ChildFormValues;
  enquiryId?: string;
  back: { href: string; label: string };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { centre } = useActiveCentre();
  const hasClassroom = options.classrooms.some(
    (room) => room.academicYearId === options.currentAcademicYearId,
  );
  return (
    <PreschoolPage title="Admit a Child" width="form" back={back}>
      {hasClassroom ? (
        <>
          {enquiryId == null ? null : (
            <p className="text-muted-foreground text-sm">
              Filled in from the Enquiry. The enquiring parent is entered as the
              father; swap them if it was the mother.
            </p>
          )}
          <AdmissionForm
            defaultValues={defaultValues}
            options={options}
            centreId={centre.id}
            enquiryId={enquiryId}
            onCancel={() => {
              router.push(back.href);
            }}
            onSubmit={async (input) => {
              const { child, ageWarning } = await admitPreschoolChild(input);
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: preschoolChildKeys.all,
                }),
                queryClient.invalidateQueries({
                  queryKey: preschoolEnquiryKeys.all,
                }),
              ]);
              const query =
                ageWarning == null
                  ? ""
                  : `?ageWarning=${encodeURIComponent(ageWarning)}`;
              router.push(`/preschool/children/${child.id}${query}`);
            }}
          />
        </>
      ) : (
        <EmptyState
          className="border"
          icon={ChalkboardIcon}
          tone="amber"
          title="No Classroom this year"
          description="Add a Classroom for this Academic Year before admitting a Child."
          actions={
            <Link href="/preschool/classrooms" className={buttonVariants()}>
              Go to Classrooms
            </Link>
          }
        />
      )}
    </PreschoolPage>
  );
}

function AdmissionFromEnquiry({
  enquiryId,
  options,
}: {
  enquiryId: string;
  options: PreschoolChildFormOptions;
}) {
  const { data: enquiry } = useSuspenseQuery(
    preschoolEnquiryQueryOptions(enquiryId),
  );
  return (
    <Admission
      options={options}
      enquiryId={enquiryId}
      defaultValues={fromEnquiry(enquiry, todayInIndia(new Date()))}
      back={{
        href: `/preschool/enquiries/${enquiryId}`,
        label: enquiry.childName,
      }}
    />
  );
}

export function AdmissionScreen({ enquiryId }: { enquiryId?: string }) {
  const { centre } = useActiveCentre();
  const { data: options } = useSuspenseQuery(
    preschoolChildFormOptionsQueryOptions(centre.id),
  );
  if (enquiryId != null)
    return <AdmissionFromEnquiry enquiryId={enquiryId} options={options} />;
  return (
    <Admission
      options={options}
      defaultValues={emptyChildValues(todayInIndia(new Date()))}
      back={{ href: "/preschool/children", label: "Children" }}
    />
  );
}
