import { existsSync } from "node:fs";
import path from "node:path";
import { AppEncryptionProtector } from "../inventory/app-encryption.js";
import { openInventoryDatabase } from "../inventory/database.js";
import { AesGcmFieldCipher } from "../inventory/field-cipher.js";
import { loadOrCreateMasterKey } from "../inventory/master-key.js";
import { createE2eMasterKey } from "../inventory/service.js";
import {
  MemorySshCredentialVault,
  ProtectedFileCredentialVault,
  type SshCredentialVault,
} from "./credential-vault.js";
import { KnownHostsRepository } from "./known-hosts.js";

export type SshPersistence = {
  credentials: SshCredentialVault;
  knownHosts: KnownHostsRepository;
  close(): void;
};

export async function openSshPersistence(
  dataDirectory: string,
  isolatedE2e = false,
): Promise<SshPersistence> {
  const databasePath = path.join(
    dataDirectory,
    isolatedE2e ? "inventory.e2e.sqlite3" : "inventory.sqlite3",
  );
  let key: Buffer;
  let appProtector: AppEncryptionProtector | undefined;
  if (isolatedE2e) {
    key = createE2eMasterKey();
  } else {
    const keyPath = path.join(dataDirectory, "master-key.bin");
    appProtector = await AppEncryptionProtector.open(
      dataDirectory,
      existsSync(databasePath) || existsSync(keyPath) || existsSync(path.join(dataDirectory, "ssh-credentials")),
    );
    try {
      key = await loadOrCreateMasterKey({
        keyPath,
        databaseExists: existsSync(databasePath),
        protector: appProtector,
      });
    } catch (error) {
      appProtector.dispose();
      throw error;
    }
  }

  const cipher = new AesGcmFieldCipher(key);
  key.fill(0);
  const knownHosts = new KnownHostsRepository(openInventoryDatabase(databasePath), cipher);
  const credentials = isolatedE2e
    ? new MemorySshCredentialVault()
    : new ProtectedFileCredentialVault(
      path.join(dataDirectory, "ssh-credentials"),
      appProtector!,
    );
  return {
    credentials,
    knownHosts,
    close: () => {
      if (credentials instanceof MemorySshCredentialVault) credentials.dispose();
      knownHosts.close();
      appProtector?.dispose();
    },
  };
}
