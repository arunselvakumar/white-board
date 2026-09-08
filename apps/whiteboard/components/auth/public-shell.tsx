import Image from "next/image";
import type { ReactNode } from "react";

const LOGIN_BACKGROUNDS = [
  "/images/login/1.jpg",
  "/images/login/2.jpg",
  "/images/login/3.jpg",
  "/images/login/4.jpg",
] as const;

function pickBackground(): string {
  const index = Math.floor(Math.random() * LOGIN_BACKGROUNDS.length);
  return LOGIN_BACKGROUNDS[index] ?? LOGIN_BACKGROUNDS[0];
}

export function PublicShell({
  children,
  background,
}: {
  children: ReactNode;
  background?: string;
}) {
  const image = background ?? pickBackground();

  return (
    <div className="bg-background flex min-h-svh">
      <div className="relative hidden flex-1 overflow-hidden lg:block">
        <Image
          src={image}
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 70vw, 0px"
          className="object-cover"
        />
        <div className="bg-brand-900/30 absolute inset-0" />
      </div>
      <div className="flex w-full shrink-0 flex-col items-center justify-center overflow-y-auto px-8 py-12 lg:w-[480px]">
        <div className="w-full max-w-[352px] space-y-8">{children}</div>
      </div>
    </div>
  );
}
