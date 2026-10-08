import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { QuerySuspense } from "@/components/query-suspense";
import type { FamilyTestResultsView } from "@/src/queries/class-tests";
import { signInAs } from "../../../.storybook/mocks/auth";

import {
  ashaResults,
  COMPARISON_WORDS,
  raviResults,
  raviWithoutResults,
  studentResultsView,
} from "./family-results.fixtures";
import { FamilyResults, FamilyResultsScreen } from "./family-results-screen";

/* ------------------------------------------------------------------ */
/* API mock: answers GET /api/training-institute/home/results          */
/* ------------------------------------------------------------------ */

let resultsRequests = 0;

function mockResultsApi(view: FamilyTestResultsView) {
  resultsRequests = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(href, window.location.origin);
    const method = (init?.method ?? "GET").toUpperCase();
    if (
      method !== "GET" ||
      url.pathname !== "/api/training-institute/home/results"
    )
      return original(input, init);
    resultsRequests += 1;
    return Promise.resolve(
      new Response(JSON.stringify(view), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return () => {
    globalThis.fetch = original;
  };
}

/** Each story gets its own cache, so stories never see each other's data. */
const withFreshQueryClient: Decorator = (Story) => {
  function Fresh() {
    const [client] = useState(
      () =>
        new QueryClient({
          defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
        }),
    );
    return (
      <QueryClientProvider client={client}>
        <QuerySuspense>
          <Story />
        </QuerySuspense>
      </QueryClientProvider>
    );
  }
  return <Fresh />;
};

/** Families never see Batch numbers or anyone else's marks. */
async function expectNoComparison(canvasElement: HTMLElement) {
  await expect(canvasElement.textContent).not.toMatch(COMPARISON_WORDS);
  for (const element of canvasElement.querySelectorAll("[aria-label]"))
    await expect(element.getAttribute("aria-label")).not.toMatch(
      COMPARISON_WORDS,
    );
}

const meta = {
  title: "Pages/Student and Parent Results",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/student/results" } },
  },
  decorators: [withFreshQueryClient],
  beforeEach() {
    signInAs("student", { name: "Riverside Centre" });
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const StudentResults: Story = {
  render: () => (
    <AppShell>
      <FamilyResults results={studentResultsView} role="student" />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Results" }),
    ).toBeVisible();
    // A Student sees no heading with their own name.
    await expect(
      canvas.queryByRole("heading", { name: "Asha Kumar" }),
    ).toBeNull();

    const list = within(canvas.getByRole("list", { name: "Your results" }));
    const items = list.getAllByRole("listitem");
    // Newest Test date first.
    await expect(
      items.map((item) => item.querySelector("p span")?.textContent),
    ).toEqual([
      "Functions test",
      "Loops re-test",
      "Loops test",
      "Variables quiz",
      "Tally basics",
      "Ledgers test",
    ]);

    const [functions, retest, loops, quiz, absent, exempt] = items.map((item) =>
      within(item),
    );
    if (
      functions == null ||
      retest == null ||
      loops == null ||
      quiz == null ||
      absent == null ||
      exempt == null
    )
      throw new Error("Expected six results");

    // Scored and passed, with Batch, date, pass mark, topic, and remark.
    await expect(functions.getByText("42 / 50")).toBeVisible();
    await expect(functions.getByText("42 out of 50")).toBeInTheDocument();
    await expect(functions.getByText("Pass")).toBeVisible();
    await expect(
      functions.getByText("Python · Python Evening · Tue, 6 Oct"),
    ).toBeVisible();
    await expect(functions.getByText("Pass mark 20 of 50")).toBeVisible();
    await expect(
      functions.getByText("Topic: Functions, arguments, and return values"),
    ).toBeVisible();
    await expect(
      functions.getByText("Neat work on default arguments."),
    ).toBeVisible();
    await expect(functions.queryByText("Individual Test")).toBeNull();

    // A single-student Test is marked, subtly.
    await expect(retest.getByText("Individual Test")).toBeVisible();
    await expect(retest.getByText("18 / 25")).toBeVisible();
    await expect(canvas.getAllByText("Individual Test")).toHaveLength(1);

    // Scored and failed.
    await expect(loops.getByText("8 / 25")).toBeVisible();
    await expect(loops.getByText("Fail")).toBeVisible();
    await expect(
      loops.getByText("Revise for and while loops before the re-test."),
    ).toBeVisible();

    // No pass mark: no Pass or Fail, half marks kept.
    await expect(quiz.getByText("15.5 / 20")).toBeVisible();
    await expect(quiz.queryByText(/^(Pass|Fail)$/)).toBeNull();
    await expect(quiz.queryByText(/Pass mark/)).toBeNull();

    // Absent and Exempt carry no marks and no Pass or Fail.
    await expect(absent.getByText("Absent")).toBeVisible();
    await expect(absent.queryByText(/^(Pass|Fail)$/)).toBeNull();
    await expect(
      absent.getByText(/^Tally · Tally Morning · Tue, 15 Sept?$/),
    ).toBeVisible();
    await expect(
      absent.getByText(/Missed this one; talk to the Teacher/),
    ).toBeVisible();
    await expect(exempt.getByText("Exempt")).toBeVisible();
    await expect(exempt.queryByText(/^(Pass|Fail)$/)).toBeNull();

    // Own scores over time, per Batch, with a spoken alternative.
    const scores = within(
      canvas.getByRole("region", { name: "Scores over time" }),
    );
    await expect(scores.getByText("Python · Python Evening")).toBeVisible();
    await expect(scores.getByText("4 scored Tests · latest 84%")).toBeVisible();
    await expect(
      scores.getByRole("img", {
        name: /^Python · Python Evening: 4 scored Tests, oldest first: Variables quiz \(Mon, 21 Sept?\) 78%, Loops test \(Mon, 28 Sept?\) 32%, Loops re-test \(Fri, 2 Oct\) 72%, Functions test \(Tue, 6 Oct\) 84%\.$/,
      }),
    ).toBeVisible();
    // Tally has no scored Tests, so no line for it.
    await expect(scores.queryByText("Tally · Tally Morning")).toBeNull();

    await expectNoComparison(canvasElement);
  },
};

export const ParentWithTwoStudents: Story = {
  parameters: { nextjs: { navigation: { pathname: "/parent/results" } } },
  beforeEach() {
    signInAs("parent", { name: "Riverside Centre" });
  },
  render: () => (
    <AppShell>
      <FamilyResults
        results={{ students: [ashaResults, raviResults] }}
        role="parent"
      />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    const asha = within(canvas.getByRole("region", { name: "Asha Kumar" }));
    const ravi = within(canvas.getByRole("region", { name: "Ravi Kumar" }));

    await expect(
      within(
        asha.getByRole("list", { name: "Asha Kumar’s results" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(6);
    await expect(asha.queryByText("GST entries")).toBeNull();
    await expect(
      asha.getByText(/Asha Kumar’s marks as a percentage/),
    ).toBeVisible();

    const raviList = within(
      ravi.getByRole("list", { name: "Ravi Kumar’s results" }),
    );
    await expect(raviList.getAllByRole("listitem")).toHaveLength(1);
    await expect(raviList.getByText("GST entries")).toBeVisible();
    await expect(raviList.getByText("31 / 40")).toBeVisible();
    await expect(ravi.queryByText("Functions test")).toBeNull();
    // One scored Test is not yet a trend.
    await expect(
      ravi.queryByRole("region", { name: "Scores over time" }),
    ).toBeNull();

    await expectNoComparison(canvasElement);
  },
};

export const ParentStudentWithoutResults: Story = {
  parameters: { nextjs: { navigation: { pathname: "/parent/results" } } },
  beforeEach() {
    signInAs("parent", { name: "Riverside Centre" });
  },
  render: () => (
    <AppShell>
      <FamilyResults
        results={{ students: [ashaResults, raviWithoutResults] }}
        role="parent"
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    const ravi = within(canvas.getByRole("region", { name: "Ravi Kumar" }));
    await expect(
      ravi.getByText(
        "No published results yet. Ravi Kumar’s marks show here once the centre publishes a Test.",
      ),
    ).toBeVisible();
    await expect(ravi.queryByRole("list")).toBeNull();
  },
};

export const StudentWithoutResults: Story = {
  render: () => (
    <AppShell>
      <FamilyResults
        results={{
          students: [
            { id: ashaResults.id, name: ashaResults.name, results: [] },
          ],
        }}
        role="student"
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "No published results yet. Your marks show here once the centre publishes a Test.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("region", { name: "Scores over time" }),
    ).toBeNull();
  },
};

export const StudentNotLinked: Story = {
  render: () => (
    <AppShell>
      <FamilyResults results={{ students: [] }} role="student" />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/Your Student record isn’t linked yet/),
    ).toBeVisible();
  },
};

export const ParentNotLinked: Story = {
  parameters: { nextjs: { navigation: { pathname: "/parent/results" } } },
  beforeEach() {
    signInAs("parent", { name: "Riverside Centre" });
  },
  render: () => (
    <AppShell>
      <FamilyResults results={{ students: [] }} role="parent" />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/No Students are linked to you yet/),
    ).toBeVisible();
  },
};

/** The page as routed: reads GET /api/training-institute/home/results. */
export const StudentResultsFromApi: Story = {
  beforeEach: () => mockResultsApi(studentResultsView),
  render: () => (
    <AppShell>
      <FamilyResultsScreen role="student" />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("list", { name: "Your results" }),
    ).toBeVisible();
    await expect(canvas.getByText("Functions test")).toBeVisible();
    await expect(resultsRequests).toBe(1);
    await expectNoComparison(canvasElement);
  },
};
