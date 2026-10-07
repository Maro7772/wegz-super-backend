import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";

/**
 * Re-inject the API URL into the client's frontend bundles.
 * (Replacement for full rebuild — because we don't have the source there).
 */
export async function rebuildFrontendForClient(
  subdomain: string,
  backendUrl: string,
) {
  const frontendDir = path.join(env.PLESK_VHOSTS_DIR, subdomain);
  await injectApiUrlIntoBundle(frontendDir, backendUrl);
  console.log(`[Rebuild] Frontend URLs re-injected for ${subdomain}`);
}

async function injectApiUrlIntoBundle(dir: string, newApiUrl: string) {
  const oldUrl = "https://back.wego.org";

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (
        e.isFile() &&
        (e.name.endsWith(".js") ||
          e.name.endsWith(".html") ||
          e.name.endsWith(".json"))
      ) {
        try {
          let content = await fs.readFile(full, "utf8");
          if (content.toLowerCase().includes(oldUrl.toLowerCase())) {
            const regex = new RegExp(
              oldUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              "gi",
            );
            content = content.replace(regex, newApiUrl);
            await fs.writeFile(full, content, "utf8");
            console.log(`[Rebuild] Injected API URL into ${e.name}`);
          }
        } catch (err: any) {
          console.warn(`[Rebuild] Skipping ${e.name}: ${err.message}`);
        }
      }
    }
  }

  try {
    await fs.access(dir);
  } catch {
    throw new Error(`Frontend directory not found: ${dir}`);
  }

  await walk(dir);
}
