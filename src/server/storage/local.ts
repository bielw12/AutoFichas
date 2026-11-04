import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageDriver } from "./index";

/** Armazenamento em disco, em diretório privado (nunca dentro de /public). */
export class LocalStorageDriver implements StorageDriver {
  readonly name = "local";
  private root: string;

  constructor(dir: string) {
    this.root = path.resolve(process.cwd(), dir);
  }

  private resolve(key: string): string {
    if (!/^[a-zA-Z0-9/_\-.]+$/.test(key) || key.includes("..")) throw new Error("Chave de armazenamento inválida.");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Chave fora do diretório de armazenamento.");
    return full;
  }

  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await fs.writeFile(full, data, { mode: 0o600 });
  }

  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }

  async delete(keys: string[]) {
    for (const key of keys) {
      await fs.rm(this.resolve(key), { force: true });
    }
  }

  async exists(key: string) {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
