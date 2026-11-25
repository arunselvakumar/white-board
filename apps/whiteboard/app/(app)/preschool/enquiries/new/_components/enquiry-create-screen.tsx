"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { EnquiryForm } from "@/app/(app)/preschool/enquiries/_components/enquiry-form";
import { preschoolChildFormOptionsQueryOptions } from "@/src/queries/preschool/children";
import {
  createPreschoolEnquiry,
  preschoolEnquiryKeys,
} from "@/src/queries/preschool/enquiries";

export function EnquiryCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { centre } = useActiveCentre();
  const { data: options } = useSuspenseQuery(
    preschoolChildFormOptionsQueryOptions(centre.id),
  );
  return (
    <PreschoolPage
      title="Add Enquiry"
      width="form"
      back={{ href: "/preschool/enquiries", label: "Enquiries" }}
    >
      <EnquiryForm
        mode="create"
        options={options}
        onCancel={() => {
          router.push("/preschool/enquiries");
        }}
        onSubmit={async (input) => {
          const enquiry = await createPreschoolEnquiry({
            ...input,
            centreId: centre.id,
          });
          await queryClient.invalidateQueries({
            queryKey: preschoolEnquiryKeys.all,
          });
          router.push(`/preschool/enquiries/${enquiry.id}`);
        }}
      />
    </PreschoolPage>
  );
}
