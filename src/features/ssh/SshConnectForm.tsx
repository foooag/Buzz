import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { OpenedTerminal, TerminalEvent } from "../shell/terminalTypes";
import type { SshApi } from "./sshApi";
import { sshProfileDraftSchema } from "./sshProfileSchema";
import type { SshAuthKind, SshCredentialInput } from "./sshTypes";
import {
  markConnectionConnected,
  markConnectionFailed,
  recordConnectionAttempt,
} from "../workspace/connectionHistory";

export function SshConnectForm({
  api,
  hostId,
  defaultHostname,
  defaultPort = 22,
  defaultUsername = "",
  defaultAuthKind = "password",
  keepaliveInterval = 30,
  onCancel,
  onEvent,
  onOpened,
}: {
  api: SshApi; hostId: string; defaultHostname: string; defaultPort?: number;
  defaultUsername?: string; defaultAuthKind?: SshAuthKind; onCancel: () => void;
  keepaliveInterval?: number;
  onEvent: (event: TerminalEvent) => void; onOpened: (opened: OpenedTerminal) => void;
}) {
  const [hostname, setHostname] = useState(defaultHostname);
  const [port, setPort] = useState(String(defaultPort));
  const [username, setUsername] = useState(defaultUsername);
  const [authKind, setAuthKind] = useState<SshAuthKind>(defaultAuthKind);
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const fieldLabel = "grid gap-1.5 text-caption font-w510 text-fog";

  return (
    <form
      aria-label="Connect SSH"
      className="mx-auto max-w-[640px] px-5 py-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const parsed = sshProfileDraftSchema.safeParse({ hostId, hostname, port, username, authKind });
        if (!parsed.success) { setError("Enter a valid hostname, port, and username."); return; }
        const credential: SshCredentialInput = authKind === "password"
          ? { type: "password", password }
          : { type: "privateKey", privateKey: Array.from(new TextEncoder().encode(privateKey)), passphrase: passphrase || null };
        if ((authKind === "password" && !password) || (authKind === "privateKey" && !privateKey)) {
          setError("Enter the selected SSH credential."); return;
        }
        setPending(true); setError(null);
        const historyId = recordConnectionAttempt({
          hostId: parsed.data.hostId,
          host: parsed.data.hostname,
          port: parsed.data.port,
          username: parsed.data.username,
        });
        try {
          const credentialRef = await api.storeCredential(credential);
          setPassword(""); setPrivateKey(""); setPassphrase("");
          const opened = await api.open({
            hostId: parsed.data.hostId, hostname: parsed.data.hostname, port: parsed.data.port,
            username: parsed.data.username, authKind: parsed.data.authKind,
            credentialRef, identityId: null, keepaliveInterval,
          }, { cols: 80, rows: 24 }, onEvent);
          markConnectionConnected(historyId, opened.sessionId);
          onOpened(opened);
        } catch {
          markConnectionFailed(historyId);
          setError("The SSH connection could not be opened.");
        }
        finally { setPending(false); }
      }}
    >
      <Card>
        <CardHeader>
          <h2 className="m-0 text-body-lg font-w510 tracking-[-0.012em] text-paper">
            Connect with SSH
          </h2>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Label className={fieldLabel}>
            Hostname
            <Input value={hostname} onChange={(event) => setHostname(event.target.value)} />
          </Label>
          <Label className={fieldLabel}>
            Port
            <Input inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value)} />
          </Label>
          <Label className={fieldLabel}>
            Username
            <Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </Label>
          <Label className={fieldLabel}>
            Authentication
            <Select value={authKind} onValueChange={(value) => setAuthKind(value as SshAuthKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="password">Password</SelectItem>
                <SelectItem value="privateKey">Private key</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          {authKind === "password" ? (
            <Label className={fieldLabel}>
              Password
              <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Label>
          ) : (
            <>
              <Label className={fieldLabel}>
                Private key
                <Textarea value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} className="min-h-[130px] font-mono" />
              </Label>
              <Label className={fieldLabel}>
                Passphrase
                <Input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
              </Label>
            </>
          )}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="gap-2">
          <Button type="submit" disabled={pending}>Connect SSH</Button>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
