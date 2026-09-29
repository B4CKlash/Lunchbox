import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

const MAX_BYTES = 2 * 1024 * 1024;
const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedV4.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
for (const [address, prefix] of [
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const) blockedV6.addSubnet(address, prefix, "ipv6");

export class ImportSourceError extends Error {
  readonly status = 422;
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ImportSourceError";
  }
}

export function isPublicIp(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !blockedV4.check(address, "ipv4")
    : family === 6 && globalV6.check(address, "ipv6") && !blockedV6.check(address, "ipv6");
}

export function validateImportUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch {
    throw new ImportSourceError("import_url", "Enter a public HTTPS recipe link.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password ||
      url.port || isIP(hostname) || !hostname.includes(".") ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(hostname)) {
    throw new ImportSourceError("import_url", "Use a public HTTPS recipe link without a login or custom port.");
  }
  url.hash = "";
  return url;
}

type Address = { address: string; family: number };
type Page = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Readable;
};
export type SafeFetchDependencies = {
  resolve: (hostname: string) => Promise<Address[]>;
  connect: (url: URL, address: Address, signal: AbortSignal) => Promise<Page>;
};

const connect: SafeFetchDependencies["connect"] = (url, address, signal) =>
  new Promise((resolve, reject) => {
    const req = request(url, {
      signal,
      // Pin the already-validated address. TLS still verifies the URL hostname.
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      family: address.family,
      agent: false,
      headers: {
        Accept: "text/html, application/xhtml+xml",
        "Accept-Encoding": "gzip, deflate, br",
        "User-Agent": "LunchBox-Recipe-Import/1.0",
      },
    }, (response) => resolve({
      status: response.statusCode ?? 0,
      headers: response.headers,
      body: response,
    }));
    req.once("error", reject);
    req.end();
  });

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function header(page: Page, name: string): string {
  const value = page.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function readRecipeHtml(page: Page, signal: AbortSignal): Promise<string> {
  const tooLarge = () => new ImportSourceError("import_size", "This page is too large to import. Paste the recipe text instead.");
  let encoded = 0;
  const bounded = Readable.from((async function* () {
    for await (const chunk of page.body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      encoded += buffer.length;
      if (encoded > MAX_BYTES) throw tooLarge();
      yield buffer;
    }
  })());
  const encoding = header(page, "content-encoding").toLowerCase();
  const decoder = encoding === "gzip" ? createGunzip()
    : encoding === "deflate" ? createInflate()
      : encoding === "br" ? createBrotliDecompress() : null;
  if (encoding && encoding !== "identity" && !decoder) {
    page.body.destroy();
    bounded.destroy();
    throw new ImportSourceError("import_encoding", "This page format cannot be imported. Paste the recipe text instead.");
  }
  const stream = decoder ? bounded.pipe(decoder) : bounded;
  if (decoder) bounded.on("error", (error) => decoder.destroy(error));
  const abort = () => { page.body.destroy(); stream.destroy(signal.reason); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const chunks: Buffer[] = [];
    let decoded = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      decoded += buffer.length;
      if (decoded > MAX_BYTES) throw tooLarge();
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    signal.removeEventListener("abort", abort);
    page.body.destroy();
    bounded.destroy();
    stream.destroy();
  }
}

/** No page scripts, cookies, credentials or embedded resources are retrieved. */
export async function safeFetchRecipePage(
  value: string,
  signal?: AbortSignal,
  dependencies: SafeFetchDependencies = {
    resolve: (hostname) => lookup(hostname, { all: true, verbatim: true }),
    connect,
  },
): Promise<{ html: string; url: string }> {
  const timeout = AbortSignal.timeout(10_000);
  const deadline = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let url = validateImportUrl(value);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      deadline.throwIfAborted();
      const addresses = await abortable(dependencies.resolve(url.hostname), deadline);
      if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address)))
        throw new ImportSourceError("import_url", "This link does not resolve to a public recipe website.");
      const page = await abortable(dependencies.connect(url, addresses[0], deadline), deadline);
      if ([301, 302, 303, 307, 308].includes(page.status)) {
        page.body.destroy();
        if (redirects === 3 || !header(page, "location"))
          throw new ImportSourceError("import_redirect", "This page redirects too many times. Paste the recipe text instead.");
        url = validateImportUrl(new URL(header(page, "location"), url).href);
        continue;
      }
      if (page.status < 200 || page.status >= 300) {
        page.body.destroy();
        throw new ImportSourceError("import_unavailable", "This recipe page is unavailable or requires access. Paste recipe text you can access instead.");
      }
      if (!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(header(page, "content-type"))) {
        page.body.destroy();
        throw new ImportSourceError("import_format", "Use a recipe webpage, or paste its recipe text instead.");
      }
      return { html: await readRecipeHtml(page, deadline), url: url.href };
    }
    throw new Error("Unreachable redirect limit");
  } catch (error) {
    if (error instanceof ImportSourceError) throw error;
    throw new ImportSourceError(
      deadline.aborted ? "import_timeout" : "import_unavailable",
      deadline.aborted ? "The recipe page took too long. Try again or paste the recipe text."
        : "This recipe page could not be read. Paste the recipe text instead.",
    );
  }
}
