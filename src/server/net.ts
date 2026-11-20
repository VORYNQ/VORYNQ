import "server-only";
// Outbound HTTP for tools that reach URLs chosen by a model or an agent owner.
// Only public internet addresses are allowed: the check runs on every DNS answer at connect time,
// so a hostname cannot pass the check and then resolve to an internal address (DNS rebinding).
import { lookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  // No ::ffff:0:0/96 here: BlockList would then match every IPv4 address. Mapped addresses are unwrapped below.
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(net, prefix, "ipv6");

function isPublicAddress(address: string): boolean {
  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1) is judged as the IPv4 address it carries.
  const mapped = /^::ffff:(?:0:)?(.+)$/i.exec(address)?.[1];
  if (mapped) {
    if (isIP(mapped) === 4) return isPublicAddress(mapped);
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(mapped);
    if (!hex) return false;
    const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
    return isPublicAddress([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
  }
  const family = isIP(address);
  return family !== 0 && !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

// Drop-in for dns.lookup that refuses non-public answers.
const publicLookup = ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
  lookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err);
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} resolves to a private or reserved address`), { code: "EBLOCKED" }));
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}) as unknown as typeof lookup;

/** Throws unless the URL is http(s) on a default port, without credentials, and not a private IP literal. */
export function checkPublicUrl(raw: string, { httpsOnly = false } = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Not a valid URL");
  }
  if (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) throw new Error(httpsOnly ? "The URL must start with https://" : "Only http and https URLs are allowed");
  if (url.username || url.password) throw new Error("URLs with a username or password are not allowed");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Only the standard ports 80 and 443 are allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new Error("Local addresses are not allowed");
  // IP literals skip DNS, so check them here.
  if (isIP(host) && !isPublicAddress(host)) throw new Error("Private or reserved IP addresses are not allowed");
  return url;
}

export type SafeResponse = { status: number; url: string; contentType: string; body: Buffer; truncated: boolean };

type Options = { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; maxBytes: number; timeoutMs: number; maxRedirects?: number; httpsOnly?: boolean };

function requestOnce(url: URL, o: Options, deadline: number): Promise<SafeResponse & { location?: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, { method: o.method ?? "GET", headers: o.headers, lookup: publicLookup, timeout: Math.max(1, deadline - Date.now()) }, (res) => {
      const status = res.statusCode ?? 0;
      const location = status >= 300 && status < 400 ? res.headers.location : undefined;
      if (location) {
        res.resume();
        return resolve({ status, url: url.href, contentType: "", body: Buffer.alloc(0), truncated: false, location });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      res.on("data", (chunk: Buffer) => {
        if (truncated) return;
        const room = o.maxBytes - size;
        if (chunk.length >= room) {
          chunks.push(chunk.subarray(0, room));
          size = o.maxBytes;
          truncated = true;
          res.destroy();
          finish();
        } else {
          chunks.push(chunk);
          size += chunk.length;
        }
      });
      const finish = () => resolve({ status, url: url.href, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks), truncated });
      res.on("end", finish);
      res.on("error", (err) => (truncated ? finish() : reject(err)));
    });
    // Overall deadline (the socket timeout above only covers idle gaps, not a slow trickle).
    const timer = setTimeout(() => req.destroy(new Error("The request timed out")), Math.max(1, deadline - Date.now()));
    req.on("close", () => clearTimeout(timer));
    req.on("timeout", () => req.destroy(new Error("The request timed out")));
    req.on("error", (err: NodeJS.ErrnoException) => reject(err.code === "EBLOCKED" ? new Error(err.message) : err));
    if (o.body !== undefined) req.write(o.body);
    req.end();
  });
}

/** Sends a request to a public URL, re-checking every redirect hop, with size and time limits. */
export async function safeRequest(raw: string, o: Options): Promise<SafeResponse> {
  const deadline = Date.now() + o.timeoutMs;
  let url = checkPublicUrl(raw, { httpsOnly: o.httpsOnly });
  for (let hop = 0; ; hop++) {
    const res = await requestOnce(url, o, deadline);
    if (!res.location) return res;
    if (!o.maxRedirects) throw new Error(`The URL answered with a redirect (${res.status}); redirects are not followed`);
    if (hop >= o.maxRedirects) throw new Error("Too many redirects");
    url = checkPublicUrl(new URL(res.location, url).href, { httpsOnly: o.httpsOnly });
  }
}
