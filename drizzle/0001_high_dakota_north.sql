CREATE TABLE "room_channels" (
	"room_id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text DEFAULT 'Mesa Principal' NOT NULL,
	"category" text DEFAULT 'Transmissões' NOT NULL,
	"description" text DEFAULT 'Canal principal da comunidade' NOT NULL,
	"avatar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_channels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
INSERT INTO "room_channels" ("room_id", "slug", "name", "category", "description")
VALUES ('main', 'main', 'Mesa Principal', 'Transmissões', 'Canal principal da comunidade')
ON CONFLICT ("room_id") DO NOTHING;
