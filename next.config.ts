import type { NextConfig } from "next";
import { readFileSync, realpathSync } from "fs";
import { dirname, join, sep } from "path";
import { fileURLToPath } from "url";

const configDir = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(configDir, "package.json"), "utf8")) as { version: string };
let piVersion = "unknown";
try {
  const piPkgPath = join(configDir, "node_modules/@earendil-works/pi-coding-agent/package.json");
  piVersion = (JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }).version;
} catch { /* package not found, use default */ }

// mdast-util-gfm-autolink-literal (remark-gfm) ships a RegExp lookbehind that
// Safari parses only from 16.4, which blanked `/` on iOS 16.2 (#753). The loader
// swaps it for an equivalent built at runtime; both bundlers must run it.
const gfmAutolinkEmailLoader = join(configDir, "lib/gfm-autolink-email-loader.cjs");

// rg-worktree shares the base tree's node_modules into a worktree via a
// symlink (routing.json shareNodeModules). Turbopack resolves modules only
 inside the filesystem root, so a worktree whose node_modules points outside
// its own tree panics at startup ("Symlink [project]/node_modules is invalid").
// When that happens, widen turbopack.root to the common ancestor of the
// worktree and the shared node_modules (Next docs › turbopack › Root
// directory). Trees with their own node_modules keep the default root.
function turbopackRootForSharedNodeModules(): string | undefined {
  let shared: string;
  try {
    shared = realpathSync(join(configDir, "node_modules"));
  } catch {
    return undefined;
  }
  const project = configDir.endsWith(sep) ? configDir.slice(0, -1) : configDir;
  if (shared === project || shared.startsWith(project + sep)) return undefined;
  const a = project.split(sep);
  const b = shared.split(sep);
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  return common > 1 ? a.slice(0, common).join(sep) : undefined;
}
const sharedNodeModulesRoot = turbopackRootForSharedNodeModules();

const nextConfig: NextConfig = {
  // Deployable standalone server (Docker role split, enc-29d7943d): the web
  // image and the host runner both consume .next/standalone (the api image is a
  // plain Node proxy). Host dev builds opt out with PI_WEB_BUILD_STANDALONE=0
  // to keep the classic `next start` flow; images leave it unset (standalone on).
  ...(process.env.PI_WEB_BUILD_STANDALONE === "0" ? {} : { output: "standalone" as const }),
  // Must equal turbopack.root when that is widened for a shared node_modules
  // (Next warns and Turbopack keeps the project root otherwise).
  outputFileTracingRoot: sharedNodeModulesRoot ?? configDir,
  experimental: {
    // proxy.ts matches /api/:path*, and Next buffers the request body whenever
    // a proxy is present, capped at 10 MB by default. The upload route accepts
    // up to 100 MB per request, so raise the buffer above that or large uploads
    // are truncated and fail with "Failed to parse body as FormData."
    proxyClientMaxBodySize: "128mb",
  },
  // next/image is only used for the static logo, so the /_next/image optimizer
  // (and its sharp/libheif attack surface, see GHSA-2xp9-vwfh-vxw4) is not needed.
  images: { unoptimized: true },
  // `next dev` runs Turbopack and `npm run build` runs webpack.
  turbopack: {
    ...(sharedNodeModulesRoot ? { root: sharedNodeModulesRoot } : {}),
    rules: {
      "**/mdast-util-gfm-autolink-literal/lib/index.js": { loaders: [gfmAutolinkEmailLoader] },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /[\\/]mdast-util-gfm-autolink-literal[\\/]lib[\\/]index\.js$/,
      loader: gfmAutolinkEmailLoader,
    });
    return config;
  },
  // Node modules keep the syntax they ship unless listed here, and mermaid's
  // lazy diagram chunks are full of class `static {}` blocks (#753).
  transpilePackages: ["mermaid", "@mermaid-js/parser"],
  serverExternalPackages: [
    "node-pty",
    "undici",
    "web-push",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
  ],
  // Next 16 blocks cross-origin access to dev resources by default. Allow the
  // loopback and the RFC1918 LAN ranges so the dev server stays reachable
  // from other machines on the same LAN.
  allowedDevOrigins: [
    "127.0.0.1",
    "10.*.*.*",
    // 172.16.0.0/12
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
    "192.168.*.*",
  ],
  async headers() {
    return [
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
