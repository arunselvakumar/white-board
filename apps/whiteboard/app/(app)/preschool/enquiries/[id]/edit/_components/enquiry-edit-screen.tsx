"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import {
  EnquiryForm,
  enquiryToValues,
} from "@/app/(app)/preschool/enquiries/_components/enquiry-form";
import { preschoolChildFormOptionsQueryOptions } from "@/src/queries/preschool/children";
import {
  preschoolEnquiryKeys,
  preschoolEnquiryQueryOptions,
  updatePreschoolEnquiryDetails,
} from "@/src/queries/preschool/enquiries";

export function EnquiryEditScreen({ enquiryId }: { enquiryId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: enquiry } = useSuspenseQuery(
    preschoolEnquiryQueryOptions(enquiryId),
  );
  const { data: options } = useSuspenseQuery(
    preschoolChildFormOptionsQueryOptions(enquiry.centreId),
  );
  const back = `/preschool/enquiries/${enquiryId}`;
  return (
    <PreschoolPage
      title={`Edit ${enquiry.childName}`}
      width="form"
      back={{ href: back, label: enquiry.childName }}
    >
      <EnquiryForm
        mode="edit"
        enquiryId={enquiryId}
        defaultValues={enquiryToValues(enquiry)}
        options={options}
        onCancel={() => {
          router.push(back);
        }}
        onSubmit={async (input) => {
          await updatePreschoolEnquiryDetails(enquiryId, input);
          await queryClient.invalidateQueries({
            queryKey: preschoolEnquiryKeys.all,
          });
          router.push(back);
        }}
      />
    </PreschoolPage>
  );
}
