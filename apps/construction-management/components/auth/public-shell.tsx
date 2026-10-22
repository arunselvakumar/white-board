import Image from "next/image";
import { Fragment, type ReactNode } from "react";

import { AUTH_PHOTOS, type AuthPhoto, unsplashUrl } from "./auth-photos";

const TAGLINE =
  "Every site, every bag of cement, every day's labour — in one place.";
const TAGLINE_WORDS = TAGLINE.split(" ");
/** Seconds between one tagline word starting to appear and the next. */
const WORD_STAGGER_S = 0.2;
/** Matches `--animate-text-generate` in `@repo/ui/globals.css`. */
const WORD_DURATION_S = 0.5;

/**
 * The brand half of the split layout: a site photo under the tagline. On load
 * the tagline's words fade in and sharpen one after another (Aceternity's Text
 * Generate Effect, in CSS), then the sub-line follows. Screen readers get the
 * sentence once from a visually hidden copy.
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
        <p className="max-w-xl text-4xl leading-tight font-light text-balance xl:max-w-2xl xl:text-5xl">
          <span className="sr-only">{TAGLINE}</span>
          <span aria-hidden="true">
            {TAGLINE_WORDS.map((word, index) => (
              <Fragment key={index}>
                {index > 0 && " "}
                <span
                  className="animate-text-generate motion-reduce:animate-none"
                  style={{ animationDelay: `${index * WORD_STAGGER_S}s` }}
                >
                  {word}
                </span>
              </Fragment>
            ))}
          </span>
        </p>
        <p
          className="animate-text-generate text-base text-white/70 motion-reduce:animate-none"
          style={{
            animationDelay: `${(TAGLINE_WORDS.length - 1) * WORD_STAGGER_S + WORD_DURATION_S}s`,
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
    <div className="bg-background flex min-h-svh">
      <AuthBrandPanel photo={photo} />
      <main className="flex min-h-svh w-full shrink-0 flex-col items-center justify-center overflow-y-auto px-8 py-12 lg:w-[min(46%,560px)]">
        <div className="w-full max-w-[352px] space-y-8">{children}</div>
      </main>
    </div>
  );
}
