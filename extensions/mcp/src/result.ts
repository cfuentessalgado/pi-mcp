export function normalizeMcpResult(result: any) {
  if (result?.structuredContent !== undefined) result = { ...result, content: [{ type: "text", text: JSON.stringify(result.structuredContent, null, 2) }] };
  const parts = result?.content ?? [];
  const content: any[] = [];
  const text: string[] = [];
  for (const p of parts) {
    if (p?.type === "text") text.push(p.text ?? "");
    else if (p?.type === "image") {
      const mime = p.mimeType ?? "image/png";
      const data = String(p.data ?? "");
      content.push({ type: "image", image: data.startsWith("data:") ? data : `data:${mime};base64,${data}` });
    } else if (p?.type === "resource") {
      const r = p.resource ?? p;
      if (r.text) text.push(`\n[Embedded resource: ${r.uri ?? "unknown"}]\n${r.text}`);
      else text.push(`\n[Binary resource: ${r.uri ?? "unknown"}${r.mimeType ? ` (${r.mimeType})` : ""}]`);
    } else text.push(JSON.stringify(p));
  }
  const joined = text.join("\n");
  if (joined) content.unshift({ type: "text", text: joined.length > 1_000_000 ? `${joined.slice(0, 1_000_000)}\n[truncated]` : joined });
  if (!content.length) content.push({ type: "text", text: JSON.stringify(result ?? {}) });
  return { content, details: result };
}

export function summarizeMcpResult(result: any): { textLength: number; textPreview: string; partCount: number; imageCount: number; resourceCount: number; isError: boolean } {
  const parts = Array.isArray(result?.content) ? result.content : [];
  const text = parts.filter((p: any) => p?.type === "text").map((p: any) => String(p.text ?? "")).join("\n");
  return {
    textLength: text.length,
    textPreview: text.trim().split("\n").find(Boolean)?.slice(0, 160) ?? "",
    partCount: parts.length,
    imageCount: parts.filter((p: any) => p?.type === "image").length,
    resourceCount: parts.filter((p: any) => p?.type === "resource" || p?.type === "resource_link").length,
    isError: Boolean(result?.isError),
  };
}
