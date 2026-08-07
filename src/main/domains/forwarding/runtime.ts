import net, { type Server, type Socket } from "node:net";
import type { Client, ClientChannel } from "ssh2";
import { DomainError } from "../../ipc/domain-error.js";
import { SshRuntime, type CreateSshProfile } from "../ssh/runtime.js";

export type StartPortForwardRule = {
  id: string;
  kind: "local" | "remote" | "dynamic";
  bindHost: string;
  bindPort: number;
  targetHost: string | null;
  targetPort: number | null;
};

type RunningForward = {
  client: Client;
  server?: Server;
};

export class PortForwardingRuntime {
  readonly #ssh: SshRuntime;
  readonly #running = new Map<string, RunningForward>();

  constructor(ssh: SshRuntime) {
    this.#ssh = ssh;
  }

  async start(
    profile: CreateSshProfile,
    rule: StartPortForwardRule,
    streamId?: string,
  ): Promise<void> {
    validateRule(rule);
    if (this.#running.has(rule.id)) return;

    let server: Server | undefined;
    if (rule.kind !== "remote") {
      server = net.createServer();
      await listen(server, rule.bindHost, rule.bindPort);
    }
    let client: Client;
    try {
      client = await this.#ssh.connectClient(profile, rule.id, streamId);
    } catch (error) {
      server?.close();
      throw error;
    }

    try {
      if (rule.kind === "local") this.#startLocal(server as Server, client, rule);
      else if (rule.kind === "dynamic") this.#startDynamic(server as Server, client);
      else await this.#startRemote(client, rule);
      this.#running.set(rule.id, { client, server });
    } catch (error) {
      server?.close();
      client.end();
      throw error;
    }
  }

  decideHostKey(ruleId: string, trust: boolean): void {
    try {
      this.#ssh.decideHostKey(ruleId, trust);
    } catch {
      throw notFound();
    }
  }

  stop(ruleId: string): void {
    const running = this.#running.get(ruleId);
    if (!running) return;
    this.#running.delete(ruleId);
    running.server?.close();
    running.client.end();
  }

  listActive(): string[] {
    return [...this.#running.keys()];
  }

  closeAll(): void {
    for (const ruleId of [...this.#running.keys()]) this.stop(ruleId);
  }

  #startLocal(server: Server, client: Client, rule: StartPortForwardRule): void {
    server.on("connection", (socket) => {
      client.forwardOut(
        socket.remoteAddress ?? "127.0.0.1",
        socket.remotePort ?? 0,
        rule.targetHost as string,
        rule.targetPort as number,
        (error, channel) => {
          if (error) socket.destroy();
          else bridge(socket, channel);
        },
      );
    });
  }

  #startDynamic(server: Server, client: Client): void {
    server.on("connection", (socket) => {
      void negotiateSocks5(socket).then(({ host, port, remaining }) => {
        client.forwardOut(
          socket.remoteAddress ?? "127.0.0.1",
          socket.remotePort ?? 0,
          host,
          port,
          (error, channel) => {
            if (error) {
              socket.end(Buffer.from([5, 1, 0, 1, 0, 0, 0, 0, 0, 0]));
              return;
            }
            socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
            if (remaining.byteLength) channel.write(remaining);
            bridge(socket, channel);
          },
        );
      }).catch(() => socket.destroy());
    });
  }

  async #startRemote(client: Client, rule: StartPortForwardRule): Promise<void> {
    client.on("tcp connection", (_details, accept, reject) => {
      const socket = net.createConnection({
        host: rule.targetHost as string,
        port: rule.targetPort as number,
      });
      socket.once("connect", () => bridge(socket, accept()));
      socket.once("error", () => {
        reject();
        socket.destroy();
      });
    });
    await new Promise<void>((resolve, reject) => {
      client.forwardIn(rule.bindHost, rule.bindPort, (error) => {
        if (error) reject(new DomainError(
          "PORT_FORWARD_REMOTE_DENIED",
          "The SSH server denied remote port forwarding.",
        ));
        else resolve();
      });
    });
  }
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = () => reject(new DomainError(
      "PORT_FORWARD_BIND_FAILED",
      "The forwarding address or port is unavailable.",
    ));
    server.once("error", failed);
    server.listen(port, host, () => {
      server.off("error", failed);
      resolve();
    });
  });
}

function bridge(socket: Socket, channel: ClientChannel): void {
  socket.on("error", () => channel.destroy());
  channel.on("error", () => socket.destroy());
  socket.pipe(channel).pipe(socket);
}

export async function negotiateSocks5(socket: Socket): Promise<{
  host: string;
  port: number;
  remaining: Buffer;
}> {
  const reader = new SocketReader(socket);
  try {
    const greeting = await reader.read(2);
    if (greeting[0] !== 5 || greeting[1] === 0) throw socksError();
    const methods = await reader.read(greeting[1]);
    if (!methods.includes(0)) {
      socket.write(Buffer.from([5, 0xff]));
      throw socksError();
    }
    socket.write(Buffer.from([5, 0]));
    const request = await reader.read(4);
    if (request[0] !== 5 || request[1] !== 1 || request[2] !== 0) throw socksError();
    let host: string;
    if (request[3] === 1) host = [...await reader.read(4)].join(".");
    else if (request[3] === 3) {
      const length = (await reader.read(1))[0];
      host = (await reader.read(length)).toString("utf8");
      if (!host) throw socksError();
    } else if (request[3] === 4) {
      const bytes = await reader.read(16);
      const groups = Array.from({ length: 8 }, (_, index) => bytes.readUInt16BE(index * 2).toString(16));
      host = groups.join(":");
    } else throw socksError();
    const port = (await reader.read(2)).readUInt16BE(0);
    if (port === 0) throw socksError();
    return { host, port, remaining: reader.finish() };
  } catch (error) {
    reader.finish();
    throw error instanceof DomainError ? error : socksError();
  }
}

class SocketReader {
  readonly #socket: Socket;
  #buffer = Buffer.alloc(0);
  #waiting?: { length: number; resolve(value: Buffer): void; reject(error: Error): void };
  constructor(socket: Socket) {
    this.#socket = socket;
    socket.on("data", this.#onData);
    socket.once("close", this.#onClose);
    socket.once("error", this.#onClose);
  }
  read(length: number): Promise<Buffer> {
    if (this.#buffer.length >= length) return Promise.resolve(this.#take(length));
    return new Promise((resolve, reject) => {
      this.#waiting = { length, resolve, reject };
    });
  }
  finish(): Buffer {
    this.#socket.off("data", this.#onData);
    this.#socket.off("close", this.#onClose);
    this.#socket.off("error", this.#onClose);
    const remaining = this.#buffer;
    this.#buffer = Buffer.alloc(0);
    return remaining;
  }
  #take(length: number): Buffer {
    const value = this.#buffer.subarray(0, length);
    this.#buffer = this.#buffer.subarray(length);
    return value;
  }
  #onData = (data: Buffer) => {
    this.#buffer = Buffer.concat([this.#buffer, data]);
    const waiting = this.#waiting;
    if (waiting && this.#buffer.length >= waiting.length) {
      this.#waiting = undefined;
      waiting.resolve(this.#take(waiting.length));
    }
  };
  #onClose = () => {
    this.#waiting?.reject(socksError());
    this.#waiting = undefined;
  };
}

function validateRule(rule: StartPortForwardRule): void {
  if (
    !rule.id.trim() || !rule.bindHost.trim() || !validPort(rule.bindPort) ||
    (rule.kind !== "dynamic" && (!rule.targetHost?.trim() || !validPort(rule.targetPort)))
  ) throw new DomainError("PORT_FORWARD_INVALID", "The port forwarding rule is invalid.");
}
function validPort(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65_535;
}
function socksError() {
  return new DomainError("SOCKS_NEGOTIATION_FAILED", "The SOCKS request is invalid.");
}
function notFound() {
  return new DomainError("PORT_FORWARD_NOT_FOUND", "The forwarding rule is not active.");
}
