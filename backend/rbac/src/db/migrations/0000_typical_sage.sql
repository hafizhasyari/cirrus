CREATE TYPE "public"."connection_status" AS ENUM('pending', 'active', 'error', 'expired');--> statement-breakpoint
CREATE TYPE "public"."provider_id" AS ENUM('aws', 'gcp', 'alibaba', 'oci', 'biznet');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'disabled');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "provider_id" NOT NULL,
	"account" text NOT NULL,
	"identifier" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ref" text,
	"status" "connection_status" DEFAULT 'pending' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_check_message" text,
	"added_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cloud_accounts" (
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	CONSTRAINT "user_cloud_accounts_user_id_connection_id_pk" PRIMARY KEY("user_id","connection_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oid" text,
	"tid" text,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" "role" DEFAULT 'viewer' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_connections" ADD CONSTRAINT "cloud_connections_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cloud_accounts" ADD CONSTRAINT "user_cloud_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cloud_accounts" ADD CONSTRAINT "user_cloud_accounts_connection_id_cloud_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."cloud_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_oid_tid_not_null_idx" ON "users" USING btree ("oid","tid") WHERE "users"."oid" IS NOT NULL;