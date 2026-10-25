import Image from "next/image";
import type { ReactNode } from "react";

import { AUTH_PHOTOS, type AuthPhoto, unsplashUrl } from "./auth-photos";
import { ScrambledText } from "./scrambled-text";

const TAGLINE =
  "Every site, every bag of cement, every day's labour — in one place.";
/** Seconds the tagline takes to decode; the sub-line follows. */
const TAGLINE_DECODE_S = 1.2;

/**
 * The brand half of the split layout: a site photo under the tagline. On load
 * the tagline decodes out of scrambled characters (React Bits' Scrambled
 * Text), and scrambles again under the pointer; then the sub-line fades in.
 */
export function AuthBrandPanel({
  photo = AUTH_PHOTOS[0],
}: {
  photo?: AuthPhoto;
}) {
  return (
    <section
      aria-label="Construction Management"
      className="relative hidden min-h-svh min-w-0 flex-1 overflow-hidden bg-[#100e22] lg:flex lg:flex-col lg:justify-end"
    >
      <Image
        src={photo.image}
        alt=""
        fill
        preload
        placeholder="blur"
        sizes="(min-width: 1024px) 60vw, 1px"
        className="object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-[#100e22]/90 via-[#100e22]/35 to-[#100e22]/5"
      />
      <div className="relative space-y-5 p-12 pb-16 text-white">
        <ScrambledText
          duration={TAGLINE_DECODE_S}
          className="max-w-xl text-3xl leading-tight font-light text-balance xl:max-w-2xl xl:text-4xl"
        >
          {TAGLINE}
        </ScrambledText>
        <p
          className="animate-text-generate text-base text-white/70 motion-reduce:animate-none"
          style={{
            animationDelay: `${TAGLINE_DECODE_S}s`,
          }}
        >
          Projects, materials, labour and payments for builders and contractors.
        </p>
      </div>
      <p className="absolute right-6 bottom-4 text-[11px] text-white/60">
        Photo by{" "}
        <a
          href={unsplashUrl(`@${photo.username}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-white hover:underline"
        >
          {photo.photographer}
        </a>{" "}
        on{" "}
        <a
          href={unsplashUrl("")}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-white hover:underline"
        >
          Unsplash
        </a>
      </p>
    </section>
  );
}

/** The full-screen split layout used by the sign-in and sign-up flows. */
export function PublicShell({
  photo,
  children,
}: {
  photo?: AuthPhoto;
  children: ReactNode;
}) {
  return (
    <div className="bg-card flex min-h-svh">
      <AuthBrandPanel photo={photo} />
      <main className="flex min-h-svh w-full shrink-0 flex-col items-center justify-center overflow-y-auto px-8 py-12 lg:w-[min(46%,560px)]">
        <div className="w-full max-w-[352px] space-y-8">{children}</div>
      </main>
    </div>
  );
}
