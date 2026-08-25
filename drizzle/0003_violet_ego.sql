CREATE TABLE "user_friendships" (
	"user_a_id" text NOT NULL,
	"user_b_id" text NOT NULL,
	"requested_by_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "user_friendships_user_a_id_user_b_id_pk" PRIMARY KEY("user_a_id","user_b_id"),
	CONSTRAINT "user_friendships_order_check" CHECK ("user_friendships"."user_a_id" < "user_friendships"."user_b_id"),
	CONSTRAINT "user_friendships_requester_check" CHECK ("user_friendships"."requested_by_id" = "user_friendships"."user_a_id" OR "user_friendships"."requested_by_id" = "user_friendships"."user_b_id"),
	CONSTRAINT "user_friendships_status_check" CHECK ("user_friendships"."status" IN ('pending', 'accepted'))
);
--> statement-breakpoint
ALTER TABLE "user_friendships" ADD CONSTRAINT "user_friendships_user_a_id_app_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_friendships" ADD CONSTRAINT "user_friendships_user_b_id_app_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_friendships" ADD CONSTRAINT "user_friendships_requested_by_id_app_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_friendships_user_b_status_idx" ON "user_friendships" USING btree ("user_b_id","status");--> statement-breakpoint
CREATE INDEX "user_friendships_requester_idx" ON "user_friendships" USING btree ("requested_by_id","status");