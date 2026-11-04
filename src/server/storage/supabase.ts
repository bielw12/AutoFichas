import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StorageDriver } from "./index";

/**
 * Supabase Storage em bucket PRIVADO. O acesso acontece apenas pelo servidor
 * com a chave service_role; o navegador nunca recebe URLs do Supabase — os
 * arquivos são servidos pela rota autenticada /api/files com URLs temporárias.
 */
export class SupabaseStorageDriver implements StorageDriver {
  readonly name = "supabase";
  private client: SupabaseClient;
  private bucket: string;
  private bucketChecked = false;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("STORAGE_DRIVER=supabase requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    }
    this.client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || "autofichas-documentos";
  }

  private async ensureBucket() {
    if (this.bucketChecked) return;
    const { data } = await this.client.storage.getBucket(this.bucket);
    if (!data) {
      const { error } = await this.client.storage.createBucket(this.bucket, { public: false });
      if (error && !/already exists/i.test(error.message)) throw new Error(`Supabase Storage: ${error.message}`);
    } else if (data.public) {
      throw new Error(`O bucket "${this.bucket}" está público. Torne-o privado antes de usar.`);
    }
    this.bucketChecked = true;
  }

  async put(key: string, data: Buffer, contentType: string) {
    await this.ensureBucket();
    const { error } = await this.client.storage.from(this.bucket).upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`Supabase Storage (upload): ${error.message}`);
  }

  async get(key: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) throw new Error(`Supabase Storage (download): ${error?.message ?? "arquivo não encontrado"}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(keys: string[]) {
    if (!keys.length) return;
    const { error } = await this.client.storage.from(this.bucket).remove(keys);
    if (error) throw new Error(`Supabase Storage (remoção): ${error.message}`);
  }

  async exists(key: string) {
    const dir = key.split("/").slice(0, -1).join("/");
    const name = key.split("/").pop()!;
    const { data } = await this.client.storage.from(this.bucket).list(dir, { search: name });
    return !!data?.some((f) => f.name === name);
  }
}
