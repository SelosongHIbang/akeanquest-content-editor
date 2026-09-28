import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const CONTENT_PATH = "src/data";
const DEBOUNCE_MS = 3000;
const POLL_MS = 1000;

let timer = null;
let running = false;
let queued = false;

async function git(args) {
  const { stdout, stderr } = await exec("git", args, { windowsHide: true });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function hasContentChanges() {
  const { stdout } = await git([
    "status",
    "--porcelain",
    "--",
    `${CONTENT_PATH}/*.json`,
  ]);
  return stdout.length > 0;
}

async function syncContent() {
  if (running) {
    queued = true;
    return;
  }

  running = true;
  try {
    if (!(await hasContentChanges())) return;

    // --only ensures unrelated staged source-code changes are not included.
    await git(["add", "-u", "--", CONTENT_PATH]);
    const status = await git(["status", "--porcelain", "--", CONTENT_PATH]);
    if (!status.stdout) return;

    await git([
      "commit",
      "--only",
      "-m",
      "content: autosave JSON",
      "--",
      `${CONTENT_PATH}/*.json`,
    ]);

    console.log("[AkeanQuest] Content committed. Pushing...");
    await git(["push"]);
    console.log("[AkeanQuest] Content pushed.");
  } catch (error) {
    console.error("[AkeanQuest] Content sync failed:", error?.message ?? error);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      scheduleSync();
    }
  }
}

function scheduleSync() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncContent();
  }, DEBOUNCE_MS);
}

let lastSnapshot = "";
async function poll() {
  try {
    const { stdout } = await git([
      "status",
      "--porcelain",
      "--",
      CONTENT_PATH,
    ]);
    if (stdout !== lastSnapshot) {
      lastSnapshot = stdout;
      if (stdout) scheduleSync();
    }
  } catch (error) {
    console.error("[AkeanQuest] Git status failed:", error?.message ?? error);
  }
}

console.log("[AkeanQuest] Watching src/data/*.json for changes.");
console.log("[AkeanQuest] Changes are committed after 3s idle, then pushed.");
console.log("[AkeanQuest] Stop with Ctrl+C.");

setInterval(() => void poll(), POLL_MS);
void poll();
