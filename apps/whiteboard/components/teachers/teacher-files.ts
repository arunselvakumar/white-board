import type {
  TeacherDocumentInput,
  TeacherWriteInput,
} from "@/src/queries/teachers";

function base64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("Could not read the selected file."));
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.includes(","))
        reject(new Error("Could not read the selected file."));
      else resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function resizePhoto(
  file: File,
  maxSide: number,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "Could not read this photo. Choose a JPEG, PNG, or WebP image.",
        ),
      );
    };
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (context == null) {
        reject(new Error("Could not prepare this photo."));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob == null) reject(new Error("Could not prepare this photo."));
          else resolve(blob);
        },
        "image/jpeg",
        quality,
      );
    };
    image.src = url;
  });
}

export async function encodeTeacherPhoto(
  file: File,
): Promise<NonNullable<TeacherWriteInput["photo"]>> {
  if (file.size === 0 || file.size > 10 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 10 MB.");
  let blob: Blob = file;
  let mimeType = file.type;
  if (
    file.size > 2 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    blob = await resizePhoto(file, 1200, 0.82);
    mimeType = "image/jpeg";
  }
  if (blob.size > 2 * 1024 * 1024) {
    blob = await resizePhoto(file, 800, 0.72);
    mimeType = "image/jpeg";
  }
  if (blob.size > 2 * 1024 * 1024)
    throw new Error("The photo is still too large. Choose a smaller image.");
  return {
    mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
    dataBase64: await base64(blob),
  };
}

export async function encodeTeacherDocument(
  kind: TeacherDocumentInput["kind"],
  file: File,
): Promise<TeacherDocumentInput> {
  if (
    !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
    file.size === 0 ||
    file.size > 3 * 1024 * 1024
  ) {
    throw new Error("Choose a PDF, JPEG, or PNG document smaller than 3 MB.");
  }
  return {
    kind,
    name: file.name,
    mimeType: file.type as TeacherDocumentInput["mimeType"],
    dataBase64: await base64(file),
  };
}
