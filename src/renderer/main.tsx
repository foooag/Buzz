import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppProviders } from "./app/providers";
import { createDeterministicTerminalApi } from "./features/shell/deterministicTerminalApi";
import { createDeterministicInventoryApi } from "./features/inventory/deterministicInventoryApi";
import { createPrototypeInventoryApi } from "./features/inventory/prototypeInventoryApi";
import { createDeterministicSshApi } from "./features/ssh/deterministicSshApi";
import "@fontsource-variable/inter";
import { createDeterministicSftpApi } from "./features/sftp/deterministicSftpApi";
import { createDeterministicAiConfigApi } from "./features/ai/deterministicAiApi";
import { PROTOTYPE_AI_PROVIDERS } from "./features/ai/prototypeAiProviders";
import { createDeterministicForwardingApi } from "./features/forwarding/deterministicForwardingApi";
import "./styles/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <App
        api={selectTerminalApi()}
        inventory={selectInventoryApi()}
        ssh={selectSshApi()}
        sftp={selectSftpApi()}
        aiConfig={selectAiConfigApi()}
        forwarding={selectForwardingApi()}
      />
    </AppProviders>
  </StrictMode>,
);

function selectTerminalApi() {
  if (
    import.meta.env.DEV &&
    ["deterministic-terminal", "deterministic-ssh", "prototype"].includes(
      new URLSearchParams(window.location.search).get("transport") ?? "",
    )
  ) {
    return createDeterministicTerminalApi();
  }
  return undefined;
}

function selectInventoryApi() {
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("transport") === "prototype"
  ) {
    return createPrototypeInventoryApi();
  }
  if (
    import.meta.env.DEV &&
    ["deterministic-inventory", "deterministic-ssh"].includes(
      new URLSearchParams(window.location.search).get("transport") ?? "",
    )
  ) {
    return createDeterministicInventoryApi();
  }
  return undefined;
}

function selectSshApi() {
  if (
    import.meta.env.DEV &&
    ["deterministic-ssh", "prototype"].includes(
      new URLSearchParams(window.location.search).get("transport") ?? "",
    )
  ) {
    return createDeterministicSshApi();
  }
  return undefined;
}

function selectSftpApi() {
  if (
    import.meta.env.DEV &&
    ["deterministic-sftp", "prototype"].includes(
      new URLSearchParams(window.location.search).get("transport") ?? "",
    )
  ) {
    return createDeterministicSftpApi();
  }
  return undefined;
}

function selectAiConfigApi() {
  if (
    import.meta.env.DEV &&
    ["deterministic-ai", "prototype"].includes(
      new URLSearchParams(window.location.search).get("transport") ?? "",
    )
  ) {
    return createDeterministicAiConfigApi(PROTOTYPE_AI_PROVIDERS);
  }
  return undefined;
}

function selectForwardingApi() {
  if (
    import.meta.env.DEV &&
    ["deterministic-inventory", "deterministic-ssh", "prototype"].includes(
      new URLSearchParams(window.location.search).get("transport") ?? "",
    )
  ) {
    return createDeterministicForwardingApi();
  }
  return undefined;
}
