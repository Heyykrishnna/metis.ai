import type { components } from "../generated/api";
import type { LocalDocument } from "./local-files";

type FilePreview = components["schemas"]["FilePreview"];
export type FileAnalysis = components["schemas"]["FileAnalysis"];
export type StoredFile = components["schemas"]["StoredFile"];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    signal: AbortSignal.timeout(90000),
    cache: "no-store",
  });
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    throw new Error(
      typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
        ? error.message
        : "The file service is unavailable. Please retry.",
    );
  }
  return response.json();
}

export function toDocument(preview: FilePreview): LocalDocument {
  return {
    id: preview.file.id,
    name: preview.file.name,
    size: preview.file.size,
    kind: preview.file.kind,
    columns: preview.file.columns,
    rows: preview.rows,
    text: preview.text,
    rowCount: preview.file.rowCount,
    emptyCells: preview.file.emptyCells,
    addedAt: new Date(preview.file.createdAt).getTime(),
    compressedSize: preview.file.compressedSize,
    sha256: preview.file.sha256,
  };
}

export async function uploadFile(file: File): Promise<LocalDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  const preview = await request<FilePreview>("/v1/files", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      contentBase64: btoa(chunks.join("")),
    }),
  });
  return toDocument(preview);
}

export async function loadFiles(): Promise<LocalDocument[]> {
  const files = await request<StoredFile[]>("/v1/files");
  const previews = await Promise.all(
    files.map((file) => request<FilePreview>(`/v1/files/${file.id}`)),
  );
  return previews.map(toDocument);
}

export async function deleteFile(id: string) {
  return request<{ deleted: boolean }>(`/v1/files/${id}`, { method: "DELETE" });
}
export async function analyzeFile(fileId: string, question: string) {
  return request<FileAnalysis>(`/v1/files/${fileId}/analyses`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}
export async function fileHistory() {
  return request<FileAnalysis[]>("/v1/file-analyses");
}
export function originalFileUrl(id: string) {
  return `/api/backend/v1/files/${id}/content`;
}
