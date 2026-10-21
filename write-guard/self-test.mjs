#!/usr/bin/env bun
/**
 * self-test de write-guard (enc-59c26f58) — determinista, sin notificaciones reales.
 * Uso: bun self-test.mjs
 * Aísla config/log en /tmp (env PI_WRITE_GUARD_*) y ejerce la extensión con un
 * pi mock: gate de activación, herramientas write/edit, y tabla del analizador bash.
 */
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const TMP = "/tmp/write-guard-selftest";
const ROT_CWD = join(HOME, ".local/state/routines/rot/home");

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
// config de prueba: notify off + una ruta extra autorizada
writeFileSync(
	join(TMP, "config.json"),
	JSON.stringify({ enabled: true, zones: [], paths: ["/opt/wg-extra/directorio"], notify: false }),
);
process.env.PI_WRITE_GUARD_CONFIG = join(TMP, "config.json");
process.env.PI_WRITE_GUARD_LOG = join(TMP, "log.jsonl");
delete process.env.PI_PROFILE;
delete process.env.PI_WRITE_GUARD_DISABLE;

const mod = await import("./index.ts");

// ── pi/ctx mocks ────────────────────────────────────────────────────────────
function makeSession(cwd) {
	const handlers = {};
	const commands = {};
	const pi = {
		on: (ev, h) => ((handlers[ev] ??= []).push(h)),
		registerCommand: (name, opts) => (commands[name] = opts),
	};
	mod.default(pi);
	const ctx = {
		cwd,
		mode: "json",
		hasUI: false,
		ui: { notify: () => {}, setStatus: () => {} },
		sessionManager: {},
	};
	const sessionStart = async () => {
		for (const h of handlers.session_start ?? []) await h({ type: "session_start" }, ctx);
	};
	const toolCall = (toolName, input) => {
		if (!handlers.tool_call?.length) throw new Error("sin handler tool_call");
		return handlers.tool_call[0]({ type: "tool_call", toolName, input, toolCallId: "t" }, ctx);
	};
	const command = (name) => commands[name]?.handler?.(name, ctx);
	return { sessionStart, toolCall, command, ctx };
}

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra) {
	if (cond) {
		pass++;
		console.log(`  ok  ${name}`);
	} else {
		fail++;
		failures.push(name + (extra ? ` → ${extra}` : ""));
		console.log(`FAIL  ${name}${extra ? ` → ${extra}` : ""}`);
	}
}

// ── 1. Gate de activación ───────────────────────────────────────────────────
console.log("\n[1] Gate de activación");
{
	process.env.PI_PROFILE = undefined;
	const s = makeSession(join(HOME, "workspaces/exohuman/.worktrees/wt-59c26f58"));
	await s.sessionStart();
	check("sin PI_PROFILE y cwd worktree → inactiva (permite escritura fuera)", s.toolCall("write", { path: join(HOME, "x-fuera.txt"), content: "x" }) === undefined);

	const s2 = makeSession(ROT_CWD);
	process.env.PI_PROFILE = "assistant";
	await s2.sessionStart();
	const blocked = s2.toolCall("write", { path: join(HOME, "x-fuera.txt"), content: "x" });
	check("PI_PROFILE=assistant → bloquea escritura fuera", blocked?.block === true && /write-guard/.test(blocked.reason ?? ""), JSON.stringify(blockled(blocked)));

	const s3 = makeSession("/home/rgsaura");
	await s3.sessionStart();
	check("PI_PROFILE=assistant con cwd cualquiera → activa", s3.toolCall("write", { path: "/home/rgsaura/y.txt", content: "x" })?.block === true);

	process.env.PI_WRITE_GUARD_DISABLE = "1";
	const s4 = makeSession(ROT_CWD);
	await s4.sessionStart();
	check("PI_WRITE_GUARD_DISABLE=1 → inactiva", s4.toolCall("write", { path: join(HOME, "z.txt"), content: "x" }) === undefined);
	delete process.env.PI_WRITE_GUARD_DISABLE;
}

function blockled(r) {
	return r ? (r.reason ?? "").slice(0, 80) : "undefined";
}

// ── 2. Herramientas write/edit ──────────────────────────────────────────────
console.log("\n[2] write/edit");
process.env.PI_PROFILE = "assistant";
{
	const s = makeSession(ROT_CWD);
	await s.sessionStart();
	check("write dentro ~/.local/state → permite", s.toolCall("write", { path: join(HOME, ".local/state/routines/wg-test.txt"), content: "x" }) === undefined);
	check("write /tmp → permite", s.toolCall("write", { path: "/tmp/wg-test.txt", content: "x" }) === undefined);
	check("write ruta extra de config → permite", s.toolCall("write", { path: "/opt/wg-extra/directorio/f.txt", content: "x" }) === undefined);
	check("write fuera (~) → bloquea", s.toolCall("write", { path: "~/wg-fuera.txt", content: "x" })?.block === true);
	check("edit fuera (~/.bashrc) → bloquea", s.toolCall("edit", { path: join(HOME, ".bashrc"), edits: [] })?.block === true);
	check("edit dentro (/tmp) → permite", s.toolCall("edit", { path: "/tmp/f.txt", edits: [] }) === undefined);
	check("write a la propia config → bloquea", s.toolCall("write", { path: join(HOME, ".config/exohuman/write-guard.json"), content: "{}" })?.block === true);
	check("write a la propia extensión → bloquea", s.toolCall("write", { path: join(HOME, ".pi/agent/extensions/write-guard/index.ts"), content: "x" })?.block === true);
}

// ── 3. Analizador bash ──────────────────────────────────────────────────────
console.log("\n[3] bash");
{
	const s = makeSession(ROT_CWD);
	await s.sessionStart();
	const bash = (cmd) => s.toolCall("bash", { command: cmd });
	const allow = (name, cmd) => {
		const r = bash(cmd);
		check(`${name}  [${cmd.slice(0, 60)}]`, r === undefined, blockled(r));
	};
	const deny = (name, cmd) => {
		const r = bash(cmd);
		check(`${name}  [${cmd.slice(0, 60)}]`, r?.block === true, r === undefined ? "PERMITIDO (inesperado)" : "no bloqueó");
	};

	// dentro de zona
	allow("redirect /tmp", "echo hola > /tmp/wg/x.txt");
	allow("redirect append /tmp", "echo hola >> /tmp/wg/x.txt");
	allow("redirect relativo (cwd en zona)", "echo hola > archivo.txt");
	allow("/dev/null", "echo x > /dev/null 2>/dev/null");
	allow("fd dup", "echo x 2>&1 | cat");
	allow("rm /tmp", "rm -f /tmp/wg/x.txt");
	allow("mkdir -p /tmp", "mkdir -p /tmp/wg/d");
	allow("touch /tmp", "touch /tmp/a /tmp/b");
	allow("tee /tmp", "echo x | tee /tmp/t.txt");
	allow("cp /tmp→/tmp", "cp /tmp/a /tmp/b");
	allow("mv /tmp→/tmp", "mv /tmp/a /tmp/b");
	allow("sed -i /tmp", "sed -i 's/a/b/' /tmp/f.txt");
	allow("truncate -s /tmp", "truncate -s 0 /tmp/f");
	allow("chmod /tmp", "chmod +x /tmp/s.sh");
	allow("dd of=/tmp", "dd if=/dev/zero of=/tmp/img bs=1 count=1");
	allow("ln /tmp", "ln -sfn /tmp/target /tmp/link");
	allow("curl -o /tmp", "curl -fsS -o /tmp/f.json https://ejemplo");
	allow("wget -O /tmp", "wget -O /tmp/f https://ejemplo");
	allow("npm install en cwd en zona", "npm install lodash");
	allow("python -c escritura /tmp", "python3 -c 'open(\"/tmp/f\",\"w\").write(\"x\")'");
	allow("python -c lectura", "python3 -c 'print(open(\"/etc/hostname\").read())'");
	allow("lectura simple", "cat /etc/passwd | head -3");
	allow("CLI confianza rg-encargo", "rg-encargo list --json");
	allow("CLI confianza exo-note", "exo-note add --note prueba");
	allow("git add en cwd zona", "git add archivo.txt");
	allow("sub $() innocuo", "echo $(date +%s) > /tmp/ts.txt");
	allow("find -delete /tmp", "find /tmp/wg -name '*.tmp' -delete");
	allow("git status", "git -C /tmp/wg status");
	allow("crontab -l", "crontab -l");

	// fuera de zona
	deny("redirect ~", "echo hola > ~/wg-fuera.txt");
	deny("redirect ~/.config", "echo x >> ~/.config/exohuman/x.conf");
	deny("redirect anidado bash -c", "bash -c 'echo z > ~/w.txt'");
	deny("rm ~", "rm ~/.bashrc");
	deny("rm var $ sin resolver (destructivo)", "for f in ~/x/*; do rm $f; done");
	deny("mv src fuera", "mv ~/docs/a.txt /tmp/");
	deny("mv dest fuera", "mv /tmp/a ~/x.txt");
	deny("cp dest fuera", "cp /tmp/a ~/x.txt");
	deny("tee ~", "echo x | tee ~/t.txt");
	deny("mkdir ~", "mkdir -p ~/wg-d");
	deny("sed -i ~", "sed -i 's/a/b/' ~/.config/exohuman/f");
	deny("chmod ~", "chmod +x ~/script.sh");
	deny("chown ~", "chown rgsaura:rgsaura ~/f");
	deny("dd of=~", "dd if=/dev/zero of=~/img bs=1 count=1");
	deny("ln dest ~", "ln -sfn /tmp/target ~/link");
	deny("curl -o ~", "curl -fsS -o ~/f.json https://ejemplo");
	deny("wget -O ~", "wget -O ~/f https://ejemplo");
	deny("npm install -g", "npm install -g typescript");
	deny("npm --prefix fuera", "npm install --prefix ~/proyecto lodash");
	deny("pip install", "pip3 install requests");
	deny("pip --user", "pip install --user requests");
	deny("python -c escritura fuera", "python3 -c 'open(\"/home/rgsaura/x.txt\",\"w\").write(\"y\")'");
	deny("python -c escritura sin rutas", "python3 -c 'f=open(p,\"w\")'");
	deny("node -e escritura fuera", "node -e 'require(\"fs\").writeFileSync(\"/home/rgsaura/x\",\"y\")'");
	deny("sub $(rm ~)", "echo $(rm ~/y.txt) texto");
	deny("sudo rm ~", "sudo rm ~/importante.txt");
	deny("git repo fuera", "git -C ~/workspaces/exohuman/ui commit -m x");
	deny("git clone fuera", "git clone https://ejemplo ~/repo-clon");
	deny("find -delete ~", "find ~/tmp-fake -name '*.log' -delete");
	deny("crontab -e", "crontab -e");
	deny("crontab install", "crontab /tmp/micron");
	deny("redirect var sin resolver", "echo x > $DESTINO");
	deny("rsync dest fuera", "rsync -a /tmp/ ~/backup/");
	deny("install dest fuera", "install -m 644 /tmp/a ~/binario");
	deny("awk print> fuera", "awk '{print > \"/home/rgsaura/x\"}' /tmp/f");
	deny("sqlite3 db fuera", "sqlite3 ~/db.sqlite 'INSERT INTO t VALUES (1)'");
	deny("truncate ~", "truncate -s 0 ~/f");
}

// ── 4. Worktree enrutado ────────────────────────────────────────────────────
console.log("\n[4] worktree enrutado");
{
	// este worktree real del encargo está registrado: escrituras dentro → OK
	const wt = join(HOME, "workspaces/exohuman/.worktrees/wt-59c26f58");
	const s = makeSession(wt);
	await s.sessionStart();
	check("write dentro del worktree registrado → permite", s.toolCall("write", { path: join(wt, "probe.txt"), content: "x" }) === undefined);
	check("write al árbol base (fuera del worktree) → bloquea", s.toolCall("write", { path: join(HOME, "workspaces/exohuman/ui/app/page.tsx"), content: "x" })?.block === true);
}

// ── 5. Comando /write-guard ─────────────────────────────────────────────────
console.log("\n[5] comando /write-guard");
{
	const s = makeSession(ROT_CWD);
	await s.sessionStart();
	let notified = "";
	const ctx2 = { ...s.ctx, ui: { notify: (m) => (notified = m), setStatus: () => {} } };
	// re-usamos el handler registrado con su propio ctx
	let ok = true;
	try {
		await s.command?.("write-guard");
	} catch (e) {
		ok = false;
		console.log("   comando lanzó:", String(e).slice(0, 120));
	}
	check("/write-guard se ejecuta sin error", ok);
}

// ── 6. Log ──────────────────────────────────────────────────────────────────
console.log("\n[6] log");
{
	const log = readFileSync(join(TMP, "log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
	const blocks = log.filter((e) => e.event === "block");
	const allows = log.filter((e) => e.event === "allow-write");
	const inits = log.filter((e) => e.event === "init");
	console.log(`   inits=${inits.length} blocks=${blocks.length} allows=${allows.length}`);
	check("log registra inits", inits.length >= 4);
	check("log registra bloqueos", blocks.length >= 20);
	check("log registra escrituras permitidas", allows.length >= 10);
	const sample = blocks.find((b) => b.tool === "write");
	check("bloqueo lleva tool+dest+reason+cwd", !!(sample?.dest && sample?.reason && sample?.cwd));
}

console.log(`\n${pass} ok · ${fail} FAIL`);
if (failures.length) {
	console.log("\nFallos:");
	for (const f of failures) console.log("  -", f);
	process.exit(1);
}
console.log("SELF-TEST OK");
