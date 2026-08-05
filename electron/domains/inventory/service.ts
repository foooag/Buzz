import { existsSync } from "node:fs";
import path from "node:path";
import { AppEncryptionProtector } from "./app-encryption.js";
import { openInventoryDatabase } from "./database.js";
import { AesGcmFieldCipher } from "./field-cipher.js";
import {
  loadOrCreateMasterKey,
  type KeyProtector,
} from "./master-key.js";
import { InventoryRepository } from "./repository.js";

export type InventoryServiceDependencies = {
  protector?: KeyProtector;
};

// Public synthetic key shared by deterministic E2E data. This path is
// only used for isolated test data and never protects user inventory.
const E2E_MASTER_KEY = Buffer.from(
  "terminus-e2e-master-key-v1-00001",
  "utf8",
);

export function createE2eMasterKey(): Buffer {
  return Buffer.from(E2E_MASTER_KEY);
}

export async function openInventoryService(
  dataDirectory: string,
  dependencies: InventoryServiceDependencies = {},
): Promise<InventoryRepository> {
  const databasePath = path.join(dataDirectory, "inventory.sqlite3");
  const keyPath = path.join(dataDirectory, "master-key.bin");
  const ownsProtector = !dependencies.protector;
  const protector = dependencies.protector ?? await AppEncryptionProtector.open(
    dataDirectory,
    existsSync(databasePath) || existsSync(keyPath),
  );
  let key: Buffer;
  try {
    key = await loadOrCreateMasterKey({
      keyPath,
      databaseExists: existsSync(databasePath),
      protector,
    });
  } finally {
    if (ownsProtector) protector.dispose?.();
  }

  try {
    const cipher = new AesGcmFieldCipher(key);
    const database = openInventoryDatabase(databasePath);
    return new InventoryRepository(database, cipher);
  } finally {
    key.fill(0);
  }
}

export function openE2eInventoryService(dataDirectory: string): InventoryRepository {
  const key = createE2eMasterKey();
  try {
    const cipher = new AesGcmFieldCipher(key);
    const database = openInventoryDatabase(path.join(dataDirectory, "inventory.e2e.sqlite3"));
    return new InventoryRepository(database, cipher);
  } finally {
    key.fill(0);
  }
}
