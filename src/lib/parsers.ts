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

  // 文档类附件不做内容解析：只保存文件本身，标题会自动回退到文件名
  if (
    mimeType.includes("pdf") ||
    lowerName.endsWith(".pdf") ||
    mimeType.includes("application/msword") ||
    lowerName.endsWith(".doc") ||
    mimeType.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ) ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".ppt") ||
    lowerName.endsWith(".pptx") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".xlsx")
  ) {
    return "";
  }

  return "";
}
