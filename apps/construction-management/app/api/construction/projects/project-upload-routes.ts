import { StatusCodes } from "http-status-codes";
import type { z } from "zod";

import {
  UploadKeyQueryModel,
  startUploadResponse,
} from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAnyAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import type { ProjectViewer } from "@/src/projects/application/project-handlers";
import type { Flag, MenuKey } from "@/src/shared-kernel/access";
import {
  THUMBNAIL_MAX_BYTES,
  type StartedUpload,
} from "@/src/shared-kernel/attachments";

import { ConstructionProjectsProjectParamsModel } from "./projects/project-models";

type Context = { params: Promise<{ id: string }> };

/** An owner of a Project's files, as its upload routes call it. */
export type ProjectUploadOwner = {
  start(input: {
    viewer: ProjectViewer;
    projectId: string;
    fileName: string;
    bytes: number;
  }): Promise<StartedUpload>;
  answerDirectUpload(input: {
    viewer: ProjectViewer;
    projectId: string;
    request: Request;
    body: unknown;
  }): Promise<unknown>;
  receive(input: {
    viewer: ProjectViewer;
    projectId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void>;
  receiveThumbnail(input: {
    viewer: ProjectViewer;
    projectId: string;
    key: string;
    bytes: Uint8Array;
  }): Promise<void>;
};

/**
 * The four upload routes every Project file owner has under
 * `<base>/uploads` (CM-407): start, presign (deployed), app (files on
 * disk) and thumbnail. Each checks the Session and `flags` on `menu`
 * (any of them), then the owner applies Project visibility and its policy.
 */
export function projectUploadRoutes(options: {
  menu: MenuKey;
  flags: readonly [Flag, ...Flag[]];
  owner: ProjectUploadOwner;
  /** `/api/construction/projects/projects/<id>/<segment>`. */
  basePath: (projectId: string) => string;
  /** The start body: at least the file's name and size. */
  startModel: z.ZodType<{ fileName: string; bytes: number }>;
  /** The largest file the policy takes, for the `app` route's body. */
  maxBytes: number;
}) {
  const access = (request: Request) =>
    requireAnyAccess(request, options.menu, options.flags);
  const projectIdOf = async (context: Context) =>
    parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    ).id;
  const keyOf = (request: Request) =>
    parseOrThrow(
      UploadKeyQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    ).key;

  return {
    /** Step 1: checks the name, size and plan, and says where the bytes go. */
    start: async (request: Request, context: Context): Promise<Response> => {
      try {
        const session = await access(request);
        if (isResponse(session)) return session;
        const projectId = await projectIdOf(context);
        const body = parseOrThrow(
          options.startModel.safeParse(await request.json()),
        );
        const started = await options.owner.start({
          viewer: session.access,
          projectId,
          fileName: body.fileName,
          bytes: body.bytes,
        });
        return Response.json(
          startUploadResponse(
            started,
            `${options.basePath(projectId)}/uploads`,
          ),
          { status: StatusCodes.CREATED },
        );
      } catch (error) {
        return mapError(error);
      }
    },

    /** Step 2, deployed: `uploadPresigned()`'s `handleUploadUrl`. */
    presign: async (request: Request, context: Context): Promise<Response> => {
      try {
        const session = await access(request);
        if (isResponse(session)) return session;
        const projectId = await projectIdOf(context);
        const body: unknown = await request.json();
        return Response.json(
          await options.owner.answerDirectUpload({
            viewer: session.access,
            projectId,
            request,
            body,
          }),
        );
      } catch (error) {
        return mapError(error);
      }
    },

    /** Step 2 in development and tests: the raw file, kept at `?key=`. */
    receive: async (request: Request, context: Context): Promise<Response> => {
      try {
        const session = await access(request);
        if (isResponse(session)) return session;
        const projectId = await projectIdOf(context);
        const key = keyOf(request);
        const upload = await readUpload(request, options.maxBytes);
        await options.owner.receive({
          viewer: session.access,
          projectId,
          key,
          bytes: upload.bytes,
        });
        return new Response(null, { status: StatusCodes.NO_CONTENT });
      } catch (error) {
        return mapError(error);
      }
    },

    /** An image's WebP thumbnail, between sending the file and finishing. */
    thumbnail: async (
      request: Request,
      context: Context,
    ): Promise<Response> => {
      try {
        const session = await access(request);
        if (isResponse(session)) return session;
        const projectId = await projectIdOf(context);
        const key = keyOf(request);
        const upload = await readUpload(request, THUMBNAIL_MAX_BYTES);
        await options.owner.receiveThumbnail({
          viewer: session.access,
          projectId,
          key,
          bytes: upload.bytes,
        });
        return new Response(null, { status: StatusCodes.NO_CONTENT });
      } catch (error) {
        return mapError(error);
      }
    },
  };
}
