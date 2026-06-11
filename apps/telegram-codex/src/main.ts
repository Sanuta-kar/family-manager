import { execFile, spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: {
    id: number;
    type: string;
  };
  from?: {
    id: number;
    username?: string;
    first_name?: string;
  };
};

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type ActiveRun = {
  chatId: number;
  startedAt: Date;
  child: ChildProcess;
  promptPreview: string;
  resumeSessionId: string | null;
};

type WorktreeSummary = {
  clean: boolean;
  changedCount: number;
  preview: string[];
};

type SessionStore = Record<string, string>;

type CodexJsonEvent =
  | {
      type: "thread.started";
      thread_id: string;
    }
  | {
      type: "item.completed";
      item?: {
        type?: string;
        text?: string;
      };
    }
  | {
      type: string;
      [key: string]: unknown;
    };

const envFile = findEnvFile(process.cwd());
const repoRoot = envFile ? dirname(envFile) : process.cwd();

try {
  if (envFile) {
    loadEnvFile(envFile);
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const config = {
  telegramToken: readRequiredEnv("TELEGRAM_BOT_TOKEN"),
  allowedChatIds: parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS),
  codexBin: process.env.CODEX_BIN ?? "codex",
  codexWorkdir: process.env.CODEX_WORKDIR ?? process.cwd(),
  codexSandbox: process.env.CODEX_SANDBOX ?? "workspace-write",
  codexApprovalPolicy: process.env.CODEX_APPROVAL_POLICY ?? "never",
  codexExtraArgs: splitArgs(process.env.CODEX_EXTRA_ARGS ?? ""),
  maxPromptChars: Number(process.env.TELEGRAM_CODEX_MAX_PROMPT_CHARS ?? 6000),
  runTimeoutMs: Number(process.env.TELEGRAM_CODEX_RUN_TIMEOUT_MS ?? 20 * 60 * 1000),
  pollTimeoutSeconds: Number(process.env.TELEGRAM_CODEX_POLL_TIMEOUT_SECONDS ?? 30),
  lockFile: process.env.TELEGRAM_CODEX_LOCK_FILE ?? "/tmp/family-manager-telegram-codex.lock",
  sessionFile: process.env.TELEGRAM_CODEX_SESSION_FILE ?? join(repoRoot, ".telegram-codex-sessions.json"),
};

const execFileAsync = promisify(execFile);
let activeRun: ActiveRun | null = null;
let nextOffset = 0;
let lockAcquired = false;
let sessions: SessionStore = loadSessions();

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", releaseLock);

void main();

async function main() {
  acquireLock();

  console.log(
    `Telegram Codex bridge polling for ${config.allowedChatIds.size} allowed chat(s), workdir=${config.codexWorkdir}`,
  );

  while (true) {
    try {
      const updates = await telegramApi<TelegramUpdate[]>("getUpdates", {
        offset: nextOffset,
        timeout: config.pollTimeoutSeconds,
        allowed_updates: ["message"],
      });

      for (const update of updates) {
        nextOffset = Math.max(nextOffset, update.update_id + 1);
        await handleUpdate(update);
      }
    } catch (error) {
      console.error("Telegram polling failed:", error);
      await delay(5000);
    }
  }
}

async function handleUpdate(update: TelegramUpdate) {
  const message = update.message;
  const text = message?.text?.trim();
  if (!message || !text) {
    return;
  }

  const chatId = message.chat.id;
  if (!config.allowedChatIds.has(chatId)) {
    console.warn(`Rejected Telegram message from unauthorized chat ${chatId}`);
    await sendMessage(chatId, `Unauthorized chat id: ${chatId}`);
    return;
  }

  if (text === "/start" || text === "/help") {
    await sendMessage(
      chatId,
      [
        "Send a prompt and I will run it with codex exec on this host.",
        "",
        "Commands:",
        "/status - show whether Codex is running",
        "/cancel - stop the current Codex run",
        "/new - start a new Codex session for this Telegram chat",
        "",
        "When a run ends, I will send the final answer plus run status automatically.",
      ].join("\n"),
    );
    return;
  }

  if (text === "/status") {
    await sendMessage(chatId, activeRun ? formatActiveRun(activeRun) : formatIdleStatus(chatId));
    return;
  }

  if (text === "/cancel") {
    if (!activeRun) {
      await sendMessage(chatId, "No Codex run is active.");
      return;
    }

    const run = activeRun;
    activeRun = null;
    run.child.kill("SIGTERM");
    await sendMessage(chatId, "Cancel signal sent to Codex.");
    return;
  }

  if (text === "/new" || text.startsWith("/new ")) {
    if (activeRun) {
      await sendMessage(chatId, `Codex is already running. Use /cancel first if you want to stop it.\n\n${formatActiveRun(activeRun)}`);
      return;
    }

    delete sessions[String(chatId)];
    saveSessions();

    const nextPrompt = text.slice("/new".length).trim();
    if (!nextPrompt) {
      await sendMessage(chatId, "Started a new Codex session. Send the next message to begin it.");
      return;
    }

    if (nextPrompt.length > config.maxPromptChars) {
      await sendMessage(chatId, `Prompt is too long. Limit: ${config.maxPromptChars} characters.`);
      return;
    }

    await runCodex(chatId, nextPrompt);
    return;
  }

  if (activeRun) {
    await sendMessage(chatId, `Codex is already running.\n\n${formatActiveRun(activeRun)}`);
    return;
  }

  if (text.length > config.maxPromptChars) {
    await sendMessage(chatId, `Prompt is too long. Limit: ${config.maxPromptChars} characters.`);
    return;
  }

  await runCodex(chatId, text);
}

async function runCodex(chatId: number, prompt: string) {
  const resumeSessionId = sessions[String(chatId)] ?? null;
  const startedAt = new Date();
  const globalCodexArgs = [
    "--cd",
    config.codexWorkdir,
    "--sandbox",
    config.codexSandbox,
    "--ask-for-approval",
    config.codexApprovalPolicy,
  ];
  const args = resumeSessionId
    ? [...globalCodexArgs, "exec", "resume", "--json", ...config.codexExtraArgs, resumeSessionId, prompt]
    : [
        ...globalCodexArgs,
        "exec",
        "--json",
        ...config.codexExtraArgs,
        prompt,
      ];

  const child = spawn(config.codexBin, args, {
    cwd: config.codexWorkdir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  activeRun = { chatId, startedAt, child, promptPreview: preview(prompt), resumeSessionId };
  console.log(
    `Codex ${resumeSessionId ? "resumed" : "started"} for chat ${chatId}, pid=${child.pid ?? "unknown"}, session=${resumeSessionId ?? "new"}, prompt="${preview(prompt)}"`,
  );
  await sendMessage(chatId, resumeSessionId ? `Codex resumed session ${resumeSessionId}.` : "Codex started a new session.");

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let threadId = resumeSessionId;
  let lastAgentMessage = "";

  const timeout = setTimeout(() => {
    timedOut = true;
    console.warn(`Codex timed out for chat ${chatId}, pid=${child.pid ?? "unknown"}`);
    child.kill("SIGTERM");
  }, config.runTimeoutMs);

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");

    for (const event of parseJsonlEvents(stdout)) {
      const startedThreadId = getStartedThreadId(event);
      if (startedThreadId) {
        threadId = startedThreadId;
      }

      const agentMessage = getCompletedAgentMessage(event);
      if (agentMessage) {
        lastAgentMessage = agentMessage;
      }
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr = tail(stderr + chunk.toString("utf8"), 8000);
    console.error(chunk.toString("utf8").trimEnd());
  });

  child.on("error", async (error) => {
    clearTimeout(timeout);
    activeRun = null;
    console.error(`Codex failed to start for chat ${chatId}:`, error);
    await sendMessage(chatId, `Failed to start Codex: ${error.message}`);
  });

  child.on("close", async (code, signal) => {
    clearTimeout(timeout);
    activeRun = null;
    console.log(`Codex finished for chat ${chatId}, pid=${child.pid ?? "unknown"}, code=${code}, signal=${signal}`);

    if (code === 0 && threadId) {
      sessions[String(chatId)] = threadId;
      saveSessions();
      console.log(`Stored Codex session for chat ${chatId}: ${threadId}`);
    }

    const worktree = await readWorktreeSummary();
    const finalMessage = formatCodexResult({
      code,
      signal,
      stdout,
      stderr,
      timedOut,
      lastAgentMessage,
      threadId,
      resumed: Boolean(resumeSessionId),
      durationMs: Date.now() - startedAt.getTime(),
      worktree,
    });

    await sendLongMessage(chatId, finalMessage);
  });
}

function formatCodexResult(input: {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  lastAgentMessage: string;
  threadId: string | null;
  resumed: boolean;
  durationMs: number;
  worktree: WorktreeSummary;
}) {
  const status = input.timedOut
    ? "Codex timed out."
    : input.code === 0
      ? `Codex completed. Session: ${input.threadId ?? "unknown"}.`
      : `Codex exited with code ${input.code ?? "unknown"}${input.signal ? ` (${input.signal})` : ""}.`;

  const statusBlock = formatFinalStatus({
    code: input.code,
    signal: input.signal,
    timedOut: input.timedOut,
    durationMs: input.durationMs,
    threadId: input.threadId,
    resumed: input.resumed,
    worktree: input.worktree,
  });

  const output = input.lastAgentMessage.trim();
  if (output) {
    return `${status}\n\n${output}\n\n${statusBlock}`;
  }

  const stderr = input.stderr.trim();
  if (stderr) {
    return `${status}\n\nNo final stdout was returned. Recent stderr:\n${stderr}\n\n${statusBlock}`;
  }

  return `${status}\n\nNo output was returned.\n\n${statusBlock}`;
}

function formatFinalStatus(input: {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  threadId: string | null;
  resumed: boolean;
  worktree: WorktreeSummary;
}) {
  const exitState = input.timedOut
    ? "timed out"
    : input.code === 0
      ? "completed"
      : `failed: ${input.code ?? "unknown"}${input.signal ? ` (${input.signal})` : ""}`;
  const worktree = input.worktree.clean
    ? "clean"
    : `${input.worktree.changedCount} changed file(s)${input.worktree.preview.length ? `\n${input.worktree.preview.join("\n")}` : ""}`;

  return [
    "Final status:",
    `- State: ${exitState}`,
    `- Duration: ${formatDuration(input.durationMs)}`,
    `- Session: ${input.threadId ?? "unknown"}${input.resumed ? " (resumed)" : ""}`,
    `- Worktree: ${worktree}`,
  ].join("\n");
}

function formatActiveRun(run: ActiveRun) {
  const seconds = Math.floor((Date.now() - run.startedAt.getTime()) / 1000);
  return [
    `Codex is running for chat ${run.chatId}.`,
    `PID: ${run.child.pid ?? "unknown"}.`,
    `Elapsed: ${seconds}s.`,
    `Session: ${run.resumeSessionId ?? "new"}.`,
    `Prompt: ${run.promptPreview}`,
  ].join("\n");
}

function formatIdleStatus(chatId: number) {
  const sessionId = sessions[String(chatId)];
  return sessionId ? `Idle.\nCurrent session: ${sessionId}` : "Idle.\nCurrent session: none. The next prompt will start a new session.";
}

async function readWorktreeSummary(): Promise<WorktreeSummary> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], {
      cwd: config.codexWorkdir,
      timeout: 5000,
      maxBuffer: 64 * 1024,
    });
    const lines = stdout.trim().split("\n").map((line) => line.trimEnd()).filter(Boolean);
    return {
      clean: lines.length === 0,
      changedCount: lines.length,
      preview: lines.slice(0, 12),
    };
  } catch (error) {
    return {
      clean: false,
      changedCount: 0,
      preview: [`unavailable: ${(error as Error).message}`],
    };
  }
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

async function sendMessage(chatId: number, text: string) {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

async function sendLongMessage(chatId: number, text: string) {
  const maxTelegramMessageLength = 3900;
  for (let index = 0; index < text.length; index += maxTelegramMessageLength) {
    await sendMessage(chatId, text.slice(index, index + maxTelegramMessageLength));
  }
}

async function telegramApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as TelegramResponse<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `Telegram API ${method} failed with HTTP ${response.status}`);
  }

  return payload.result as T;
}

function parseAllowedChatIds(value: string | undefined) {
  const ids = new Set<number>();
  for (const item of (value ?? "").split(",")) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }

    const id = Number(trimmed);
    if (!Number.isSafeInteger(id)) {
      throw new Error(`Invalid TELEGRAM_ALLOWED_CHAT_IDS value: ${trimmed}`);
    }

    ids.add(id);
  }

  if (ids.size === 0) {
    throw new Error("TELEGRAM_ALLOWED_CHAT_IDS must contain at least one chat id.");
  }

  return ids;
}

function splitArgs(value: string) {
  return value.split(" ").map((item) => item.trim()).filter(Boolean);
}

function readRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function findEnvFile(startDir: string) {
  let currentDir = startDir;

  while (true) {
    const envFile = join(currentDir, ".env");
    if (existsSync(envFile)) {
      return envFile;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function loadSessions(): SessionStore {
  if (!existsSync(config.sessionFile)) {
    return {};
  }

  const parsed = JSON.parse(readFileSync(config.sessionFile, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const store: SessionStore = {};
  for (const [chatId, sessionId] of Object.entries(parsed)) {
    if (typeof sessionId === "string") {
      store[chatId] = sessionId;
    }
  }

  return store;
}

function saveSessions() {
  mkdirSync(dirname(config.sessionFile), { recursive: true });
  writeFileSync(config.sessionFile, `${JSON.stringify(sessions, null, 2)}\n`, { encoding: "utf8" });
}

function parseJsonlEvents(value: string) {
  const events: CodexJsonEvent[] = [];
  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      events.push(JSON.parse(trimmed) as CodexJsonEvent);
    } catch {
      // Ignore partial JSONL chunks while the child process is still streaming.
    }
  }

  return events;
}

function getStartedThreadId(event: CodexJsonEvent) {
  if (event.type !== "thread.started") {
    return null;
  }

  return typeof event.thread_id === "string" ? event.thread_id : null;
}

function getCompletedAgentMessage(event: CodexJsonEvent) {
  if (event.type !== "item.completed" || !("item" in event)) {
    return null;
  }

  const item = event.item;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const type = "type" in item ? item.type : null;
  const text = "text" in item ? item.text : null;
  return type === "agent_message" && typeof text === "string" ? text : null;
}

function tail(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}

function preview(value: string) {
  return value.length <= 120 ? value : `${value.slice(0, 117)}...`;
}

function acquireLock() {
  const existingPid = readExistingLockPid();
  if (existingPid && isProcessRunning(existingPid)) {
    throw new Error(
      `Another Telegram Codex bridge is already running with PID ${existingPid}. Stop it before starting a new instance.`,
    );
  }

  if (existingPid) {
    releaseLock();
  }

  const fd = openSync(config.lockFile, "wx");
  closeSync(fd);
  writeFileSync(config.lockFile, `${process.pid}\n`, { encoding: "utf8" });
  lockAcquired = true;
}

function readExistingLockPid() {
  if (!existsSync(config.lockFile)) {
    return null;
  }

  const value = readFileSync(config.lockFile, "utf8").trim();
  const pid = Number(value);
  return Number.isSafeInteger(pid) ? pid : null;
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  if (!lockAcquired && !existsSync(config.lockFile)) {
    return;
  }

  try {
    const existingPid = readExistingLockPid();
    if (!existingPid || existingPid === process.pid) {
      unlinkSync(config.lockFile);
    }
  } catch {
    // Ignore lock cleanup errors during shutdown.
  } finally {
    lockAcquired = false;
  }
}

function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down.`);
  activeRun?.child.kill("SIGTERM");
  releaseLock();
  process.exit(0);
}
