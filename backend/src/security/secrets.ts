import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface SecretStore {
  set(reference: string, value: string): Promise<void>;
  get(reference: string): Promise<string>;
  has(reference: string): Promise<boolean>;
}

function normalizeKey(key: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, "hex");
  }
  const padded = Buffer.alloc(32);
  Buffer.from(key).copy(padded);
  return padded;
}

export function encryptSecret(plaintext: string, masterKey: string): string {
  const key = normalizeKey(masterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(ciphertext: string, masterKey: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }
  const [ivHex, tagHex, dataHex] = parts as [string, string, string];
  const key = normalizeKey(masterKey);
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export class InMemorySecretStore implements SecretStore {
  private readonly store = new Map<string, string>();
  private readonly masterKey: string;

  constructor(masterKey?: string) {
    this.masterKey =
      masterKey ??
      process.env.SECRET_ENCRYPTION_KEY ??
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  }

  async set(reference: string, value: string): Promise<void> {
    const encrypted = encryptSecret(value, this.masterKey);
    this.store.set(reference, encrypted);
  }

  async get(reference: string): Promise<string> {
    const encrypted = this.store.get(reference);
    if (encrypted === undefined) {
      throw new Error(`Secret reference not found: ${reference}`);
    }
    return decryptSecret(encrypted, this.masterKey);
  }

  async has(reference: string): Promise<boolean> {
    return this.store.has(reference);
  }
}

let defaultStoreInstance: SecretStore | undefined;

export function getDefaultSecretStore(): SecretStore {
  if (defaultStoreInstance === undefined) {
    defaultStoreInstance = new InMemorySecretStore();
  }
  return defaultStoreInstance;
}
