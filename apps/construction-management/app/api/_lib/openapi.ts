import { StatusCodes } from "http-status-codes";
import { z } from "zod";

type JsonObject = Record<string, unknown>;

export const ErrorResponseModel = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export function zodToOpenApiSchema(schema: z.ZodType): JsonObject {
  const json = schema.toJSONSchema({
    target: "openapi-3.0",
  }) as JsonObject;
  delete json["$schema"];
  delete json["id"];
  return json;
}

export type OpenApiOperation = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  summary: string;
  tags: string[];
  security?: boolean;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** A raw file body in one of these types instead of JSON. */
  bodyBinaryContentTypes?: string[];
  successStatus: StatusCodes;
  successDescription: string;
  successSchema?: z.ZodType;
  successBinaryContentTypes?: string[];
  errors: StatusCodes[];
};

export type OpenApiDocument = {
  openapi: string;
  servers: { url: string }[];
  info: {
    title: string;
    version: string;
    description: string;
  };
  components: {
    schemas: Record<string, JsonObject>;
    securitySchemes: {
      session: {
        type: string;
        in: string;
        name: string;
      };
    };
  };
  paths: Record<string, Record<string, JsonObject>>;
};

const STATUS_DESCRIPTIONS: Partial<Record<StatusCodes, string>> = {
  [StatusCodes.BAD_REQUEST]: "Validation failed",
  [StatusCodes.UNAUTHORIZED]: "Authentication required",
  [StatusCodes.FORBIDDEN]: "Active Company required, or not allowed",
  [StatusCodes.NOT_FOUND]: "Not found",
  [StatusCodes.CONFLICT]: "Domain state conflict",
  [StatusCodes.PAYMENT_REQUIRED]: "Plan limit reached or plan expired",
  [StatusCodes.TOO_MANY_REQUESTS]: "Too many requests",
  [StatusCodes.REQUEST_TOO_LONG]: "File too large",
  [StatusCodes.INTERNAL_SERVER_ERROR]: "Unexpected error",
};

/**
 * Request and Response models keyed by their code name. Each becomes a
 * component named without the `Model` suffix. Component names are global in
 * `/api/docs`, so they carry the bounded context (ADR-0030).
 */
export type OpenApiComponents = Record<string, z.ZodType>;

type SchemaRef = (schema: z.ZodType) => JsonObject;

function responsesFor(operation: OpenApiOperation, ref: SchemaRef): JsonObject {
  const responses: JsonObject = {};
  if (operation.successBinaryContentTypes != null) {
    responses[String(operation.successStatus)] = {
      description: operation.successDescription,
      content: Object.fromEntries(
        operation.successBinaryContentTypes.map((mimeType) => [
          mimeType,
          {
            schema: { type: "string", format: "binary" },
          },
        ]),
      ),
    };
  } else if (operation.successSchema != null) {
    responses[String(operation.successStatus)] = {
      description: operation.successDescription,
      content: {
        "application/json": {
          schema: ref(operation.successSchema),
        },
      },
    };
  } else {
    responses[String(operation.successStatus)] = {
      description: operation.successDescription,
    };
  }
  for (const status of operation.errors) {
    responses[String(status)] = {
      description: STATUS_DESCRIPTIONS[status] ?? "Error",
      content: {
        "application/json": {
          schema: ref(ErrorResponseModel),
        },
      },
    };
  }
  return responses;
}

function schemaObjectFields(schema: JsonObject): {
  properties: Record<string, JsonObject>;
  required: Set<string>;
} {
  const rawProperties = schema["properties"];
  const properties =
    rawProperties != null &&
    typeof rawProperties === "object" &&
    !Array.isArray(rawProperties)
      ? (rawProperties as Record<string, JsonObject>)
      : {};
  const rawRequired = schema["required"];
  const required = new Set(
    Array.isArray(rawRequired)
      ? rawRequired.filter((name): name is string => typeof name === "string")
      : [],
  );
  return { properties, required };
}

function parametersFor(operation: OpenApiOperation): unknown[] {
  const parameters: unknown[] = [];
  if (operation.params != null) {
    const { properties } = schemaObjectFields(
      zodToOpenApiSchema(operation.params),
    );
    for (const [name, property] of Object.entries(properties)) {
      parameters.push({
        name,
        in: "path",
        required: true,
        schema: property,
      });
    }
  }
  if (operation.query != null) {
    const { properties, required } = schemaObjectFields(
      zodToOpenApiSchema(operation.query),
    );
    for (const [name, property] of Object.entries(properties)) {
      parameters.push({
        name,
        in: "query",
        required: required.has(name),
        schema: property,
      });
    }
  }
  return parameters;
}

export function buildOpenApiDocument(
  operations: readonly OpenApiOperation[],
  components: OpenApiComponents,
): OpenApiDocument {
  const names = new Map<z.ZodType, string>([
    [ErrorResponseModel, "ErrorResponse"],
  ]);
  for (const [name, schema] of Object.entries(components)) {
    names.set(schema, name.replace(/Model$/, ""));
  }
  const schemas: Record<string, JsonObject> = {};
  for (const [schema, name] of names) {
    schemas[name] = zodToOpenApiSchema(schema);
  }

  const paths: OpenApiDocument["paths"] = {};
  for (const operation of operations) {
    const ref: SchemaRef = (schema) => {
      const name = names.get(schema);
      if (name == null) {
        throw new Error(
          `${operation.method.toUpperCase()} ${operation.path} uses a body or response model that is not an OpenAPI component.`,
        );
      }
      return { $ref: `#/components/schemas/${name}` };
    };
    const pathItem = paths[operation.path] ?? {};
    const item: JsonObject = {
      summary: operation.summary,
      tags: operation.tags,
      security: operation.security === false ? [] : [{ session: [] }],
      responses: responsesFor(operation, ref),
    };
    const parameters = parametersFor(operation);
    if (parameters.length > 0) {
      item["parameters"] = parameters;
    }
    if (operation.bodyBinaryContentTypes != null) {
      item["requestBody"] = {
        required: true,
        content: Object.fromEntries(
          operation.bodyBinaryContentTypes.map((mimeType) => [
            mimeType,
            { schema: { type: "string", format: "binary" } },
          ]),
        ),
      };
    } else if (operation.body != null) {
      item["requestBody"] = {
        required: true,
        content: {
          "application/json": {
            schema: ref(operation.body),
          },
        },
      };
    }
    pathItem[operation.method] = item;
    paths[operation.path] = pathItem;
  }

  return {
    openapi: "3.0.3",
    servers: [{ url: "/" }],
    info: {
      title: "Construction Management API",
      version: "0.0.0",
      description:
        "Construction Management HTTP APIs. Each bounded context has its own path prefix (`/api/construction/<context>`) and `Construction<Context>` component names (ADR CM-0001).",
    },
    components: {
      schemas,
      securitySchemes: {
        session: {
          type: "apiKey",
          in: "cookie",
          // "__Secure-construction.session_token" over HTTPS (ADR CM-0002).
          name: "construction.session_token",
        },
      },
    },
    paths,
  };
}
