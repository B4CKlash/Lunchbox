import assert from "node:assert/strict";
import { test } from "node:test";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { ImportSourceError, isPublicIp, readRecipeHtml, safeFetchRecipePage, validateImportUrl, type SafeFetchDependencies } from "./safe-url-fetch";

const publicAddress = { address: "93.184.216.34", family: 4 };
const page = (content = "<html>recipe</html>") => ({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: Readable.from([content]) });

test("private, reserved, metadata, mapped, and transition addresses are denied", () => {
  for (const address of ["0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.31.255.255", "192.168.1.2", "100.64.0.1", "192.0.2.1", "198.18.0.1", "224.1.1.1", "255.255.255.255", "::", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::", "64:ff9b::127.0.0.1"])
    assert.equal(isPublicIp(address), false, address);
  assert.equal(isPublicIp(publicAddress.address), true);
  assert.equal(isPublicIp("2001:4860:4860::8888"), true);
});

test("only normal public HTTPS hostnames can reach DNS", () => {
  for (const url of ["http://example.com", "file:///etc/passwd", "https://user:pass@example.com", "https://example.com:8443/", "https://127.0.0.1", "https://2130706433", "https://[::1]", "https://localhost", "https://kitchen.local"])
    assert.throws(() => validateImportUrl(url), ImportSourceError, url);
  assert.equal(validateImportUrl("https://example.com/recipe#ingredients").href, "https://example.com/recipe");
});

test("each redirect resolves anew and connects with exactly the approved address", async () => {
  const hosts: string[] = [];
  const connections: string[] = [];
  const dependencies: SafeFetchDependencies = {
    resolve: async (host) => { hosts.push(host); return [publicAddress]; },
    connect: async (url, address) => {
      assert.deepEqual(address, publicAddress);
      connections.push(url.hostname);
      return connections.length === 1
        ? { status: 302, headers: { location: "https://recipe.example.org/final" }, body: Readable.from([]) }
        : page();
    },
  };
  const result = await safeFetchRecipePage("https://example.com/recipe", undefined, dependencies);
  assert.equal(result.url, "https://recipe.example.org/final");
  assert.deepEqual(hosts, ["example.com", "recipe.example.org"]);
  assert.deepEqual(connections, hosts);
});

test("mixed public/private DNS and redirects to private targets never connect", async () => {
  let connects = 0;
  await assert.rejects(safeFetchRecipePage("https://example.com", undefined, {
    resolve: async () => [publicAddress, { address: "127.0.0.1", family: 4 }],
    connect: async () => { connects++; return page(); },
  }), /public recipe/);
  assert.equal(connects, 0);
  let resolutions = 0;
  await assert.rejects(safeFetchRecipePage("https://example.com", undefined, {
    resolve: async () => ++resolutions === 1 ? [publicAddress] : [{ address: "169.254.169.254", family: 4 }],
    connect: async () => { connects++; return { status: 302, headers: { location: "https://metadata.example.com" }, body: Readable.from([]) }; },
  }), /public recipe/);
  assert.equal(connects, 1);
});

test("redirect count, non-HTML responses, denied pages, and cancellation are bounded", async () => {
  let connects = 0;
  await assert.rejects(safeFetchRecipePage("https://example.com", undefined, {
    resolve: async () => [publicAddress], connect: async () => {
      connects++;
      return { status: 302, headers: { location: "/again" }, body: Readable.from([]) };
    },
  }), /too many/);
  assert.equal(connects, 4);
  for (const result of [
    { status: 403, headers: {}, body: Readable.from([]) },
    { status: 200, headers: { "content-type": "application/pdf" }, body: Readable.from([]) },
  ]) await assert.rejects(safeFetchRecipePage("https://example.com", undefined, {
    resolve: async () => [publicAddress], connect: async () => result,
  }), ImportSourceError);
  await assert.rejects(safeFetchRecipePage("https://example.com", AbortSignal.abort(), {
    resolve: async () => { throw new Error("Must never resolve"); }, connect: async () => page(),
  }), /too long/);
});

test("decoded payload limit rejects compressed oversized pages as well as plain pages", async () => {
  const source = "x".repeat(2 * 1024 * 1024 + 1);
  for (const body of [
    { status: 200, headers: {}, body: Readable.from([source]) },
    { status: 200, headers: { "content-encoding": "gzip" }, body: Readable.from([gzipSync(source)]) },
  ]) await assert.rejects(readRecipeHtml(body, new AbortController().signal), /too large/);
  const compressed = { status: 200, headers: { "content-encoding": "gzip" }, body: Readable.from([gzipSync("<html>hello</html>")]) };
  assert.equal(await readRecipeHtml(compressed, new AbortController().signal), "<html>hello</html>");
});
