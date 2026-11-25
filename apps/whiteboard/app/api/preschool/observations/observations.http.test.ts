import { getAuth } from "@repo/auth/server";
import { authStateFor } from "@repo/auth/testing";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  DevelopmentDomainView,
  ObservationPageView,
  ObservationView,
} from "@/src/preschool/application/observation-views";
import type {
  PreschoolDevelopmentDomain,
  PreschoolObservation,
  PreschoolObservationPage,
} from "@/src/queries/preschool/observations";

import {
  addChild,
  addClassroom,
  addStaff,
  FIXTURE_NOW,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  signInWithEmail,
  type PreschoolFixture,
} from "../_lib/testing";
import { POST as updateObservation } from "./[id]/details/route";
import { POST as removeObservation } from "./[id]/remove/route";
import { POST as archiveDomain } from "./domains/[id]/archive/route";
import { POST as renameDomain } from "./domains/[id]/details/route";
import { POST as restoreDomain } from "./domains/[id]/restore/route";
import { GET as listDomains, POST as createDomain } from "./domains/route";
import { ListPreschoolObservationsResponseModel } from "./observation-models";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: [
  Same<DevelopmentDomainView, PreschoolDevelopmentDomain>,
  Same<ObservationView, PreschoolObservation>,
  Same<ObservationPageView, PreschoolObservationPage>,
] = [true, true, true];

type Json = Record<string, unknown> & { code?: string };
type Result<T> = { status: number; body: T };
type Context = { params: Promise<{ id: string }> };
type Handler = (request: Request, context: Context) => Promise<Response>;

async function call<T = Json>(
  handler: Handler,
  input: { id?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<Result<T>> {
  const url = new URL("http://localhost/api/preschool/observations");
  for (const [key, value] of Object.entries(input.query ?? {}))
    url.searchParams.set(key, value);
  const response = await handler(
    new Request(url, {
      method: input.body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    }),
    { params: Promise.resolve({ id: input.id ?? "" }) },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: (text === "" ? {} : JSON.parse(text)) as T,
  };
}

const TODAY = "2026-11-25";

describe("/api/preschool/observations", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let roomA: string;
  let roomB: string;
  let asha: string;
  let bala: string;
  let otherChild: string;
  let domain: string;
  let observationId: string;
  const userIds = new Map<string, string>();

  /** The same User for an email every time, so authorship holds. */
  function as(email: string, role: "teacher" | "parent" = "teacher") {
    const known = userIds.get(email);
    if (known == null) {
      userIds.set(email, signInWithEmail(preschool, role, email));
      return;
    }
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({
        userId: known,
        workspaceId: preschool.workspaceId,
        role,
        email,
        emailVerified: true,
        name: email.split("@")[0] ?? email,
      }),
    );
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXTURE_NOW);
    preschool = await seedPreschool();
    other = await seedPreschool({ name: "Other Preschool" });
    domain = preschool.domainIds[0] ?? "";
    roomA = await addClassroom(preschool, { name: "Nursery A" });
    roomB = await addClassroom(preschool, { name: "Nursery B" });
    ({ childId: asha } = await addChild(preschool, {
      classroomId: roomA,
      firstName: "Asha",
      motherEmail: "asha-mother@example.test",
    }));
    ({ childId: bala } = await addChild(preschool, {
      classroomId: roomB,
      firstName: "Bala",
    }));
    ({ childId: otherChild } = await addChild(other, {
      classroomId: await addClassroom(other),
    }));
    await addStaff(preschool, {
      role: "teacher",
      email: "teacher-a@example.test",
      classroomIds: [roomA],
    });
    await addStaff(preschool, {
      role: "teacher",
      email: "teacher-b@example.test",
      classroomIds: [roomB],
    });
    await addStaff(preschool, {
      role: "centre_head",
      email: "head@example.test",
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await removePreschool(preschool);
    await removePreschool(other);
  });

  it("serves the shapes the client module is typed with", () => {
    expect(contract.every(Boolean)).toBe(true);
  });

  it("lists the six seeded Development Domains to staff", async () => {
    as("teacher-a@example.test");
    const result = await call<{ items: DevelopmentDomainView[] }>(listDomains);
    expect(result.body.items.map((item) => item.name)).toEqual([
      "Physical development",
      "Socio-emotional and ethical development",
      "Cognitive development",
      "Language and literacy development",
      "Aesthetic and cultural development",
      "Positive learning habits",
    ]);
    as("asha-mother@example.test", "parent");
    expect((await call(listDomains)).status).toBe(StatusCodes.FORBIDDEN);
  });

  it("lets only the Owner change the Domains", async () => {
    as("head@example.test");
    expect((await call(createDomain, { body: { name: "Music" } })).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    signInAsOwner(preschool);
    const added = await call<DevelopmentDomainView>(createDomain, {
      body: { name: "  Music  ", description: "Rhythm and songs" },
    });
    expect(added.status).toBe(StatusCodes.CREATED);
    expect(added.body).toMatchObject({ name: "Music", archived: false });
    expect(
      (await call(createDomain, { body: { name: "music" } })).body.code,
    ).toBe("DOMAIN_NAME_IN_USE");
    const renamed = await call<DevelopmentDomainView>(renameDomain, {
      id: added.body.id,
      body: { name: "Music and movement" },
    });
    expect(renamed.body.name).toBe("Music and movement");
    const archived = await call<DevelopmentDomainView>(archiveDomain, {
      id: added.body.id,
    });
    expect(archived.body.archived).toBe(true);
    const active = await call<{ items: DevelopmentDomainView[] }>(listDomains);
    expect(active.body.items).toHaveLength(6);
    const all = await call<{ items: DevelopmentDomainView[] }>(listDomains, {
      query: { includeArchived: "true" },
    });
    expect(all.body.items).toHaveLength(7);
    expect(all.body.items.at(-1)?.id).toBe(added.body.id);

    as("teacher-a@example.test");
    const onArchived = await call(create, {
      body: { childId: asha, domainId: added.body.id, note: "Sang" },
    });
    expect(onArchived.body.code).toBe("DOMAIN_ARCHIVED");

    signInAsOwner(preschool);
    expect(
      (await call<DevelopmentDomainView>(restoreDomain, { id: added.body.id }))
        .body.archived,
    ).toBe(false);
    await call(archiveDomain, { id: added.body.id });
    expect(
      (
        await call(renameDomain, {
          id: other.domainIds[0],
          body: { name: "x" },
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("lets the Child's Teacher record an Observation, today by default", async () => {
    as("teacher-a@example.test");
    const result = await call<ObservationView>(create, {
      body: { childId: asha, domainId: domain, note: " Climbed the frame " },
    });
    expect(result.status).toBe(StatusCodes.CREATED);
    expect(result.body).toMatchObject({
      childName: "Asha",
      domainName: "Physical development",
      observedOn: TODAY,
      note: "Climbed the frame",
      canEdit: true,
    });
    observationId = result.body.id;

    expect(
      (
        await call(create, {
          body: { childId: bala, domainId: domain, note: "x" },
        })
      ).body.code,
    ).toBe("CHILD_FORBIDDEN");
    expect(
      (
        await call(create, {
          body: {
            childId: asha,
            domainId: domain,
            note: "x",
            observedOn: "2026-11-26",
          },
        })
      ).body.code,
    ).toBe("OBSERVATION_DATE_IN_FUTURE");
    expect(
      (
        await call(create, {
          body: { childId: otherChild, domainId: domain, note: "x" },
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await call(create, {
          body: { childId: asha, domainId: other.domainIds[0], note: "x" },
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("lists a Child's or a Classroom's Observations", async () => {
    as("teacher-a@example.test");
    await call(create, {
      body: {
        childId: asha,
        domainId: preschool.domainIds[2],
        note: "Sorted shapes by colour",
        observedOn: "2026-11-20",
      },
    });
    const byChild = await call<ObservationPageView>(list, {
      query: { childId: asha },
    });
    expect(
      ListPreschoolObservationsResponseModel.parse(byChild.body),
    ).toBeTruthy();
    expect(byChild.body.items.map((item) => item.observedOn)).toEqual([
      TODAY,
      "2026-11-20",
    ]);
    const byClassroom = await call<ObservationPageView>(list, {
      query: { classroomId: roomA, domainId: domain },
    });
    expect(byClassroom.body.total).toBe(1);
    const paged = await call<ObservationPageView>(list, {
      query: { classroomId: roomA, limit: "1" },
    });
    const next = await call<ObservationPageView>(list, {
      query: {
        classroomId: roomA,
        limit: "1",
        cursor: paged.body.nextCursor ?? "",
      },
    });
    expect(next.body.items[0]?.observedOn).toBe("2026-11-20");
    expect(
      (await call(list, { query: { classroomId: roomB } })).body.code,
    ).toBe("CLASSROOM_FORBIDDEN");
    expect((await call(list)).body.code).toBe("OBSERVATION_FILTER_REQUIRED");
  });

  it("lets only the author or a manager change or remove an Observation", async () => {
    as("teacher-b@example.test");
    expect(
      (
        await call(updateObservation, {
          id: observationId,
          body: { domainId: domain, observedOn: TODAY, note: "x" },
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    as("teacher-a@example.test");
    const edited = await call<ObservationView>(updateObservation, {
      id: observationId,
      body: {
        domainId: preschool.domainIds[1],
        observedOn: "2026-11-24",
        note: "Helped a friend up",
      },
    });
    expect(edited.body).toMatchObject({
      domainName: "Socio-emotional and ethical development",
      observedOn: "2026-11-24",
    });

    as("head@example.test");
    expect((await call(removeObservation, { id: observationId })).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    const after = await call<ObservationPageView>(list, {
      query: { childId: asha },
    });
    expect(after.body.items.map((item) => item.id)).not.toContain(
      observationId,
    );

    signInAsOwner(other);
    expect(
      (await call(removeObservation, { id: after.body.items[0]?.id ?? "" }))
        .status,
    ).toBe(StatusCodes.NOT_FOUND);
  });
});
