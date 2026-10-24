import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  InMemorySecretStore,
  type SecretStore,
} from "../src/security/secrets.js";
import {
  isAllowedDestination,
  validateDestination,
} from "../src/security/destinations.js";

describe("destination policy", () => {
  it("allows loopback host for fixtures and local analytics", () => {
    expect(isAllowedDestination("127.0.0.1", 5432)).toBe(true);
    expect(isAllowedDestination("localhost", 5432)).toBe(true);
    expect(() => validateDestination("127.0.0.1", 5432)).not.toThrow();
  });

  it("blocks cloud metadata service and link-local destinations", () => {
    expect(isAllowedDestination("169.254.169.254", 80)).toBe(false);
    expect(isAllowedDestination("169.254.1.1", 5432)).toBe(false);
    expect(() => validateDestination("169.254.169.254", 80)).toThrow(
      "Destination host is not permitted by policy",
    );
  });

  it("blocks all-zeros address and unauthorized host formats", () => {
    expect(isAllowedDestination("0.0.0.0", 5432)).toBe(false);
    expect(() => validateDestination("0.0.0.0", 5432)).toThrow();
  });
});

describe("secret store", () => {
  const masterKey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("encrypts and decrypts secret credentials round-trip", () => {
    const plaintext = "super-secret-password-123";
    const ciphertext = encryptSecret(plaintext, masterKey);
    expect(ciphertext).not.toContain(plaintext);
    expect(decryptSecret(ciphertext, masterKey)).toBe(plaintext);
  });

  it("stores and resolves secret references", async () => {
    const store: SecretStore = new InMemorySecretStore(masterKey);
    await store.set("secret://fixture/reader", "reader-pass");
    const resolved = await store.get("secret://fixture/reader");
    expect(resolved).toBe("reader-pass");
  });

  it("throws error for missing secret references", async () => {
    const store = new InMemorySecretStore(masterKey);
    await expect(store.get("secret://unknown/path")).rejects.toThrow(
      "Secret reference not found",
    );
  });

  it("fails decryption if ciphertext is tampered", () => {
    const plaintext = "my-secret";
    const ciphertext = encryptSecret(plaintext, masterKey);
    const tampered = ciphertext.slice(0, -4) + "abcd";
    expect(() => decryptSecret(tampered, masterKey)).toThrow();
  });
});
