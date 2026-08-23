CREATE TABLE "room_peers" (
	"peer_id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"role" text NOT NULL,
	"display_name" text DEFAULT 'Espectador' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_sessions" (
	"room_id" text PRIMARY KEY NOT NULL,
	"host_token_hash" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_signals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "room_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"room_id" text NOT NULL,
	"from_peer_id" text NOT NULL,
	"to_peer_id" text NOT NULL,
	"signal_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_profiles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stream_profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"display_name" text NOT NULL,
	"referral_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_profiles_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE INDEX "room_peers_activity_idx" ON "room_peers" USING btree ("room_id","status","last_seen_at");--> statement-breakpoint
CREATE INDEX "room_peers_last_seen_idx" ON "room_peers" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "room_signals_polling_idx" ON "room_signals" USING btree ("room_id","to_peer_id","id");