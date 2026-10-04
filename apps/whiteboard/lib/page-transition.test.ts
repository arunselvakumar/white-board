import { describe, expect, it } from "vitest";

import {
  pageTransitionHref,
  type PageTransitionClick,
} from "./page-transition";

function click(
  href: string,
  current = "http://localhost:3000/app/login",
  overrides: Partial<PageTransitionClick> = {},
): PageTransitionClick {
  return {
    destination: new URL(href),
    current: new URL(current),
    reducedMotion: false,
    download: false,
    target: null,
    button: 0,
    modified: false,
    defaultPrevented: false,
    canViewTransition: true,
    ...overrides,
  };
}

describe("pageTransitionHref", () => {
  it("returns the router path without the /app base path", () => {
    expect(
      pageTransitionHref(click("http://localhost:3000/app/signup")),
    ).toBe("/signup");
    expect(
      pageTransitionHref(
        click("http://localhost:3000/app/students/abc?tab=fees#dues"),
      ),
    ).toBe("/students/abc?tab=fees#dues");
    expect(
      pageTransitionHref(
        click("http://localhost:3000/app", "http://localhost:3000/app/login"),
      ),
    ).toBe("/");
    expect(
      pageTransitionHref(
        click("http://localhost:3000/app/", "http://localhost:3000/app/login"),
      ),
    ).toBe("/");
  });

  it("leaves modified, external, download, and non-page clicks alone", () => {
    expect(
      pageTransitionHref(
        click("http://localhost:3000/app/signup", undefined, {
          modified: true,
        }),
      ),
    ).toBeNull();
    expect(
      pageTransitionHref(
        click("http://localhost:3000/app/signup", undefined, { button: 1 }),
      ),
    ).toBeNull();
    expect(
      pageTransitionHref(
        click("http://localhost:3000/app/signup", undefined, {
          target: "_blank",
        }),
      ),
    ).toBeNull();
    expect(
      pageTransitionHref(
        click("http://localhost:3000/app/signup", undefined, {
          download: true,
        }),
      ),
    ).toBeNull();
    expect(
      pageTransitionHref(
        click("http://localhost:3000/app/signup", undefined, {
          defaultPrevented: true,
        }),
      ),
    ).toBeNull();
    expect(
      pageTransitionHref(
        click("http://localhost:3000/app/signup", undefined, {
          reducedMotion: true,
        }),
      ),
    ).toBeNull();
    expect(
      pageTransitionHref(
        click("http://localhost:3000/app/signup", undefined, {
          canViewTransition: false,
        }),
      ),
    ).toBeNull();
    expect(
      pageTransitionHref(click("https://example.com/app/signup")),
    ).toBeNull();
    expect(pageTransitionHref(click("http://localhost:3000/marketing"))).toBe(
      null,
    );
    expect(pageTransitionHref(click("http://localhost:3000/application"))).toBe(
      null,
    );
    expect(
      pageTransitionHref(
        click(
          "http://localhost:3000/app/api/teachers/1/documents/2",
          "http://localhost:3000/app/teachers/1",
        ),
      ),
    ).toBeNull();
  });

  it("leaves same-page, hash-only, and query-only clicks alone", () => {
    expect(
      pageTransitionHref(click("http://localhost:3000/app/login")),
    ).toBeNull();
    expect(
      pageTransitionHref(click("http://localhost:3000/app/login#password")),
    ).toBeNull();
    expect(
      pageTransitionHref(
        click(
          "http://localhost:3000/app/students?q=ada",
          "http://localhost:3000/app/students",
        ),
      ),
    ).toBeNull();
    expect(
      pageTransitionHref(
        click(
          "http://localhost:3000/app/students?q=ada",
          "http://localhost:3000/app/students?q=lin",
        ),
      ),
    ).toBeNull();
  });
});
