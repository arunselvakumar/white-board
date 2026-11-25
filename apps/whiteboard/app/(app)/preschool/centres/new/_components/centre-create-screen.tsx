"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { CentreForm } from "@/app/(app)/preschool/centres/_components/centre-form";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { createPreschoolCentre } from "@/src/queries/preschool/centres";
import { preschoolKeys } from "@/src/queries/preschool/me";

export function CentreCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: createPreschoolCentre,
    onSuccess: async (centre) => {
      await queryClient.invalidateQueries({ queryKey: preschoolKeys.all });
      router.push(`/preschool/centres/${centre.id}`);
    },
  });

  return (
    <PreschoolPage
      title="Add Centre"
      meta={null}
      width="form"
      back={{ href: "/preschool/centres", label: "Centres" }}
    >
      <CentreForm
        onCancel={() => {
          router.push("/preschool/centres");
        }}
        onSubmit={async (input) => {
          await create.mutateAsync(input);
        }}
      />
    </PreschoolPage>
  );
}
