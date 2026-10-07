"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  createEnquiry,
  enquiryQueries,
  type CreateEnquiryInput,
} from "@/src/queries/enquiries";

import { EnquiryForm } from "./enquiry-form";

export function EnquiryCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: options } = useSuspenseQuery(enquiryQueries.options());
  const create = useMutation({
    mutationFn: (input: CreateEnquiryInput) => createEnquiry(input),
    onSuccess: async (enquiry) => {
      await queryClient.invalidateQueries({ queryKey: enquiryQueries.key.all });
      router.push(`/enquiries/${enquiry.id}`);
    },
  });

  return (
    <main className="w-full p-6">
      <EnquiryForm
        options={options}
        back={{ href: "/enquiries", label: "Enquiries" }}
        onCancel={() => {
          router.push("/enquiries");
        }}
        onSubmit={async (input) => {
          await create.mutateAsync(input);
        }}
      />
    </main>
  );
}
