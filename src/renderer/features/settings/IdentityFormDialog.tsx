import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Identity } from "../../shared/types";

const inputCls =
  "w-full rounded-md border border-graphite bg-carbon px-2.5 py-1.5 text-[12.5px] text-mist outline-hidden transition-colors placeholder:text-fog/45 focus:border-smoke";

export type IdentityDraft = {
  name: string;
  username: string;
  type?: string;
  algorithm?: string;
  passphrase?: boolean;
  expires?: string;
};

const IDENTITY_TYPES = ["SSH key", "SSH certificate"] as const;
const ALGORITHMS = ["ed25519", "rsa-4096", "ecdsa"] as const;

export function IdentityFormDialog({
  open,
  initial,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  initial?: Identity;
  onSubmit: (draft: IdentityDraft) => void;
  onCancel: () => void;
}) {
  const editing = Boolean(initial);
  const [draft, setDraft] = useState<IdentityDraft>(() => ({
    name: initial?.name ?? "",
    username: initial?.username ?? "",
    type: initial?.type ?? "SSH key",
    algorithm: initial?.algorithm ?? "ed25519",
    passphrase: initial?.passphrase ?? false,
    expires: initial?.expires ?? "",
  }));

  useEffect(() => {
    if (!open) return;
    setDraft({
      name: initial?.name ?? "",
      username: initial?.username ?? "",
      type: initial?.type ?? "SSH key",
      algorithm: initial?.algorithm ?? "ed25519",
      passphrase: initial?.passphrase ?? false,
      expires: initial?.expires ?? "",
    });
  }, [open, initial]);

  const set = (patch: Partial<IdentityDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const isCert = draft.type === "SSH certificate";
  const valid = draft.name.trim().length > 0;

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit identity" : "New identity"}</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-[11.5px] text-fog">
          Metadata is saved encrypted; private-key material is added in a later milestone.
        </p>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="identity-name">Name</Label>
            <Input
              id="identity-name"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="identity-username">Username</Label>
            <Input
              id="identity-username"
              value={draft.username}
              onChange={(e) => set({ username: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="identity-type">Type</Label>
              <div className="relative">
                <select
                  id="identity-type"
                  value={draft.type}
                  onChange={(e) => set({ type: e.target.value })}
                  className={inputCls + " appearance-none pr-7"}
                >
                  {IDENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fog" />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="identity-algorithm">Algorithm</Label>
              <div className="relative">
                <select
                  id="identity-algorithm"
                  value={draft.algorithm}
                  onChange={(e) => set({ algorithm: e.target.value })}
                  className={inputCls + " appearance-none pr-7"}
                >
                  {ALGORITHMS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fog" />
              </div>
            </div>
          </div>
          <label className="flex items-center justify-between gap-4 py-1">
            <span className="text-[13px] text-mist">Passphrase-protected</span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(draft.passphrase)}
              aria-label="Passphrase-protected"
              onClick={() => set({ passphrase: !draft.passphrase })}
              className={`relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors ${draft.passphrase ? "bg-acid-lime/80" : "bg-smoke"}`}
            >
              <span className={`absolute top-[2px] h-4 w-4 rounded-full bg-paper transition-all ${draft.passphrase ? "left-[16px]" : "left-[2px]"}`} />
            </button>
          </label>
          {isCert ? (
            <div className="grid gap-1">
              <Label htmlFor="identity-expires">Expires</Label>
              <Input
                id="identity-expires"
                type="date"
                value={draft.expires ?? ""}
                onChange={(e) => set({ expires: e.target.value })}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            disabled={!valid}
            onClick={() =>
              onSubmit({
                name: draft.name.trim(),
                username: draft.username.trim(),
                type: draft.type,
                algorithm: draft.algorithm,
                passphrase: draft.passphrase,
                expires: isCert ? draft.expires : undefined,
              })
            }
          >
            Save identity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
