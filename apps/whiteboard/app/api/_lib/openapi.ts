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
  successStatus: number;
  successDescription: string;
  successSchema?: z.ZodType;
  errors: number[];
};

export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  components: {
    securitySchemes: {
      clerkSession: {
        type: string;
        in: string;
        name: string;
      };
    };
  };
  paths: Record<string, Record<string, JsonObject>>;
};

const STATUS_DESCRIPTIONS: Record<number, string> = {
  400: "Validation failed",
  401: "Authentication required",
  403: "Active workspace required",
  404: "Not found",
  409: "Domain state conflict",
  500: "Unexpected error",
};

function responsesFor(operation: OpenApiOperation): JsonObject {
  const responses: JsonObject = {};
  if (operation.successSchema != null) {
    responses[String(operation.successStatus)] = {
      description: operation.successDescription,
      content: {
        "application/json": {
          schema: zodToOpenApiSchema(operation.successSchema),
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
          schema: zodToOpenApiSchema(ErrorResponseModel),
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
): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};
  for (const operation of operations) {
    const pathItem = paths[operation.path] ?? {};
    const item: JsonObject = {
      summary: operation.summary,
      tags: operation.tags,
      security: operation.security === false ? [] : [{ clerkSession: [] }],
      responses: responsesFor(operation),
    };
    const parameters = parametersFor(operation);
    if (parameters.length > 0) {
      item["parameters"] = parameters;
    }
    if (operation.body != null) {
      item["requestBody"] = {
        required: true,
        content: {
          "application/json": {
            schema: zodToOpenApiSchema(operation.body),
          },
        },
      };
    }
    pathItem[operation.method] = item;
    paths[operation.path] = pathItem;
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Whiteboard API",
      version: "0.0.0",
      description:
        "Sample HTTP APIs for reviewing backend architecture. Todo is not a product concept.",
    },
    components: {
      securitySchemes: {
        clerkSession: {
          type: "apiKey",
          in: "cookie",
          name: "__session",
        },
      },
    },
    paths,
  };
}
