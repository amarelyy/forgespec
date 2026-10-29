import { promises as fs } from 'fs';
import path from 'path';

/** Object Storage (Data Layer): exports and backup archives. Swap for S3/MinIO behind this interface. */
export interface ObjectStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export class LocalStorage implements ObjectStorage {
  constructor(private dir: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.dir, key);
    if (!full.startsWith(path.resolve(this.dir) + path.sep)) throw new Error('invalid storage key');
    return full;
  }
  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  }
  async get(key: string) {
    try {
      return await fs.readFile(this.resolve(key));
    } catch (e: any) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

export class MemoryStorage implements ObjectStorage {
  files = new Map<string, Buffer>();
  async put(key: string, data: Buffer) { this.files.set(key, data); }
  async get(key: string) { return this.files.get(key) ?? null; }
  async delete(key: string) { this.files.delete(key); }
}
