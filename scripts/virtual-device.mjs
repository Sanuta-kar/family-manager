#!/usr/bin/env node
// Virtual device harness for the Device Action Bridge — no phone required.
//
// Pairs (or uses a child token), polls GET /devices/commands, and returns synthetic
// canned results via POST /devices/commands/:id/result. Useful for exercising the full
// server↔device loop manually (the in-process integration test covers it for CI).
//
// Usage:
//   node scripts/virtual-device.mjs --code <PAIRING_CODE> [--base URL] [--once]
//   node scripts/virtual-device.mjs --token <CHILD_JWT>   [--base URL] [--once]
//   CHILD_TOKEN=<jwt> node scripts/virtual-device.mjs
//
// Options:
//   --base       API base URL (default http://localhost:4000/api)
//   --interval   poll interval ms (default 3000)
//   --once       poll a single time, respond to any commands, then exit

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const has = (name) => args.includes(`--${name}`);

const base = flag("base") ?? process.env.API_BASE_URL ?? "http://localhost:4000/api";
const interval = Number(flag("interval") ?? 3000);
const once = has("once");

async function claim(code) {
  const res = await fetch(`${base}/devices/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, deviceName: "virtual-device", platform: "android" })
  });
  if (!res.ok) {
    throw new Error(`claim failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.accessToken;
}

function syntheticResult(command) {
  switch (command.capabilityType) {
    case "calendar":
      return { status: "completed", payload: { events: [{ title: "Sample event", at: "14:00" }] } };
    case "app_usage":
      return { status: "completed", payload: { apps: [{ package: "com.example.app", minutes: 12 }] } };
    case "device_state":
      return { status: "completed", payload: { battery: 82, connectivity: "wifi" } };
    default:
      return { status: "failed", error: `No virtual handler for ${command.capabilityType}` };
  }
}

async function pollOnce(token) {
  const res = await fetch(`${base}/devices/commands`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error(`pull failed: ${res.status} ${await res.text()}`);
  }
  const commands = await res.json();
  if (commands.length === 0) {
    console.log("no pending commands");
    return 0;
  }
  for (const command of commands) {
    const result = syntheticResult(command);
    const post = await fetch(`${base}/devices/commands/${command.id}/result`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(result)
    });
    console.log(`command ${command.id} (${command.capabilityType}) -> ${result.status} [${post.status}]`);
  }
  return commands.length;
}

async function main() {
  const code = flag("code");
  let token = flag("token") ?? process.env.CHILD_TOKEN;
  if (!token && code) {
    token = await claim(code);
    console.log("paired; got child token");
  }
  if (!token) {
    console.error("Provide --token <jwt>, CHILD_TOKEN env, or --code <pairing-code>.");
    process.exit(1);
  }

  if (once) {
    await pollOnce(token);
    return;
  }

  console.log(`polling ${base}/devices/commands every ${interval}ms (Ctrl-C to stop)`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollOnce(token);
    } catch (error) {
      console.error(String(error));
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
