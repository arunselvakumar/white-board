import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import type { Quotation } from "@/src/queries/quotations";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { mockXhrUploads } from "../../.storybook/mocks/xhr";
import { BALAJI, BALAJI_QUOTATIONS } from "./party-fixtures";
import { PartyQuotations } from "./party-quotations";

const QUOTATIONS = `/api/construction/masters/contractors/${BALAJI.id}/quotations`;

let api: ReturnType<typeof mockQuotationsApi>;
let xhr: ReturnType<typeof mockXhrUploads> | null = null;

/** A party's quotations API: list, start, complete, delete. */
function mockQuotationsApi(
  options: {
    quotations?: Quotation[];
    startError?: { status: number; code: string; message: string };
  } = {},
) {
  let items = [...(options.quotations ?? BALAJI_QUOTATIONS)];
  const started = new Map<string, number>();
  let next = 50;
  return mockApi((call) => {
    if (call.method === "GET" && call.path === QUOTATIONS)
      return Response.json({ items });
    if (call.method === "POST" && call.path === `${QUOTATIONS}/uploads`) {
      if (options.startError != null)
        return Response.json(
          {
            code: options.startError.code,
            message: options.startError.message,
          },
          { status: options.startError.status },
        );
      const body = call.body as { fileName: string; bytes: number };
      next += 1;
      const key = `companies/w1/quotations/${BALAJI.id}/${String(next)}.pdf`;
      started.set(key, body.bytes);
      return Response.json(
        {
          key,
          fileName: body.fileName,
          upload: {
            via: "app",
            url: `${QUOTATIONS}/uploads/app?key=${encodeURIComponent(key)}`,
          },
        },
        { status: 201 },
      );
    }
    if (call.method === "POST" && call.path === QUOTATIONS) {
      const body = call.body as { key: string; fileName: string };
      next += 1;
      const id = `0199a1b2-0000-7000-8000-0000000002${String(next)}`;
      const added: Quotation = {
        id,
        partyKind: "contractor",
        partyId: BALAJI.id,
        partyName: BALAJI.name,
        fileName: body.fileName,
        contentType: "application/pdf",
        bytes: started.get(body.key) ?? 0,
        viewable: true,
        url: `${QUOTATIONS}/${id}`,
        thumbUrl: null,
        createdAt: "2026-10-09T06:30:00.000Z",
        createdBy: "user-karthik",
        createdByName: "Karthik R",
      };
      items = [added, ...items];
      return Response.json(added, { status: 201 });
    }
    const deleted = /\/quotations\/([^/]+)\/delete$/.exec(call.path);
    if (call.method === "POST" && deleted != null) {
      items = items.filter((item) => item.id !== deleted[1]);
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
}

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function quotationsApi(options: Parameters<typeof mockQuotationsApi>[0] = {}) {
  return () => {
    api = mockQuotationsApi(options);
    xhr = mockXhrUploads({ holdAt: 64 });
    return () => {
      xhr?.restore();
      api.restore();
    };
  };
}

function file(name: string, size: number, type = "") {
  const made = new File(["x"], name, { type });
  Object.defineProperty(made, "size", { value: size });
  return made;
}

const meta = {
  title: "Masters/Parties/Quotations",
  component: PartyQuotations,
  args: { list: "contractors", partyId: BALAJI.id },
  beforeEach: quotationsApi(),
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <div className="w-full max-w-4xl">
          <PartyQuotations {...args} />
        </div>
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof PartyQuotations>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The party's files, newest first, each with open, download and remove. */
export const List: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Quotations" }),
    ).toBeVisible();
    const list = within(
      await canvas.findByRole("list", { name: "Quotations" }),
    );
    const rows = list.getAllByRole("listitem");
    await expect(rows).toHaveLength(2);
    await expect(rows[0]).toHaveTextContent("RCC labour rates Oct 2026.pdf");
    await expect(
      list.getByText("1.2 MB · Karthik R · 8 Oct 2026"),
    ).toBeVisible();
    // No uploader name: size and date only.
    await expect(list.getByText("420 KB · 15 Sept 2026")).toBeVisible();
    const first = BALAJI_QUOTATIONS[0];
    await expect(
      list.getByRole("link", { name: "Open RCC labour rates Oct 2026.pdf" }),
    ).toHaveAttribute("href", first?.url);
    await expect(
      list.getByRole("link", { name: "Open RCC labour rates Oct 2026.pdf" }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      list.getByRole("link", {
        name: "Download RCC labour rates Oct 2026.pdf",
      }),
    ).toHaveAttribute("href", `${first?.url ?? ""}?download=1`);
    await expect(canvas.getByLabelText("Quotation file")).toHaveAttribute(
      "accept",
      ".pdf,.png,.jpg,.jpeg,.webp",
    );
  },
};

export const Empty: Story = {
  beforeEach: quotationsApi({ quotations: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No quotations yet")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Upload quotation" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("list", { name: "Quotations" })).toBeNull();
  },
};

/** A PDF goes up through the app (the development path) and joins the list. */
export const Upload: Story = {
  beforeEach: quotationsApi({ quotations: [] }),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText("No quotations yet");
    await userEvent.upload(
      canvas.getByLabelText("Quotation file"),
      file("Shuttering rates.pdf", 2 * 1024 * 1024, "application/pdf"),
    );
    await expect(await canvas.findByText("64%")).toBeVisible();
    await expect(
      canvas.getByRole("progressbar", {
        name: "Uploading Shuttering rates.pdf",
      }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Upload quotation" }),
    ).toBeDisabled();
    await expect(calls("POST", `${QUOTATIONS}/uploads`)[0]?.body).toEqual({
      fileName: "Shuttering rates.pdf",
      bytes: 2 * 1024 * 1024,
    });

    xhr?.release();
    const list = within(
      await canvas.findByRole("list", { name: "Quotations" }),
    );
    await expect(list.getByText("Shuttering rates.pdf")).toBeVisible();
    await expect(list.getByText("2 MB · Karthik R · 9 Oct 2026")).toBeVisible();
    await expect(xhr?.sent[0]?.contentType).toBe("application/pdf");
    await expect(calls("POST", QUOTATIONS)[0]?.body).toEqual({
      key: `companies/w1/quotations/${BALAJI.id}/51.pdf`,
      fileName: "Shuttering rates.pdf",
    });
    await expect(canvas.queryByText("64%")).toBeNull();
  },
};

/** A wrong type or a file over 10 MB is refused in the browser. */
export const Refused: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Quotations" });
    const input = canvas.getByLabelText("Quotation file");
    // The picker filters by type; a drop or another browser may not.
    const picked = new DataTransfer();
    picked.items.add(file("Rates.docx", 20 * 1024));
    await fireEvent.change(input, { target: { files: picked.files } });
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent("Rates.docx");
    await expect(alert).toHaveTextContent(
      "Choose a PDF, PNG, JPEG or WebP file.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss Rates.docx" }),
    );
    await expect(canvas.queryByRole("alert")).toBeNull();

    await userEvent.upload(
      input,
      file("Scanned rates.pdf", 11 * 1024 * 1024, "application/pdf"),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The file must be at most 10 MB.",
    );
    await expect(calls("POST", `${QUOTATIONS}/uploads`)).toHaveLength(0);
  },
};

/** The server's refusal (here, the 50-file limit) shows with its words. */
export const LimitReached: Story = {
  beforeEach: quotationsApi({
    startError: {
      status: 409,
      code: "QUOTATIONS_LIMIT",
      message: "Keep at most 50 quotations on a Contractor. Remove one first.",
    },
  }),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Quotations" });
    await userEvent.upload(
      canvas.getByLabelText("Quotation file"),
      file("Another quote.pdf", 1024 * 1024, "application/pdf"),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Keep at most 50 quotations on a Contractor. Remove one first.",
    );
    await expect(
      canvas.getByRole("button", { name: "Upload quotation" }),
    ).toBeEnabled();
  },
};

/** Remove asks first, then the file is gone. */
export const Remove: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const target = BALAJI_QUOTATIONS[1];
    const deletePath = `${QUOTATIONS}/${target?.id ?? ""}/delete`;
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Remove Plastering quote photo.jpg",
      }),
    );
    let dialog = within(
      await body.findByRole("alertdialog", {
        name: "Remove Plastering quote photo.jpg?",
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Keep it" }));
    await waitFor(async () => {
      await expect(body.queryByRole("alertdialog")).toBeNull();
    });
    await expect(calls("POST", deletePath)).toHaveLength(0);

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Plastering quote photo.jpg" }),
    );
    dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Remove" }));
    await waitFor(async () => {
      await expect(canvas.queryByText("Plastering quote photo.jpg")).toBeNull();
    });
    await expect(calls("POST", deletePath)).toHaveLength(1);
    await expect(
      within(canvas.getByRole("list", { name: "Quotations" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);
  },
};

/** Phones: the row's actions stay as icons and nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Quotations" });
    await expect(
      canvas.getByRole("button", { name: "Remove Plastering quote photo.jpg" }),
    ).toBeVisible();
    const html = canvasElement.ownerDocument.documentElement;
    await expect(html.scrollWidth).toBeLessThanOrEqual(html.clientWidth);
  },
};
