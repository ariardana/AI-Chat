import { spawn } from "node:child_process";

const DEFAULT_HOSTNAME = "127.0.0.1";

let hasHostname = false;
const args = process.argv.slice(2).map((arg) => {
  if (arg === "--host") {
    hasHostname = true;
    return "--hostname";
  }

  if (arg.startsWith("--host=")) {
    hasHostname = true;
    return `--hostname=${arg.slice("--host=".length)}`;
  }

  if (arg === "--hostname" || arg === "-H" || arg.startsWith("--hostname=")) {
    hasHostname = true;
  }

  return arg;
});

if (!hasHostname) {
  args.push("--hostname", DEFAULT_HOSTNAME);
}

const command = process.platform === "win32" ? "next.cmd" : "next";

const child = spawn(command, ["start", ...args], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
