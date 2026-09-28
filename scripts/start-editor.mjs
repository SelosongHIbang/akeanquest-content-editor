import { spawn } from "node:child_process";
import { resolve } from "node:path";

const viteEntry = resolve("node_modules/vite/bin/vite.js");

const vite = spawn(process.execPath, [viteEntry, "--host"], {
  stdio: "inherit",
});

const syncProcess = spawn(process.execPath, ["scripts/auto-push-content.mjs"], {
  stdio: "inherit",
});

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (!vite.killed) vite.kill();
  if (!syncProcess.killed) syncProcess.kill();

  process.exit(code);
}

vite.on("error", (error) => {
  console.error("[AkeanQuest] Vite failed to start:", error);
  shutdown(1);
});

syncProcess.on("error", (error) => {
  console.error("[AkeanQuest] Content sync failed to start:", error);
  shutdown(1);
});

vite.on("exit", (code) => shutdown(code ?? 0));

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
