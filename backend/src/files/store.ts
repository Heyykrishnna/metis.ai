import { FileInputError } from "./errors.js";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { MetadataDatabase } from "../db/index.js";
import { fileAnalyses, fileAssets } from "../db/schema.js";
import type { AuthContext } from "../security/auth.js";
import type { InferenceClient } from "../inference/client.js";
import type {
  FileAnalysis,
  FilePreview,
  StoredFile,
} from "../contracts/files.js";
import { compressFile, restoreFile } from "./compression.js";
import { parseFile } from "./parser.js";
import { answerFile } from "./analysis.js";

type FileRow = Omit<typeof fileAssets.$inferSelect, "compressedContent">;
const summaryColumns = {
  id: fileAssets.id,
  workspaceId: fileAssets.workspaceId,
  ownerSubject: fileAssets.ownerSubject,
  name: fileAssets.name,
  kind: fileAssets.kind,
  originalSize: fileAssets.originalSize,
  compressedSize: fileAssets.compressedSize,
  compression: fileAssets.compression,
  contentHash: fileAssets.contentHash,
  columns: fileAssets.columns,
  rowCount: fileAssets.rowCount,
  emptyCells: fileAssets.emptyCells,
  createdAt: fileAssets.createdAt,
};
function metadata(row: FileRow): StoredFile {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    size: row.originalSize,
    compressedSize: row.compressedSize,
    compression: "br",
    sha256: row.contentHash,
    columns: row.columns,
    rowCount: row.rowCount,
    emptyCells: row.emptyCells,
    createdAt: row.createdAt.toISOString(),
  };
}

export class FileStore {
  constructor(
    private readonly db: MetadataDatabase,
    private readonly inference: InferenceClient,
  ) {}
  private scope(actor: AuthContext) {
    return and(
      eq(fileAssets.workspaceId, actor.workspaceId),
      eq(fileAssets.ownerSubject, actor.subject),
    );
  }
  async list(actor: AuthContext): Promise<StoredFile[]> {
    return (
      await this.db
        .select(summaryColumns)
        .from(fileAssets)
        .where(this.scope(actor))
        .orderBy(desc(fileAssets.createdAt))
        .limit(10)
    ).map(metadata);
  }
  private async find(actor: AuthContext, id: string) {
    return (
      await this.db
        .select()
        .from(fileAssets)
        .where(and(this.scope(actor), eq(fileAssets.id, id)))
        .limit(1)
    )[0];
  }
  async upload(
    actor: AuthContext,
    name: string,
    encoded: string,
  ): Promise<FilePreview> {
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
      throw new FileInputError("Invalid file encoding.");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64") !== encoded)
      throw new FileInputError("Invalid file encoding.");
    const packed = await compressFile(bytes);
    const parsed = parseFile(name, bytes);
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${actor.workspaceId}), hashtext(${actor.subject}))`,
      );
      const current = await tx
        .select(summaryColumns)
        .from(fileAssets)
        .where(this.scope(actor))
        .limit(11);
      const duplicate = current.find(
        (item) => item.contentHash === packed.sha256 && item.name === name,
      );
      if (duplicate) return duplicate;
      if (current.length >= 10)
        throw new FileInputError(
          "This workspace user can store 10 files. Remove a file before adding another.",
        );
      const inserted = await tx
        .insert(fileAssets)
        .values({
          id: randomUUID(),
          workspaceId: actor.workspaceId,
          ownerSubject: actor.subject,
          name,
          kind: parsed.kind,
          originalSize: packed.originalSize,
          compressedSize: packed.compressedSize,
          compressedContent: packed.compressed,
          contentHash: packed.sha256,
          columns: parsed.columns,
          rowCount: parsed.rows.length,
          emptyCells: parsed.emptyCells,
        })
        .returning();
      if (!inserted[0]) throw new Error("The file could not be saved.");
      return inserted[0];
    });
    return {
      file: metadata(row),
      rows: parsed.rows.slice(0, 100),
      text: parsed.columns.length ? "" : parsed.text.slice(0, 20000),
    };
  }
  async preview(actor: AuthContext, id: string): Promise<FilePreview | null> {
    const row = await this.find(actor, id);
    if (!row) return null;
    const parsed = parseFile(
      row.name,
      await restoreFile(
        row.compressedContent,
        row.originalSize,
        row.contentHash,
      ),
    );
    return {
      file: metadata(row),
      rows: parsed.rows.slice(0, 100),
      text: parsed.columns.length ? "" : parsed.text.slice(0, 20000),
    };
  }
  async original(actor: AuthContext, id: string) {
    const row = await this.find(actor, id);
    if (!row) return null;
    return {
      name: row.name,
      bytes: await restoreFile(
        row.compressedContent,
        row.originalSize,
        row.contentHash,
      ),
    };
  }
  async remove(actor: AuthContext, id: string) {
    return (
      (
        await this.db
          .delete(fileAssets)
          .where(and(this.scope(actor), eq(fileAssets.id, id)))
          .returning({ id: fileAssets.id })
      ).length > 0
    );
  }
  async history(actor: AuthContext): Promise<FileAnalysis[]> {
    return (
      await this.db
        .select()
        .from(fileAnalyses)
        .where(
          and(
            eq(fileAnalyses.workspaceId, actor.workspaceId),
            eq(fileAnalyses.ownerSubject, actor.subject),
          ),
        )
        .orderBy(desc(fileAnalyses.createdAt))
        .limit(50)
    ).map((row) => {
      if (
        row.method !== "deterministic" &&
        row.method !== "model-planned-computation" &&
        row.method !== "extractive"
      )
        throw new Error("Unrecognized file analysis method.");
      const result =
        row.result.answer.status === "answered"
          ? {
              ...row.result,
              answer: {
                ...row.result.answer,
                answerText: row.result.answer.answerText.slice(0, 4096),
                definition: row.result.answer.definition.slice(0, 4096),
              },
            }
          : {
              ...row.result,
              answer: {
                ...row.result.answer,
                reason: row.result.answer.reason.slice(0, 4096),
                nextAction: row.result.answer.nextAction.slice(0, 4096),
              },
            };
      return {
        id: row.id,
        fileId: row.fileId,
        question: row.question,
        sourceHash: row.sourceHash,
        modelVersion: row.modelVersion,
        method: row.method,
        result,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
  async analyze(
    actor: AuthContext,
    id: string,
    question: string,
  ): Promise<FileAnalysis | null> {
    const row = await this.find(actor, id);
    if (!row) return null;
    const bytes = await restoreFile(
      row.compressedContent,
      row.originalSize,
      row.contentHash,
    );
    const analysis = await answerFile(
      metadata(row),
      parseFile(row.name, bytes),
      question,
      randomUUID(),
      this.inference,
    );
    await this.db.insert(fileAnalyses).values({
      id: analysis.id,
      workspaceId: actor.workspaceId,
      ownerSubject: actor.subject,
      fileId: id,
      question,
      sourceHash: analysis.sourceHash,
      modelVersion: analysis.modelVersion,
      method: analysis.method,
      result: analysis.result,
    });
    return analysis;
  }
}
