CREATE TABLE "file_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fileId" uuid NOT NULL,
	"workspaceId" uuid NOT NULL,
	"ownerSubject" text NOT NULL,
	"question" text NOT NULL,
	"sourceHash" text NOT NULL,
	"modelVersion" text NOT NULL,
	"method" text NOT NULL,
	"result" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"ownerSubject" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"originalSize" integer NOT NULL,
	"compressedSize" integer NOT NULL,
	"compression" text DEFAULT 'br' NOT NULL,
	"contentHash" text NOT NULL,
	"compressedContent" "bytea" NOT NULL,
	"columns" text[] NOT NULL,
	"rowCount" integer NOT NULL,
	"emptyCells" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_assets_id_workspaceId_ownerSubject_unique" UNIQUE("id","workspaceId","ownerSubject"),
	CONSTRAINT "file_assets_workspaceId_ownerSubject_contentHash_name_unique" UNIQUE("workspaceId","ownerSubject","contentHash","name"),
	CONSTRAINT "file_size_bounds" CHECK ("file_assets"."originalSize" BETWEEN 1 AND 5242880 AND "file_assets"."compressedSize" > 0),
	CONSTRAINT "file_brotli_encoding" CHECK ("file_assets"."compression" = 'br' AND octet_length("file_assets"."compressedContent") = "file_assets"."compressedSize"),
	CONSTRAINT "file_hash" CHECK ("file_assets"."contentHash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "file_analyses" ADD CONSTRAINT "file_analyses_fileId_workspaceId_ownerSubject_file_assets_id_workspaceId_ownerSubject_fk" FOREIGN KEY ("fileId","workspaceId","ownerSubject") REFERENCES "public"."file_assets"("id","workspaceId","ownerSubject") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;