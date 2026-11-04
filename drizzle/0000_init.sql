CREATE TYPE "public"."record_base_status" AS ENUM('rascunho', 'documentacao_pendente', 'incompleto', 'aguardando_conferencia', 'completo');--> statement-breakpoint
CREATE TYPE "public"."doc_processing_status" AS ENUM('enviado', 'processando', 'processado', 'ilegivel', 'incompativel', 'erro', 'nao_aplicavel');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('cnh', 'comprovante_residencia', 'dados_bancarios', 'crlv', 'antt', 'foto_veiculo', 'outro');--> statement-breakpoint
CREATE TYPE "public"."record_kind" AS ENUM('driver', 'vehicle');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'operador', 'visualizador');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_name" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"cnpj" text DEFAULT '' NOT NULL,
	"logo_storage_key" text,
	"logo_mime" text,
	"primary_color" text DEFAULT '#2D5A94' NOT NULL,
	"accent_color" text DEFAULT '#F4CF14' NOT NULL,
	"phones" text DEFAULT '' NOT NULL,
	"emails" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"footer_text" text DEFAULT '' NOT NULL,
	"footer_on_documents" boolean DEFAULT true NOT NULL,
	"include_bank_page" boolean DEFAULT true NOT NULL,
	"expiry_warning_days" integer DEFAULT 30 NOT NULL,
	"draft_retention_days" integer DEFAULT 30 NOT NULL,
	"trash_retention_days" integer DEFAULT 90 NOT NULL,
	"external_ai_enabled" boolean DEFAULT false NOT NULL,
	"external_ai_enabled_by" uuid,
	"external_ai_enabled_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_settings_singleton" CHECK ("company_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_kind" "record_kind" NOT NULL,
	"driver_id" uuid,
	"vehicle_id" uuid,
	"doc_type" "doc_type" NOT NULL,
	"original_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"page_count" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"processing_status" "doc_processing_status" DEFAULT 'enviado' NOT NULL,
	"processing_message" text,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by" uuid,
	CONSTRAINT "documents_owner_check" CHECK (("documents"."record_kind" = 'driver' and "documents"."driver_id" is not null and "documents"."vehicle_id" is null) or ("documents"."record_kind" = 'vehicle' and "documents"."vehicle_id" is not null and "documents"."driver_id" is null))
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_draft" boolean DEFAULT true NOT NULL,
	"base_status" "record_base_status" DEFAULT 'rascunho' NOT NULL,
	"review_pending" boolean DEFAULT false NOT NULL,
	"observacoes" text,
	"field_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acknowledged_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf_storage_key" text,
	"pdf_generated_at" timestamp with time zone,
	"pdf_stale" boolean DEFAULT true NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nome" text,
	"cpf" text,
	"rg" text,
	"data_nascimento" date,
	"naturalidade" text,
	"cnh_numero" text,
	"cnh_registro" text,
	"cnh_categoria" text,
	"cnh_emissao" date,
	"cnh_validade" date,
	"cnh_primeira_habilitacao" date,
	"cnh_uf" text,
	"cnh_observacoes" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"uf" text,
	"endereco_titular" text,
	"endereco_vinculo" text,
	"comprovante_emissao" date,
	"telefone_principal" text,
	"contato_comercial_nome" text,
	"telefone_secundario" text,
	"contato_operacional_nome" text,
	"email" text,
	"contato_adicional" text,
	"banco_nome" text,
	"banco_codigo" text,
	"agencia" text,
	"conta" text,
	"conta_digito" text,
	"conta_tipo" text,
	"titular_nome" text,
	"titular_documento" text,
	"titular_vinculo" text,
	"pix_tipo" text,
	"pix_chave" text
);
--> statement-breakpoint
CREATE TABLE "extraction_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_kind" "record_kind" NOT NULL,
	"driver_id" uuid,
	"vehicle_id" uuid,
	"doc_type" "doc_type" NOT NULL,
	"document_id" uuid,
	"document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"detected_type" text,
	"matches_expected" boolean DEFAULT true NOT NULL,
	"legibility" text DEFAULT 'boa' NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"duration_ms" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_kind" "record_kind" NOT NULL,
	"driver_id" uuid,
	"vehicle_id" uuid,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"document_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text,
	"pdf_storage_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'operador' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_draft" boolean DEFAULT true NOT NULL,
	"base_status" "record_base_status" DEFAULT 'rascunho' NOT NULL,
	"review_pending" boolean DEFAULT false NOT NULL,
	"observacoes" text,
	"field_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acknowledged_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf_storage_key" text,
	"pdf_generated_at" timestamp with time zone,
	"pdf_stale" boolean DEFAULT true NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"marca" text,
	"modelo" text,
	"placa" text,
	"renavam" text,
	"chassi" text,
	"ano_fabricacao" text,
	"ano_modelo" text,
	"cor" text,
	"combustivel" text,
	"especie_tipo" text,
	"crlv_categoria" text,
	"numero_crv" text,
	"municipio" text,
	"uf_registro" text,
	"capacidade_carga_kg" text,
	"cubagem_m_3" text,
	"tipo_veiculo" text,
	"tipo_rodado" text,
	"tipo_carroceria" text,
	"eixos" text,
	"tag_pedagio_operadora" text,
	"tag_pedagio_numero" text,
	"caracteristicas_visuais" text,
	"rntrc" text,
	"antt_tipo" text,
	"antt_categoria" text,
	"antt_situacao" text,
	"antt_transportador_nome" text,
	"antt_transportador_documento" text,
	"antt_emissao" date,
	"antt_validade" date,
	"crlv_exercicio" text,
	"licenciamento_validade" date,
	"proprietario_nome" text,
	"proprietario_documento" text,
	"proprietario_info" text
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_external_ai_enabled_by_users_id_fk" FOREIGN KEY ("external_ai_enabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_superseded_by_users_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_results" ADD CONSTRAINT "extraction_results_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_results" ADD CONSTRAINT "extraction_results_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_results" ADD CONSTRAINT "extraction_results_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_results" ADD CONSTRAINT "extraction_results_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_versions" ADD CONSTRAINT "record_versions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_versions" ADD CONSTRAINT "record_versions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_versions" ADD CONSTRAINT "record_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_driver_idx" ON "documents" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "documents_vehicle_idx" ON "documents" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_cpf_active_unique" ON "drivers" USING btree ("cpf") WHERE "drivers"."archived_at" is null and "drivers"."is_draft" = false and "drivers"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "drivers_cpf_idx" ON "drivers" USING btree ("cpf");--> statement-breakpoint
CREATE INDEX "drivers_updated_idx" ON "drivers" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "drivers_validade_idx" ON "drivers" USING btree ("cnh_validade");--> statement-breakpoint
CREATE INDEX "extraction_driver_idx" ON "extraction_results" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "extraction_vehicle_idx" ON "extraction_results" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "login_attempts_key_idx" ON "login_attempts" USING btree ("key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "versions_driver_unique" ON "record_versions" USING btree ("driver_id","version") WHERE "record_versions"."driver_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "versions_vehicle_unique" ON "record_versions" USING btree ("vehicle_id","version") WHERE "record_versions"."vehicle_id" is not null;--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_placa_active_unique" ON "vehicles" USING btree ("placa") WHERE "vehicles"."archived_at" is null and "vehicles"."is_draft" = false and "vehicles"."placa" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_renavam_active_unique" ON "vehicles" USING btree ("renavam") WHERE "vehicles"."archived_at" is null and "vehicles"."is_draft" = false and "vehicles"."renavam" is not null;--> statement-breakpoint
CREATE INDEX "vehicles_placa_idx" ON "vehicles" USING btree ("placa");--> statement-breakpoint
CREATE INDEX "vehicles_updated_idx" ON "vehicles" USING btree ("updated_at");