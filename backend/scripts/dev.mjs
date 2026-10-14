import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tscPath = fileURLToPath(
  new URL("../node_modules/typescript/bin/tsc", import.meta.url),
);

const initialBuild = spawnSync(
  process.execPath,
  [tscPath, "-p", "tsconfig.build.json"],
  { stdio: "inherit" },
);

if (initialBuild.status !== 0) {
  process.exit(initialBuild.status ?? 1);
}

const compiler = spawn(
  process.execPath,
  [tscPath, "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"],
  { stdio: "inherit" },
);
const server = spawn(process.execPath, ["--watch", "dist/server.js"], {
  stdio: "inherit",
});

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) {
    return;
  }

  stopping = true;
  compiler.kill();
  server.kill();
  process.exitCode = exitCode;
}

compiler.on("exit", (code) => stop(code ?? 1));
server.on("exit", (code) => stop(code ?? 1));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

