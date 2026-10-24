import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { logger } from "../logger.js";
import { metadataPoolConfig } from "./config.js";
import * as schema from "./schema.js";

export type MetadataDatabase = NodePgDatabase<typeof schema>;

export function createMetadataDb(databaseUrl: string): {
  db: MetadataDatabase;
  pool: Pool;
} {
  const pool = new Pool(metadataPoolConfig(databaseUrl));
  pool.on("error", (error) =>
    logger.error({ err: error }, "Metadata connection failed"),
  );
  return { db: drizzle(pool, { schema }), pool };
}
