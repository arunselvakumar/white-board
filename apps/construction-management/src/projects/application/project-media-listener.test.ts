import { describe, expect, it } from "vitest";

import type {
  ProjectMediaAttached,
  ProjectMediaRemoved,
} from "@/src/shared-kernel/project-media";

import type { NewMediaItem } from "../domain/media-item";
import {
  ProjectMediaListener,
  type ProjectMediaStore,
} from "./project-media-listener";

const PROJECT = "0199c3a0-0000-7000-8000-000000000001";
const SOURCE_ID = "0199c3a0-0000-7000-8000-0000000000aa";
const AT = new Date("2026-10-10T06:30:00Z");

function memoryStore() {
  const attached: NewMediaItem[] = [];
  const removed: Parameters<ProjectMediaStore["remove"]>[0][] = [];
  const store: ProjectMediaStore = {
    attach: (item) => {
      attached.push(item);
      return Promise.resolve();
    },
    remove: (input) => {
      removed.push(input);
      return Promise.resolve();
    },
  };
  return { store, attached, removed };
}

const ATTACHED: ProjectMediaAttached = {
  type: "ProjectMediaAttached",
  workspaceId: "w1",
  occurredAt: AT,
  projectId: PROJECT,
  source: "worksheet",
  sourceId: SOURCE_ID,
  fileKey: `companies/w1/worksheet-photos/${PROJECT}/a.jpg`,
  thumbKey: `companies/w1/worksheet-photos/${PROJECT}/a.jpg.thumb.webp`,
  fileName: "Slab casting.jpg",
  contentType: "image/jpeg",
  bytes: 120_000,
  uploadedBy: "u1",
  uploadedAt: AT,
};

describe("ProjectMediaListener (CM-407)", () => {
  it("indexes a file another context attached to a Project", async () => {
    const { store, attached } = memoryStore();
    await new ProjectMediaListener(store).handle(ATTACHED);
    expect(attached).toEqual([
      {
        workspaceId: "w1",
        projectId: PROJECT,
        source: "worksheet",
        sourceId: SOURCE_ID,
        fileKey: ATTACHED.fileKey,
        thumbKey: ATTACHED.thumbKey,
        fileName: "Slab casting.jpg",
        contentType: "image/jpeg",
        bytes: 120_000,
        uploadedBy: "u1",
        uploadedAt: AT,
      },
    ]);
  });

  it("takes a record's files, or one file, out of the Gallery", async () => {
    const { store, removed } = memoryStore();
    const listener = new ProjectMediaListener(store);
    const all: ProjectMediaRemoved = {
      type: "ProjectMediaRemoved",
      workspaceId: "w1",
      occurredAt: AT,
      projectId: PROJECT,
      source: "worksheet",
      sourceId: SOURCE_ID,
    };
    await listener.handle(all);
    const one: ProjectMediaRemoved = { ...all, fileKey: ATTACHED.fileKey };
    await listener.handle(one);
    expect(removed).toEqual([
      { workspaceId: "w1", source: "worksheet", sourceId: SOURCE_ID, now: AT },
      {
        workspaceId: "w1",
        source: "worksheet",
        sourceId: SOURCE_ID,
        fileKey: ATTACHED.fileKey,
        now: AT,
      },
    ]);
  });

  it("ignores every other event", async () => {
    const { store, attached, removed } = memoryStore();
    await new ProjectMediaListener(store).handle({
      type: "CompanyCreated",
      workspaceId: "w1",
      occurredAt: AT,
    });
    expect(attached).toEqual([]);
    expect(removed).toEqual([]);
  });
});
