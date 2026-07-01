#!/usr/bin/env node
"use strict";
/**
 * norm-setup — one-time onboarding via a NATIVE OS dialog. Collects the Bland
 * API key without it ever touching the chat composer, the model context, or a
 * command argument, then stores it in the documented userConfig location:
 *
 *   ~/.claude/settings.json → pluginConfigs["norm@bland"].options.bland_api_key
 *
 * (respects CLAUDE_CONFIG_DIR; atomic tmp+rename write; file mode 0600). The
 * `${user_config.bland_api_key}` substitution in the plugin's .mcp.json resolves
 * from there at the next session start — Desktop and CLI share this storage.
 *
 *   node norm-setup.cjs                      → native password dialog
 *   node norm-setup.cjs --url <https-url>    → also set bland_api_url
 *   node norm-setup.cjs --stdin              → read key from stdin (CI / no GUI)
 *   node norm-setup.cjs --verify             → after storing, check auth against
 *                                              the server's /v1/mcp (reports only
 *                                              auth_ok/status, never the key)
 *
 * SECURITY: this script REFUSES positional arguments so a key can never be
 * passed on the command line (command args flow through the chat transcript).
 * It never prints the key — only whether one was stored and its length.
 * Dialogs per platform: macOS osascript (hidden answer), Windows PowerShell
 * WinForms (masked), Linux zenity/kdialog (else instructs the --stdin or CLI
 * fallback). All failure modes exit with actionable JSON, never a stack trace.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PLUGIN_ID = "norm@bland";
const DEFAULT_API_URL = "https://api.bland.ai";

function out(obj, code) {
  console.log(JSON.stringify(obj));
  process.exit(code);
}
function fail(msg, extra) {
  out(Object.assign({ ok: false, error: msg }, extra || {}), 1);
}

// ── Args (flags only — positional args are REFUSED, see SECURITY above) ──────
let url = null;
let useStdin = false;
let verify = false;
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--url") {
      url = argv[i + 1];
      i += 1;
      if (!url) fail("--url needs a value, e.g. --url https://api.bland.ai");
    } else if (a === "--stdin") {
      useStdin = true;
    } else if (a === "--verify") {
      verify = true;
    } else {
      fail(
        "Unexpected argument. Never pass the API key on the command line — it would enter the chat transcript. Run /norm:setup with no key; a native dialog will collect it.",
      );
    }
  }
  if (url) {
    url = url.replace(/\/+$/, "");
    if (!/^https:\/\/[^\s/]+/.test(url)) {
      fail(
        `Not an https URL: ${url}. Claude's HTTP-MCP transport requires https — use a tunnel for local servers.`,
      );
    }
  }
}

// ── Key collection ────────────────────────────────────────────────────────────
function readStdinSync() {
  try {
    const data = fs.readFileSync(0, "utf8");
    return data.replace(/\r?\n+$/, "").trim();
  } catch {
    return "";
  }
}

function dialogDarwin() {
  const script =
    'display dialog "Enter your Bland API key (app.bland.ai → API keys). It is stored locally and never shown in chat." default answer "" with hidden answer with title "Bland Norm setup" buttons {"Cancel","Save"} default button "Save"';
  try {
    const outp = execFileSync("osascript", ["-e", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const m = outp.match(/text returned:(.*)$/m);
    return m ? m[1].replace(/\r?\n$/, "").trim() : "";
  } catch (err) {
    // osascript exits 1 on user cancel
    out({ ok: false, cancelled: true, note: "Setup dialog cancelled." }, 1);
  }
}

function dialogWindows() {
  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$f = New-Object System.Windows.Forms.Form; $f.Text='Bland Norm setup'; $f.Width=420; $f.Height=170; $f.TopMost=$true; $f.StartPosition='CenterScreen';",
    "$l = New-Object System.Windows.Forms.Label; $l.Text='Enter your Bland API key (app.bland.ai). Stored locally, never shown in chat.'; $l.SetBounds(12,12,380,32); $f.Controls.Add($l);",
    "$t = New-Object System.Windows.Forms.TextBox; $t.UseSystemPasswordChar=$true; $t.SetBounds(12,52,380,24); $f.Controls.Add($t);",
    "$ok = New-Object System.Windows.Forms.Button; $ok.Text='Save'; $ok.DialogResult='OK'; $ok.SetBounds(236,90,75,26); $f.Controls.Add($ok); $f.AcceptButton=$ok;",
    "$ca = New-Object System.Windows.Forms.Button; $ca.Text='Cancel'; $ca.DialogResult='Cancel'; $ca.SetBounds(317,90,75,26); $f.Controls.Add($ca); $f.CancelButton=$ca;",
    "if ($f.ShowDialog() -eq 'OK') { [Console]::Out.Write($t.Text) } else { exit 1 }",
  ].join(" ");
  try {
    return execFileSync(
      "powershell",
      ["-NoProfile", "-STA", "-NonInteractive", "-Command", ps],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    out({ ok: false, cancelled: true, note: "Setup dialog cancelled." }, 1);
  }
}

function dialogLinux() {
  for (const [bin, args] of [
    ["zenity", ["--password", "--title=Bland Norm setup"]],
    ["kdialog", ["--password", "Enter your Bland API key"]],
  ]) {
    try {
      return execFileSync(bin, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).replace(/\r?\n$/, "");
    } catch (err) {
      if (err && err.status && err.stdout !== undefined && err.status !== 127) {
        // tool exists but user cancelled
        out({ ok: false, cancelled: true, note: "Setup dialog cancelled." }, 1);
      }
      // tool missing — try the next one
    }
  }
  fail(
    "No dialog tool found (zenity/kdialog). Use one of the no-GUI paths instead.",
    {
      fallbacks: [
        "printf '%s' YOUR_KEY | node norm-setup.cjs --stdin",
        "claude plugin install norm@bland --config bland_api_key=YOUR_KEY",
      ],
    },
  );
}

const key = useStdin
  ? readStdinSync()
  : process.platform === "darwin"
    ? dialogDarwin()
    : process.platform === "win32"
      ? dialogWindows()
      : dialogLinux();

if (!key) fail("No key entered.");
if (/\s/.test(key)) fail("Key contains whitespace — paste it exactly.");

// ── Store (documented location; atomic; 0600) ────────────────────────────────
const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const settingsPath = path.join(configDir, "settings.json");

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch (err) {
  if (err.code !== "ENOENT") fail(`Could not read ${settingsPath}: ${err.message}`);
}
const configs = settings.pluginConfigs || {};
const entry = configs[PLUGIN_ID] || {};
const options = entry.options || {};
options.bland_api_key = key;
if (url) options.bland_api_url = url;
entry.options = options;
configs[PLUGIN_ID] = entry;
settings.pluginConfigs = configs;

fs.mkdirSync(configDir, { recursive: true });
const tmp = `${settingsPath}.tmp-${process.pid}`;
fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(tmp, settingsPath);
try {
  fs.chmodSync(settingsPath, 0o600);
} catch {
  /* best-effort on platforms without chmod semantics */
}

// ── Optional auth verify (never prints the key) ──────────────────────────────
async function verifyAuth() {
  const base = (url || options.bland_api_url || DEFAULT_API_URL).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/v1/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "norm-setup", version: "1" },
        },
      }),
    });
    return { auth_ok: res.status === 200, status: res.status };
  } catch (err) {
    return { auth_ok: false, status: 0, network_error: String(err && err.message) };
  }
}

(async () => {
  const result = {
    ok: true,
    key_stored: true,
    key_len: key.length,
    bland_api_url: url || options.bland_api_url || `(default: ${DEFAULT_API_URL})`,
    restart_required: true,
    note: "Restart the Claude session so the Bland MCP client connects with the stored key.",
  };
  if (verify) Object.assign(result, await verifyAuth());
  console.log(JSON.stringify(result));
})();
