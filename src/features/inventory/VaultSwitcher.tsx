import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InventoryApi } from "./inventoryApi";
import { useInventoryStore } from "./inventoryStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function VaultSwitcher({ api }: { api: InventoryApi }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState("");
  const [editName, setEditName] = useState("");
  const vaults = useInventoryStore((state) => state.vaults);
  const order = useInventoryStore((state) => state.vaultOrder);
  const active = useInventoryStore((state) => state.activeVaultId);
  const activate = useInventoryStore((state) => state.activateVault);
  const setVaults = useInventoryStore((state) => state.setVaults);

  const fieldLabel = "grid gap-1.5 text-caption font-w510 text-fog";

  return (
    <div className="flex flex-wrap items-end gap-2">
      {order.length ? (
        <Label className={`${fieldLabel} w-full max-w-[220px]`}>
          <span>Vault</span>
          <Select value={active ?? ""} onValueChange={(value) => activate(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select vault" />
            </SelectTrigger>
            <SelectContent>
              {order.map((id) => <SelectItem key={id} value={id}>{vaults[id]?.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Label>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
        Create vault
      </Button>
      {active ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Rename vault"
            onClick={() => {
              setEditName(vaults[active]?.name ?? "");
              setEditing(true);
            }}
          >
            <Pencil size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete vault"
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={14} />
          </Button>
        </>
      ) : null}
      {creating ? (
        <form
          className="flex items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            const vault = await api.createVault({ name: trimmed });
            setVaults([...order.map((id) => vaults[id]).filter(Boolean), vault]);
            activate(vault.id);
            setName(""); setCreating(false);
          }}
        >
          <Label className={fieldLabel}>
            Vault name
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Label>
          <Button type="submit" size="sm">Save vault</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
        </form>
      ) : null}
      {editing && active ? (
        <form
          className="flex items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = editName.trim();
            if (!trimmed) return;
            await api.updateVault({ id: active, name: trimmed });
            setVaults(await api.listVaults());
            setEditing(false);
          }}
        >
          <Label className={fieldLabel}>
            New vault name
            <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
          </Label>
          <Button type="submit" size="sm">Save name</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        </form>
      ) : null}
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete vault</DialogTitle>
            <DialogDescription>
              This permanently deletes {active ? vaults[active]?.name : "this vault"} and every host, group, and identity inside it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleting(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!active) return;
                await api.deleteVault(active);
                setDeleting(false);
                setVaults(await api.listVaults());
              }}
            >
              Confirm delete vault
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
