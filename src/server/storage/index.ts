import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { LocalStorageDriver } from "./local";
import { SupabaseStorageDriver } from "./supabase";

export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(keys: string[]): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const MAGIC = Buffer.from("AFENC1");

function encryptionKey(): Buffer | null {
  const raw = process.env.STORAGE_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("STORAGE_ENCRYPTION_KEY deve ter 32 bytes em base64.");
  return key;
}

export function encryptBuffer(data: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc]);
}

export function decryptBuffer(data: Buffer, key: Buffer | null): Buffer {
  if (data.length < MAGIC.length + 28 || !data.subarray(0, MAGIC.length).equals(MAGIC)) return data;
  if (!key) throw new Error("Arquivo criptografado, mas STORAGE_ENCRYPTION_KEY não está configurada.");
  const iv = data.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = data.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(MAGIC.length + 28)), decipher.final()]);
}

/** Envolve o driver com criptografia AES-256-GCM quando houver chave. */
class EncryptedStorage implements StorageDriver {
  constructor(private inner: StorageDriver) {}
  get name() {
    return this.inner.name + (encryptionKey() ? "+aes256gcm" : "");
  }
  async put(key: string, data: Buffer, contentType: string) {
    const k = encryptionKey();
    await this.inner.put(key, k ? encryptBuffer(data, k) : data, k ? "application/octet-stream" : contentType);
  }
  async get(key: string) {
    return decryptBuffer(await this.inner.get(key), encryptionKey());
  }
  delete(keys: string[]) {
    return this.inner.delete(keys);
  }
  exists(key: string) {
    return this.inner.exists(key);
  }
}

let instance: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (instance) return instance;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  const inner: StorageDriver =
    driver === "supabase" ? new SupabaseStorageDriver() : new LocalStorageDriver(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  instance = new EncryptedStorage(inner);
  return instance;
}

/** Chaves com separação lógica entre motoristas e veículos. */
export const storageKeys = {
  document(kind: "driver" | "vehicle", recordId: string, docId: string, ext: string) {
    return `${kind === "driver" ? "motoristas" : "veiculos"}/${recordId}/documentos/${docId}.${ext}`;
  },
  ficha(kind: "driver" | "vehicle", recordId: string, label: string) {
    return `${kind === "driver" ? "motoristas" : "veiculos"}/${recordId}/fichas/${label}.pdf`;
  },
  logo(ext: string) {
    return `configuracoes/logo-${Date.now()}.${ext}`;
  },
};
