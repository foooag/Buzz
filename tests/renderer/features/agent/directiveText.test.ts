import { describe, expect, it } from "vitest";
import {
  expandTargets,
  findReferencedHostIds,
  parseDirectives,
} from "@/features/agent/directiveText";

describe("renderer directive text", () => {
  it("parses host and group directives", () => {
    expect(parseDirectives(
      "把 :host[db-primary]{name=h1} 的容器跑到 :group[prod]{name=g1}",
    )).toEqual([
      { type: "host", id: "h1", label: "db-primary" },
      { type: "group", id: "g1", label: "prod" },
    ]);
  });

  it("resolves friendly @ mentions through the inventory resolver", () => {
    const resolveMention = (label: string) =>
      label === "db-primary"
        ? { type: "host" as const, id: "h1" }
        : label === "prod"
          ? { type: "group" as const, id: "g1" }
          : undefined;
    expect(parseDirectives(
      "把 @db-primary 的容器跑到 @prod",
      resolveMention,
    )).toEqual([
      { type: "host", id: "h1", label: "db-primary" },
      { type: "group", id: "g1", label: "prod" },
    ]);
  });

  it("parses linked mentions carrying an internal id", () => {
    expect(parseDirectives(
      "检查 [web-prod-01](host-uuid) 的容器",
      (label) =>
      label === "web-prod-01"
        ? { type: "host", id: "host-uuid" }
        : undefined,
    )).toEqual([
      { type: "host", id: "host-uuid", label: "web-prod-01" },
    ]);
  });

  it("expands groups and preserves order", () => {
    expect(expandTargets(
      [
        { type: "host", id: "a", label: "A" },
        { type: "group", id: "g", label: "G" },
      ],
      { g: ["a", "b"] },
    )).toEqual(["a", "b"]);
  });

  it("finds inventory hosts referenced by address, name, or id", () => {
    const hosts = [
      { id: "h1", name: "web-prod-01", address: "10.11.70.52" },
      { id: "h2", name: "db-prod-01", address: "db.internal" },
    ];

    expect(findReferencedHostIds(
      "检查 10.11.70.52 和 db-prod-01 的容器",
      hosts,
    )).toEqual(["h1", "h2"]);
    expect(findReferencedHostIds("检查 h2 的容器", hosts)).toEqual(["h2"]);
  });

  it("does not infer partial or ambiguous host references", () => {
    const hosts = [
      { id: "h1", name: "web", address: "10.11.70.52" },
      { id: "h2", name: "web", address: "10.11.70.53" },
    ];

    expect(findReferencedHostIds("检查 web 的容器", hosts)).toEqual([]);
    expect(findReferencedHostIds("检查 110.11.70.520 的容器", hosts)).toEqual([]);
  });
});
