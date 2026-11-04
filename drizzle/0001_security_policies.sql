-- Políticas de acesso no banco de dados.
--
-- A aplicação acessa o PostgreSQL somente pelo servidor (papel dono das
-- tabelas), aplicando autenticação e autorização por perfil no backend.
-- Para impedir acesso direto por outros caminhos (por exemplo, a API REST
-- pública do Supabase com as chaves anon/authenticated), o RLS é habilitado
-- em todas as tabelas SEM políticas permissivas: qualquer papel que não seja
-- o dono das tabelas não lê nem grava nada.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drivers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extraction_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "record_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Revoga privilégios dos papéis públicos do Supabase, quando existirem.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint

-- Registro de auditoria é somente inclusão: impede UPDATE/DELETE acidentais.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('autofichas.allow_audit_purge', true) = 'on' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs é somente inclusão';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();--> statement-breakpoint

-- Configuração única da empresa
INSERT INTO "company_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
