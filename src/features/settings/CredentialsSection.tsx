import { Download, KeyRound, Lock, Pencil, Plus, Server, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Identity } from "../../shared/types";
import type { InventoryApi } from "../inventory/inventoryApi";
import { useInventoryStore } from "../inventory/inventoryStore";
import { IdentityFormDialog, type IdentityDraft } from "./IdentityFormDialog";

export function CredentialsSection({ api }: { api: InventoryApi }) {
  const activeVaultId = useInventoryStore((s) => s.activeVaultId);
  const status = useInventoryStore((s) => s.status);
  const identityMap = useInventoryStore((s) => s.identities);
  const hostMap = useInventoryStore((s) => s.hosts);
  const identities = Object.values(identityMap);
  const hosts = Object.values(hostMap);

  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; identity: Identity } | null>(null);
  const [deleting, setDeleting] = useState<Identity | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!activeVaultId) return;
    try {
      const list = await api.listIdentities(activeVaultId);
      useInventoryStore.getState().setIdentities(list);
      setErrorCode(null);
    } catch (error) {
      setErrorCode(errorCodeOf(error));
    }
  }, [activeVaultId, api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submit = async (draft: IdentityDraft) => {
    if (!activeVaultId) return;
    try {
      if (dialog?.mode === "edit") {
        await api.updateIdentity({ id: dialog.identity.id, vaultId: activeVaultId, ...draft });
      } else {
        await api.createIdentity({ vaultId: activeVaultId, ...draft });
      }
      setDialog(null);
      await reload();
    } catch (error) {
      setErrorCode(errorCodeOf(error));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteIdentity(deleting.id);
      setDeleting(null);
      await reload();
    } catch (error) {
      setErrorCode(errorCodeOf(error));
    }
  };

  if (!activeVaultId) {
    return (
      <Alert>
        <AlertTitle className="text-body-lg font-w510">No vault</AlertTitle>
        <AlertDescription>Create a local vault in the Servers view first.</AlertDescription>
      </Alert>
    );
  }
  if (status === "loading") {
    return <p className="text-[13px] text-fog">Loading keys…</p>;
  }
  if (errorCode) {
    return (
      <div className="grid gap-3">
        <Alert variant="destructive">
          <AlertTitle className="text-body-lg font-w510">Identities unavailable</AlertTitle>
          <AlertDescription>The local inventory could not be opened.</AlertDescription>
        </Alert>
        <Button variant="outline" className="justify-self-start" onClick={() => void reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-graphite/70 bg-obsidian/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-graphite text-mist"><KeyRound size={16} /></span>
            <div>
              <h2 className="m-0 text-[16px] font-semibold tracking-tight text-paper">Keys &amp; identities</h2>
              <p className="m-0 mt-0.5 text-[12px] text-fog">Encrypted at rest in the local vault — never leaves the device in plaintext</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" disabled title="Available in the credentials milestone"><Upload size={13} />Import</Button>
            <Button onClick={() => setDialog({ mode: "create" })}><Plus size={13} />New key</Button>
          </div>
        </div>

        {identities.length === 0 ? (
          <p className="m-0 px-2 py-6 text-center text-[12.5px] text-fog">No keys yet</p>
        ) : (
          <div className="grid gap-1.5">
            {identities.map((identity) => {
              const attached = hosts.filter((h) => h.identity === identity.name).length;
              const isCert = identity.type === "SSH certificate";
              return (
                <div key={identity.id} className="flex items-center gap-3 rounded-lg border border-graphite/70 bg-carbon/50 px-3 py-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-graphite text-mist">
                    {isCert ? <ShieldCheck size={15} /> : <KeyRound size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] text-mist">{identity.name}</span>
                      {identity.algorithm ? (
                        <span className="rounded-pill bg-graphite/60 px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.04em] text-fog">{identity.algorithm}</span>
                      ) : null}
                      {identity.passphrase ? <Lock size={10} className="text-fog" /> : null}
                    </div>
                  </div>
                  <div className="hidden shrink-0 items-center gap-1 text-[11.5px] text-fog sm:flex">
                    <Server size={11} />{attached} host{attached === 1 ? "" : "s"}
                  </div>
                  {identity.expires ? (
                    <span className="shrink-0 rounded-pill bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">expires {identity.expires}</span>
                  ) : null}
                  <button type="button" aria-label={`Export ${identity.name}`} disabled title="Available in the credentials milestone" className="grid h-7 w-7 place-items-center rounded-md text-fog opacity-50">
                    <Download size={14} />
                  </button>
                  <button type="button" aria-label={`Edit ${identity.name}`} onClick={() => setDialog({ mode: "edit", identity })} className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist">
                    <Pencil size={14} />
                  </button>
                  <button type="button" aria-label={`Delete ${identity.name}`} onClick={() => setDeleting(identity)} className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-coral-red/12 hover:text-coral-red">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <IdentityFormDialog
        open={dialog !== null}
        initial={dialog?.mode === "edit" ? dialog.identity : undefined}
        onSubmit={(draft) => void submit(draft)}
        onCancel={() => setDialog(null)}
      />

      <Dialog open={deleting !== null}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete identity</DialogTitle>
            <DialogDescription>This removes {deleting?.name} from the local vault. Hosts referencing it keep the name until edited.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>Confirm delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function errorCodeOf(error: unknown): string {
  if (typeof error === "object" && error && "code" in error && typeof (error as { code: unknown }).code === "string")
    return (error as { code: string }).code;
  return "INVENTORY_STORAGE_FAILED";
}
