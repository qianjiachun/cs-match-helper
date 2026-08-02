import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function toKebab(id) {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

const compositionId = process.argv[2] || "CounterStrafingDemo";
const outFile = path.join("out", `${toKebab(compositionId)}.mp4`);

console.log(`Rendering ${compositionId} → ${outFile}`);

const result = spawnSync(
  "npx",
  ["remotion", "render", compositionId, outFile],
  {
    cwd: root,
    stdio: "inherit",
    shell: true,
  },
);

process.exit(result.status ?? 1);
