"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  enquiryQueries,
  updateEnquiryDetails,
  type EnquiryInput,
} from "@/src/queries/enquiries";

import { EnquiryForm } from "./enquiry-form";

export function EnquiryEditScreen({ enquiryId }: { enquiryId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: enquiry } = useSuspenseQuery(enquiryQueries.detail(enquiryId));
  const { data: options } = useSuspenseQuery(enquiryQueries.options());
  const detailPath = `/enquiries/${enquiryId}`;
  const update = useMutation({
    mutationFn: (input: EnquiryInput) => updateEnquiryDetails(enquiryId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: enquiryQueries.key.all });
      router.push(detailPath);
    },
  });

  return (
    <main className="w-full p-6">
      <EnquiryForm
        key={enquiry.updatedAt}
        options={options}
        enquiry={enquiry}
        back={{ href: detailPath, label: enquiry.prospectName }}
        onCancel={() => {
          router.push(detailPath);
        }}
        onSubmit={async (input) => {
          await update.mutateAsync(input);
        }}
      />
    </main>
  );
}
