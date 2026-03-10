import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export async function extractTextFromUpload(input: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) {
  const { buffer, mimeType, originalName } = input;
  const lowerName = originalName.toLowerCase();

  if (
    mimeType.startsWith("text/") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".json")
  ) {
    return buffer.toString("utf8");
  }

  if (mimeType.includes("pdf") || lowerName.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return parsed.text || "";
  }

  if (
    mimeType.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ) ||
    lowerName.endsWith(".docx")
  ) {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value || "";
  }

  return "";
}
