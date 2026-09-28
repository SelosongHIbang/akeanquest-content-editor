import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";

const vite = spawn(npmCommand, ["exec", "--", "vite", "--host"], {
  stdio: "inherit",
  windowsHide: false,
});

const syncProcess = spawn(process.execPath, ["scripts/auto-push-content.mjs"], {
  stdio: "inherit",
  windowsHide: false,
});

function shutdown(code = 0) {
  if (!vite.killed) vite.kill();
  if (!syncProcess.killed) syncProcess.kill();
  process.exit(code);
}

vite.on("exit", (code) => shutdown(code ?? 0));
syncProcess.on("exit", (code) => {
  if (code && code !== 0) shutdown(code);
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
