import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SshApi } from "./sshApi";
import type { HostKeyPrompt } from "./sshTypes";

export function HostKeyDialog({ api, pending, changed, onClose }: {
  api: SshApi;
  pending?: HostKeyPrompt;
  changed?: { sessionId: string };
  onClose: () => void;
}) {
  if (changed) {
    return (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>SSH host key changed</AlertDialogTitle>
            <AlertDialogDescription>
              The connection was blocked because the trusted host key no longer matches.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction onClick={onClose}>Close</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  if (!pending) return null;
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify SSH host key</DialogTitle>
          <DialogDescription>
            Compare this fingerprint through a trusted channel before connecting.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-md bg-obsidian p-3 font-mono text-caption">
          <dt className="text-fog">Host</dt>
          <dd className="m-0 break-all">{pending.host}:{pending.port}</dd>
          <dt className="text-fog">Algorithm</dt>
          <dd className="m-0 break-all">{pending.algorithm}</dd>
          <dt className="text-fog">Fingerprint</dt>
          <dd className="m-0 break-all">{pending.fingerprint}</dd>
        </dl>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button onClick={async () => { await api.decideHostKey(pending.sessionId, true); onClose(); }}>
            Trust and connect
          </Button>
          <Button variant="outline" onClick={async () => { await api.decideHostKey(pending.sessionId, false); onClose(); }}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
