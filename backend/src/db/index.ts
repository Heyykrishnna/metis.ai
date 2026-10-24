import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type MetadataDatabase = PostgresJsDatabase<typeof schema>;

export function createMetadataDb(databaseUrl: string): {
  db: MetadataDatabase;
  client: ReturnType<typeof postgres>;
} {
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });
  return { db, client };
}
