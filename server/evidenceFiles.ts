import { EVIDENCE_MIME_TYPES, type EvidenceMimeType } from "./storage";

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

const expectedExtensions: Record<EvidenceMimeType, string[]> = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

function hasPrefix(content: Buffer, prefix: number[]): boolean {
  return prefix.every((byte, index) => content[index] === byte);
}

function validateUtf8Text(content: Buffer, label: string): void {
  if (content.includes(0))
    throw new Error(`${label} files cannot contain null bytes.`);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new Error(`${label} files must be valid UTF-8 text.`);
  }
}

export function decodeAndValidateEvidenceAttachment(input: {
  fileName: string;
  mimeType: EvidenceMimeType;
  contentBase64: string;
}): Buffer {
  if (!EVIDENCE_MIME_TYPES.includes(input.mimeType)) {
    throw new Error("This evidence file type is not allowed.");
  }

  const fileName = input.fileName.trim();
  if (!fileName || /[\\/\0]/.test(fileName)) {
    throw new Error("Evidence file names cannot contain path characters.");
  }
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (!expectedExtensions[input.mimeType].includes(extension)) {
    throw new Error(
      "The evidence file extension does not match its declared file type."
    );
  }

  const normalizedBase64 = input.contentBase64.replace(/\s/g, "");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      normalizedBase64
    )
  ) {
    throw new Error("The uploaded evidence content is not valid base64 data.");
  }

  const content = Buffer.from(normalizedBase64, "base64");
  if (!content.length || content.length > MAX_EVIDENCE_BYTES) {
    throw new Error("Evidence attachments must be between 1 byte and 5 MB.");
  }

  switch (input.mimeType) {
    case "application/pdf":
      if (!hasPrefix(content, [0x25, 0x50, 0x44, 0x46, 0x2d]))
        throw new Error("PDF evidence must have a valid PDF header.");
      break;
    case "image/png":
      if (!hasPrefix(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        throw new Error("PNG evidence must have a valid PNG header.");
      break;
    case "image/jpeg":
      if (
        !hasPrefix(content, [0xff, 0xd8]) ||
        content[content.length - 2] !== 0xff ||
        content[content.length - 1] !== 0xd9
      ) {
        throw new Error("JPEG evidence must have valid JPEG markers.");
      }
      break;
    case "text/plain":
      validateUtf8Text(content, "Text");
      break;
    case "text/csv":
      validateUtf8Text(content, "CSV");
      break;
  }

  return content;
}
