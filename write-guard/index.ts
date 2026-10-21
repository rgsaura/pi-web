/**
 * write-guard — Guarda de escritura real para ROT (perfil assistant)
 * ────────────────────────────────────────────────────────────────────
 * Origen: enc-59c26f58 (2026-10-21). Desplegado en:
 *   ~/.pi/agent/extensions/write-guard/index.ts   (código, carga pi)
 *   ~/.config/exohuman/write-guard.json           (zonas/rutas extra, kill-switch)
 *   ~/.local/state/write-guard/log.jsonl          (auditoría: bloqueos y escrituras)
 * Artefacto versionado: <worktree wt-59c26f58>/write-guard/index.ts
 *
 * QUÉ HACE: al activarse (sesión con PI_PROFILE=assistant o cwd bajo el hogar
 * de ROT) intercepta edit/write/bash y valida cada destino contra zonas:
 *   ~/.local/state/** · ~/.cache/** · ~/.npm/** · /tmp/** · /var/tmp/** ·
 *   /dev/shm/** · worktree asignado por enrutado (routing.json/worktrees.json)
 *   · rutas/zonas extra declaradas en write-guard.json.
 * Fuera de zona: BLOQUEA (el modelo ve el motivo), registra en log y avisa a
 * Rodrigo por ROT (skill personal-notifications, con dedup por clave diaria).
 * Nunca silencioso: aunque la notificación falle, el bloqueo y el log quedan.
 *
 * REGLAS DE LA PIEZA:
 * - La propia extensión y su config viven FUERA de las zonas: ROT no puede
 *   editarse la guarda a sí mismo ni desactivarla escribiendo su config.
 * - Kill-switches sólo desde fuera del modelo: `enabled:false` en la config
 *   (la edita Rodrigo/encargos por ruta absoluta) o PI_WRITE_GUARD_DISABLE=1
 *   en el entorno del proceso pi (fijado por quien lanza, no por el modelo).
 * - Los CLIs instalados (~/.local/bin/rg-*, exo-note, pi, bun…) son piezas de
 *   confianza: la guarda valida destinos explícitos de herramientas, no puede
 *   rastrear lo que un binario escribe por dentro. Límite documentado en el
 *   README del artefacto.
 * - Sin efectos en sesiones no-ROT: la extensión carga en todo pi pero sólo
 *   actúa bajo la señal assistant/ROT (PI_PROFILE o cwd del puente).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";

const HOME = homedir();
const VERSION = "1.0.0";
const ENCARGO = "enc-59c26f58";

// ── Rutas canónicas (overridables sólo por env del proceso, no del modelo) ──
const CONFIG_PATH = process.env.PI_WRITE_GUARD_CONFIG || join(HOME, ".config/exohuman/write-guard.json");
const LOG_PATH = process.env.PI_WRITE_GUARD_LOG || join(HOME, ".local/state/write-guard/log.jsonl");
const ROUTING_PATH = join(HOME, ".config/exohuman/routing.json");
const NOTIFY_SCRIPT = join(HOME, ".agents/skills/personal-notifications/scripts/notify.ts");
const DEFAULT_ROT_HOME = join(HOME, ".local/state/routines/rot");

// ── Config ──────────────────────────────────────────────────────────────────
interface WgConfig {
	enabled: boolean;
	/** Prefijos de directorio extra (absolutos o con ~) autorizados además de las zonas por defecto. */
	zones: string[];
	/** Rutas exactas (archivo o directorio) autorizadas por un encargo explícito. */
	paths: string[];
	/** Avisar a Rodrigo por ROT en cada bloqueo (dedup diario por destino). */
	notify: boolean;
	/** Cwd del puente ROT: sesión bajo este árbol también activa la guarda. */
	rotHome: string;
}

const DEFAULT_CONFIG: WgConfig = {
	enabled: true,
	zones: [],
	paths: [],
	notify: true,
	rotHome: DEFAULT_ROT_HOME,
};

function loadConfig(): WgConfig {
	try {
		const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<WgConfig>;
		return {
			enabled: raw.enabled !== false,
			zones: Array.isArray(raw.zones) ? raw.zones.filter((z) => typeof z === "string") : [],
			paths: Array.isArray(raw.paths) ? raw.paths.filter((p) => typeof p === "string") : [],
			notify: raw.notify !== false,
			rotHome: typeof raw.rotHome === "string" && raw.rotHome ? raw.rotHome : DEFAULT_ROT_HOME,
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

// ── Routing (worktree asignado por enrutado) ────────────────────────────────
interface RoutingInfo {
	worktreesRoot: string;
	worktreeRegistry: string;
}
let routingCache: { at: number; info: RoutingInfo | null } = { at: 0, info: null };

function readRouting(): RoutingInfo | null {
	if (routingCache.info && Date.now() - routingCache.at < 60_000) return routingCache.info;
	try {
		const r = JSON.parse(readFileSync(ROUTING_PATH, "utf8")) as Record<string, unknown>;
		const info: RoutingInfo = {
			worktreesRoot: String(r.worktreesRoot ?? ""),
			worktreeRegistry: String(r.worktreeRegistry ?? ""),
		};
		routingCache = { at: Date.now(), info };
		return info;
	} catch {
		routingCache = { at: Date.now(), info: null };
		return null;
	}
}

/** Zona-worktree de un cwd: el wt-<hex8> registrado que lo contiene, o el ancestro wt-* si es huérfano. */
function worktreeZoneFor(cwd: string): { zone: string; registered: boolean } | null {
	const routing = readRouting();
	if (!routing?.worktreesRoot) return null;
	const root = resolve(routing.worktreesRoot);
	if (cwd !== root && !cwd.startsWith(root + sep)) return null;
	let registeredPaths: string[] = [];
	try {
		if (routing.worktreeRegistry) {
			const reg = JSON.parse(readFileSync(routing.worktreeRegistry, "utf8")) as {
				worktrees?: Record<string, { path?: string }>;
			};
			registeredPaths = Object.values(reg.worktrees ?? {})
				.map((w) => (typeof w?.path === "string" ? resolve(w.path) : ""))
				.filter(Boolean);
		}
	} catch {
		/* registro ilegible: fail-open con warn en el log */
	}
	for (const p of registeredPaths) {
		if (cwd === p || cwd.startsWith(p + sep)) return { zone: p, registered: true };
	}
	const rel = cwd.slice(root.length + 1).split(sep);
	if (rel[0]?.startsWith("wt-")) {
		logEvent("warn", { msg: "worktree huérfano (sin registro)", cwd });
		return { zone: join(root, rel[0]), registered: false };
	}
	return null;
}

// ── Zonas y validación de destinos ──────────────────────────────────────────
const DEFAULT_ZONES = [
	join(HOME, ".local/state"),
	join(HOME, ".cache"),
	join(HOME, ".npm"),
	"/tmp",
	"/var/tmp",
	"/dev/shm",
];
const SPECIAL_FILES = new Set(["/dev/null", "/dev/zero", "/dev/full", "/dev/stdout", "/dev/stderr"]);

function expandTilde(p: string): string {
	return p.startsWith("~") ? join(HOME, p.slice(1)) : p;
}

/** realpath best-effort: resuelve el ancestro existente más cercano y recompone. */
function realPathBestEffort(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		const parent = dirname(p);
		if (parent === p) return p;
		try {
			if (statSync(parent).isDirectory()) return join(realPathBestEffort(parent), p.slice(parent.length + 1));
		} catch {
			return realPathBestEffort(parent) + p.slice(parent.length);
		}
		return p;
	}
}

function zonesFor(cwd: string, cfg: WgConfig): string[] {
	const zones = [...DEFAULT_ZONES];
	const wt = worktreeZoneFor(cwd);
	if (wt) zones.push(wt.zone);
	for (const z of cfg.zones) zones.push(realPathBestEffort(normalize(expandTilde(z))));
	for (const p of cfg.paths) zones.push(realPathBestEffort(normalize(expandTilde(p))));
	return zones;
}

/** ¿destino dentro de alguna zona? Comparación real (symlinks resueltos en ambos lados). */
function insideZones(target: string, zones: string[]): boolean {
	if (SPECIAL_FILES.has(target)) return true;
	const real = realPathBestEffort(target);
	return zones.some((z) => {
		const rz = realPathBestEffort(z);
		return real === rz || real.startsWith(rz + sep);
	});
}

function zonesDescription(cwd: string, cfg: WgConfig): string {
	const wt = worktreeZoneFor(cwd);
	const parts = ["~/.local/state/**", "~/.cache/**", "~/.npm/**", "/tmp/**", "/var/tmp/**", "/dev/shm/**"];
	if (wt) parts.push(wt.registered ? `worktree ${wt.zone} (enrutado)` : `worktree ${wt.zone} (no registrado)`);
	if (cfg.zones.length) parts.push(...cfg.zones.map((z) => `${z} (config)`));
	if (cfg.paths.length) parts.push(...cfg.paths.map((p) => `${p} (config)`));
	return parts.join(" · ");
}

// ── Activación ──────────────────────────────────────────────────────────────
/** Señal assistant/ROT: PI_PROFILE=assistant (puente, reconciliador, call-intake) o cwd bajo el hogar de ROT. */
function sessionIsActive(cwd: string, cfg: WgConfig): boolean {
	if (process.env.PI_WRITE_GUARD_DISABLE === "1") return false;
	if (!cfg.enabled) return false;
	if (process.env.PI_PROFILE === "assistant") return true;
	const rotHome = resolve(cfg.rotHome);
	return cwd === rotHome || cwd.startsWith(rotHome + sep);
}

// ── Log + notificación ──────────────────────────────────────────────────────
type LogEvent = "init" | "block" | "allow-write" | "warn" | "notify-error";

function logEvent(event: LogEvent, fields: Record<string, unknown>): void {
	try {
		mkdirSync(dirname(LOG_PATH), { recursive: true });
		appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), event, ...fields }) + "\n");
	} catch {
		/* el log jamás rompe la guarda */
	}
}

function findBun(): string {
	for (const b of ["/usr/local/bin/bun", join(HOME, ".local/bin/bun")]) {
		try {
			if (statSync(b).isFile()) return b;
		} catch {
			/* siguiente */
		}
	}
	return "bun";
}

/** Aviso a Rodrigo por ROT (skill personal-notifications). Clave diaria por destino → dedup del broker. */
function notifyRodrigo(tool: string, dest: string, reason: string, cwd: string): void {
	const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
	const hash = createHash("sha1").update(`${tool}|${dest}|${reason}`).digest("hex").slice(0, 12);
	const key = `write-guard:block:${hash}:${day}`;
	const expiresAt = new Date(Date.now() + 48 * 3600_000).toISOString();
	const notice = {
		source: "write-guard",
		key,
		event: "change" as const,
		channel: "rot" as const,
		title: "Write-guard: escritura bloqueada",
		text:
			`Herramienta ${tool} intentó escribir en ${dest} — fuera de zona (${reason}).\n` +
			`Sesión ROT (cwd ${cwd}). Si es legítimo, autoriza la ruta en ~/.config/exohuman/write-guard.json.\n` +
			`Auditoría: ~/.local/state/write-guard/log.jsonl`,
		actionRequired: true,
		sensitive: false,
		voiceAuthorized: false,
		expiresAt,
	};
	const bun = findBun();
	if (!existsSync(NOTIFY_SCRIPT)) {
		logEvent("notify-error", { key, error: "notify.ts no disponible" });
		return;
	}
	try {
		const child: ChildProcess = spawn(bun, [NOTIFY_SCRIPT, "send", "--execute"], {
			stdio: ["pipe", "ignore", "ignore"],
			detached: true,
		});
		child.on("error", (err: Error) => logEvent("notify-error", { key, error: String(err) }));
		child.stdin?.write(JSON.stringify(notice));
		child.stdin?.end();
		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {
				/* ya murió */
			}
		}, 15_000);
		timer.unref?.();
		child.unref();
	} catch (err) {
		logEvent("notify-error", { key, error: String(err) });
	}
}

function blockResult(
	tool: string,
	dest: string,
	reason: string,
	cwd: string,
	cfg: WgConfig,
	command?: string,
): ToolCallEventResult {
	logEvent("block", { tool, dest, reason, cwd, command: command?.slice(0, 300) });
	if (cfg.notify) notifyRodrigo(tool, dest, reason, cwd);
	return {
		block: true,
		reason:
			`write-guard: destino fuera de zona autorizada — ${dest} (${reason}). ` +
			`Zonas de esta sesión: ${zonesDescription(cwd, cfg)}. ` +
			`Comunícalo a Rodrigo tal cual; si él lo autoriza, la ruta se añade en ~/.config/exohuman/write-guard.json. ` +
			`No intentes rutas alternativas para esquivar la guarda.`,
	};
}

// ── Análisis de bash ────────────────────────────────────────────────────────
/** Expande variables conocidas ($HOME/$USER/$TMPDIR/$PWD→cwd). null = queda una variable sin resolver. */
function expandKnownVars(p: string, cwd: string): string | null {
	let out = p;
	for (const name of ["HOME", "USER", "TMPDIR"]) {
		out = out.split(`$${name}`).join(process.env[name] ?? "");
	}
	out = out.split("$PWD").join(cwd);
	return out.includes("$") ? null : out;
}

/** Resuelve un destino de bash (relativo al cwd). null = irresoluble (variables sin expandir). */
function resolveBashTarget(p: string, cwd: string): string | null {
	const expanded = expandKnownVars(p, cwd);
	if (expanded === null || expanded.trim() === "") return null;
	const t = expandTilde(expanded.trim());
	return isAbsolute(t) ? normalize(t) : normalize(resolve(cwd, t));
}

// Tokenizer: palabras, operadores y sustituciones $(…) / `…` (se registran y se analizan aparte)
interface Tok {
	kind: "word" | "op";
	v: string;
}

/** Escanea $( … ) balanceado desde la '(' en `start`; devuelve índice de cierre y cuerpo. */
function scanSub(s: string, start: number): { end: number; body: string } {
	let depth = 0;
	let i = start;
	let body = "";
	while (i < s.length) {
		const c = s[i];
		if (c === "'") {
			const end = s.indexOf("'", i + 1);
			if (end === -1) break;
			body += s.slice(i, end + 1);
			i = end + 1;
			continue;
		}
		if (c === '"') {
			i++;
			while (i < s.length && s[i] !== '"') {
				if (s[i] === "\\" && i + 1 < s.length) {
					body += s.slice(i, i + 2);
					i += 2;
					continue;
				}
				body += s[i];
				i++;
			}
			body += '"';
			i++;
			continue;
		}
		if (c === "(") depth++;
		if (c === ")") {
			depth--;
			if (depth === 0) return { end: i, body };
		}
		body += c;
		i++;
	}
	return { end: s.length - 1, body };
}

function tokenize(s: string): { toks: Tok[]; subs: string[] } {
	const toks: Tok[] = [];
	const subs: string[] = [];
	let i = 0;
	let word = "";
	let hasWord = false;
	const pushWord = () => {
		if (hasWord) toks.push({ kind: "word", v: word });
		word = "";
		hasWord = false;
	};
	while (i < s.length) {
		const c = s[i];
		if (c === "'") {
			const end = s.indexOf("'", i + 1);
			if (end === -1) {
				word += s.slice(i + 1);
				hasWord = true;
				break;
			}
			word += s.slice(i + 1, end);
			hasWord = true;
			i = end + 1;
			continue;
		}
		if (c === '"') {
			i++;
			while (i < s.length && s[i] !== '"') {
				if (s[i] === "\\" && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) {
					word += s[i + 1];
					i += 2;
					continue;
				}
				if (s[i] === "$" && s[i + 1] === "(") {
					const inner = scanSub(s, i + 1);
					word += s.slice(i, inner.end + 1);
					subs.push(inner.body);
					i = inner.end + 1;
					continue;
				}
				if (s[i] === "`") {
					const end = s.indexOf("`", i + 1);
					if (end === -1) break;
					subs.push(s.slice(i + 1, end));
					word += s.slice(i, end + 1);
					i = end + 1;
					continue;
				}
				word += s[i];
				i++;
			}
			hasWord = true;
			i++;
			continue;
		}
		if (c === "\\" && i + 1 < s.length) {
			word += s[i + 1];
			hasWord = true;
			i += 2;
			continue;
		}
		if (c === "$" && s[i + 1] === "(") {
			const inner = scanSub(s, i + 1);
			word += s.slice(i, inner.end + 1);
			subs.push(inner.body);
			hasWord = true;
			i = inner.end + 1;
			continue;
		}
		if (c === "`") {
			const end = s.indexOf("`", i + 1);
			if (end === -1) {
				word += c;
				hasWord = true;
				i++;
				continue;
			}
			subs.push(s.slice(i + 1, end));
			word += s.slice(i, end + 1);
			hasWord = true;
			i = end + 1;
			continue;
		}
		if (" \t\r".includes(c)) {
			pushWord();
			i++;
			continue;
		}
		if (c === "\n" || c === ";") {
			pushWord();
			toks.push({ kind: "op", v: ";" });
			i++;
			continue;
		}
		if (c === "|" || c === "&") {
			pushWord();
			let op = c;
			if (s[i + 1] === c) op += c; // || &&
			else if (c === "&" && s[i + 1] === ">") {
				op = "&>";
				if (s[i + 2] === ">") op += ">";
			}
			toks.push({ kind: "op", v: op });
			i += op.length;
			continue;
		}
		if (c === ">" || c === "<" || c === "(" || c === ")") {
			const fdPrefix = hasWord && /^\d+$/.test(word) ? word : "";
			if (fdPrefix) {
				word = "";
				hasWord = false;
			}
			pushWord();
			let op = fdPrefix + c;
			if (c === ">" && s[i + 1] === ">") op += ">";
			if (c === "<" && s[i + 1] === "<") {
				op += "<";
				if (s[i + 2] === "<") op += "<";
			}
			if (c === ">" && s[i + 1] === "<") op += "<";
			toks.push({ kind: "op", v: op });
			i += op.length - fdPrefix.length;
			continue;
		}
		word += c;
		hasWord = true;
		i++;
	}
	pushWord();
	return { toks, subs };
}

interface SimpleCmd {
	words: string[];
	redirectTargets: string[];
}

/** Token stream → comandos simples (separadores ; | && || & ( ) línea nueva). */
function parseSimpleCommands(toks: Tok[]): SimpleCmd[] {
	const cmds: SimpleCmd[] = [];
	let cur: SimpleCmd = { words: [], redirectTargets: [] };
	const flush = () => {
		if (cur.words.length || cur.redirectTargets.length) cmds.push(cur);
		cur = { words: [], redirectTargets: [] };
	};
	let expectRedirectTarget = false;
	let expectHeredoc = false;
	for (const t of toks) {
		if (t.kind === "op") {
			if (t.v === ";" || t.v === "|" || t.v === "||" || t.v === "&&" || t.v === "&" || t.v === "(" || t.v === ")") {
				expectRedirectTarget = false;
				expectHeredoc = false;
				flush();
				continue;
			}
			if (t.v.includes("<") && !t.v.includes(">")) {
				// < << <<< — entrada de datos, no destino de escritura
				expectRedirectTarget = false;
				expectHeredoc = t.v.includes("<<");
				continue;
			}
			expectRedirectTarget = true; // > >> <> &> &>> 2> 2>> …
			continue;
		}
		if (expectHeredoc) {
			expectHeredoc = false;
			continue;
		}
		if (expectRedirectTarget) {
			expectRedirectTarget = false;
			if (!t.v.startsWith("&")) cur.redirectTargets.push(t.v); // >&1 → dup de fd, no archivo
			continue;
		}
		cur.words.push(t.v);
	}
	flush();
	return cmds;
}

// Comandos que escriben/borran: extracción de destinos.
// Con destino irresoluble (variable sin expandir) se bloquea (fail-safe).
const WRITE_ALL_ARGS = new Set(["rm", "rmdir", "unlink", "shred", "srm", "mv", "tee", "touch", "truncate"]);
const WRITE_LAST_ARG = new Set(["cp", "gcp", "install", "rsync", "ln", "chmod", "chown", "chgrp", "setfacl", "chattr"]);
/** Flags cortos que consumen el token siguiente, por comando. */
const FLAG_WITH_VALUE: Record<string, string[]> = {
	truncate: ["s"],
	mkdir: ["m"],
	install: ["m", "o", "g"],
	touch: ["d", "t", "r"],
	chown: ["--reference"],
	chmod: ["--reference"],
	cp: ["t", "S"],
	mv: ["t", "S"],
	rsync: ["b", "e", "exclude"],
};
/** Flags largos con valor separado (p.ej. --target-directory DIR). */
const LONG_FLAG_WITH_VALUE = new Set(["--target-directory", "--reference", "--suffix", "--backup"]);

function isFlagWithValue(cmd: string, w: string): boolean {
	const vals = FLAG_WITH_VALUE[cmd] ?? [];
	if (LONG_FLAG_WITH_VALUE.has(w)) return true;
	if (w.startsWith("--") && w.includes("=")) return false; // valor embebido
	if (!w.startsWith("-") || w.startsWith("--")) return false;
	return vals.some((f) => w === `-${f}`);
}

function nonFlagArgs(words: string[], cmd: string): string[] {
	const args: string[] = [];
	for (let k = 1; k < words.length; k++) {
		const w = words[k];
		if (w === "--") {
			args.push(...words.slice(k + 1));
			break;
		}
		if (w === "-") continue;
		if (w.startsWith("--") && w.includes("=")) continue;
		if (w.startsWith("-")) {
			if (isFlagWithValue(cmd, w) && k + 1 < words.length) k++; // saltar el valor del flag
			continue;
		}
		args.push(w);
	}
	return args;
}

/** Código embebido (-c/-e/…) que analizamos con heurística. */
const INLINE_CODE_FLAGS = new Set(["-c", "-e", "--eval", "--execute", "--command", "-pe", "-ne"]);

/** Patrones de escritura en código python/node/perl embebido (heurística fail-safe). */
const CODE_WRITE_PATTERNS: RegExp[] = [
	/open\s*\([^)]*["'][wax]["']/,
	/writeFile(?:Sync)?/,
	/appendFile(?:Sync)?/,
	/createWriteStream/,
	/rmSync|unlinkSync|rmdirSync/,
	/renameSync|mkdirSync|cpSync/,
	/shutil\./,
	/os\.(?:remove|rename|makedirs|mkdir|unlink|truncate)\b/,
	/write_text|write_bytes|\.unlink\(\)|\.mkdir\(/,
	/sqlite3\.connect|torch\.save|np\.save\(|pickle\.dump\(/,
	/\b(?:INSERT\s+INTO|REPLACE\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|CREATE\s+TABLE)\b/i,
	/fs\.(?:open|write|append|rename|rm|mkdir)/,
];

function extractAbsPaths(code: string): string[] {
	const out: string[] = [];
	const re = /["']((?:\/|~\/)[^"']+)["']/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(code)) !== null) out.push(m[1]);
	return out;
}

interface AnalysisOutcome {
	block?: string; // motivo del bloqueo
	blockedDest?: string; // destino ofensor (para el aviso)
	writes: string[]; // destinos de escritura detectados (auditoría)
}

/** Analiza un comando simple; valida destinos contra zonas. */
function analyzeSimpleCommand(cmd: SimpleCmd, cwd: string, zones: string[], depth: number): AnalysisOutcome {
	const outcome: AnalysisOutcome = { writes: [] };
	const words = cmd.words;
	for (const rt of cmd.redirectTargets) {
		const t = resolveBashTarget(rt, cwd);
		if (t === null) {
			outcome.block = `redirección con variable sin resolver (${rt})`;
			outcome.blockedDest = rt;
			return outcome;
		}
		outcome.writes.push(t);
		if (!insideZones(t, zones)) {
			outcome.block = `redirección fuera de zona: ${t}`;
			outcome.blockedDest = t;
			return outcome;
		}
	}
	if (!words.length) return outcome;

	// Saltar prefijos: asignaciones VAR=…, wrappers (sudo/nohup/time/timeout/env…) y sus flags,
	// y palabras de control (do/then/else/{/}).
	let i0 = 0;
	const wrappers = new Set(["sudo", "nohup", "command", "nice", "ionice", "time", "timeout", "env"]);
	while (i0 < words.length) {
		const w = words[i0];
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || wrappers.has(w) || /^\d+$/.test(w)) {
			i0++;
			continue;
		}
		if (w.startsWith("-") && i0 > 0) {
			i0++; // flag de un wrapper (timeout --kill-after=… pi …)
			continue;
		}
		if (i0 === 0 || ["do", "then", "else", "{", "}"].includes(words[i0 - 1] ?? "")) {
			if (["do", "then", "else", "{", "}"].includes(w)) {
				i0++;
				continue;
			}
		}
		break;
	}
	if (i0 >= words.length) return outcome;
	const cmdWord = words[i0];
	const cmdName = (cmdWord.split("/").pop() ?? cmdWord).replace(/^bash[.-]/, "bash");
	const rest = words.slice(i0 + 1);
	const args = nonFlagArgs(words, cmdName);

	const fail = (dest: string, reason: string): AnalysisOutcome => {
		outcome.block = reason;
		outcome.blockedDest = dest;
		return outcome;
	};
	/** Valida destinos; strict = bloquear también los irresolubles (todo comando de escritura). */
	const check = (targets: string[], strict: boolean, how: string): boolean => {
		for (const raw of targets) {
			if (raw === "__CWD__") {
				if (!insideZones(cwd, zones)) return !fail(cwd, `${how}: cwd ${cwd} fuera de zona`);
				outcome.writes.push(cwd);
				continue;
			}
			const t = resolveBashTarget(raw, cwd);
			if (t === null) {
				if (strict) return !fail(raw, `${how}: destino con variable sin resolver (${raw})`);
				continue;
			}
			outcome.writes.push(t);
			if (!insideZones(t, zones)) return !fail(t, `${how} fuera de zona: ${t}`);
		}
		return true;
	};

	// Código embebido: bash -c / python -c / node -e …
	const inlineIdx = rest.findIndex((w) => INLINE_CODE_FLAGS.has(w));
	if (inlineIdx !== -1 && inlineIdx < 2 && depth < 4 && rest.length > inlineIdx + 1) {
		const code = rest.slice(inlineIdx + 1).join(" ");
		if (/^(bash|sh|zsh|dash|ksh)$/.test(cmdName)) {
			const inner = analyzeBashCommand(code, cwd, zones, depth + 1);
			if (inner.block) {
				outcome.block = `bash -c → ${inner.block}`;
				outcome.blockedDest = inner.blockedDest;
				return outcome;
			}
			outcome.writes.push(...inner.writes);
			return outcome;
		}
		if (/^(python|python3|python3\.\d+|node|bun|deno|perl|ruby)/.test(cmdName)) {
			if (CODE_WRITE_PATTERNS.some((re) => re.test(code))) {
				const paths = extractAbsPaths(code);
				if (paths.length === 0) {
					return fail("(código)", `${cmdName} ${rest[inlineIdx]}: código con escrituras y sin rutas verificables`);
				}
				for (const p of paths) {
					const t = resolveBashTarget(p, cwd);
					if (t === null || !insideZones(t, zones)) {
						return fail(p, `${cmdName} ${rest[inlineIdx]}: escribe en ${p} (fuera de zona o irresoluble)`);
					}
					outcome.writes.push(t);
				}
			}
			return outcome;
		}
	}

	// xargs <cmd …>: re-analiza el comando interno como comando simple
	if (cmdName === "xargs" && rest.length && depth < 4) {
		const innerWords = rest.filter((w) => w !== "--");
		if (innerWords.length) {
			const inner = analyzeSimpleCommand({ words: ["x", ...innerWords], redirectTargets: [] }, cwd, zones, depth + 1);
			if (inner.block) {
				outcome.block = `xargs → ${inner.block}`;
				outcome.blockedDest = inner.blockedDest;
				return outcome;
			}
			outcome.writes.push(...inner.writes);
		}
		return outcome;
	}

	// find … -delete / -fprint FILE
	if (cmdName === "find") {
		if (words.some((w) => w === "-delete" || w === "-rm")) {
			const paths: string[] = [];
			for (const w of rest) {
				if (w.startsWith("-") || w.startsWith("(") || w.startsWith(")")) break;
				paths.push(w);
			}
			if (!check(paths, true, "find -delete")) return outcome;
		}
		const fi = rest.findIndex((w) => w === "-fprint" || w === "-fprintf" || w === "-fls");
		if (fi !== -1 && rest[fi + 1] && !check([rest[fi + 1]], true, "find -fprint")) return outcome;
		return outcome;
	}

	// awk/gawk: redirecciones dentro del programa ('{print > "ruta"}')
	if (/^(g?awk|mawk)$/.test(cmdName)) {
		const targets: string[] = [];
		for (const w of rest) {
			const inline = />{1,2}\s*["']([^"']+)["']/g;
			let m: RegExpExecArray | null;
			while ((m = inline.exec(w)) !== null) targets.push(m[1]);
		}
		if (!check(targets, true, "awk print>")) return outcome;
		return outcome;
	}

	// git
	if (cmdName === "git") {
		// -C RUTA consume la ruta: el subcomando es el primer no-flag que no sea su valor
		const cIdx = rest.findIndex((w) => w === "-C");
		const skip = new Set(cIdx !== -1 ? [cIdx, cIdx + 1] : []);
		const sub = (() => {
			for (let k = 0; k < rest.length; k++) {
				if (skip.has(k) || rest[k].startsWith("-")) continue;
				return rest[k];
			}
			return undefined;
		})();
		const mutating = new Set([
			"add", "commit", "checkout", "switch", "merge", "rebase", "reset", "cherry-pick",
			"revert", "clean", "restore", "tag", "stash", "apply", "am", "init", "clone",
			"worktree", "submodule", "mv", "rm", "gc", "prune",
		]);
		if (mutating.has(sub ?? "")) {
			if (sub === "clone") {
				// último argumento no-flag = destino del clone (cwd si no hay)
				const cloneArgs = nonFlagArgs(["git", ...rest.filter((w) => w !== sub)], "git").filter((x) => x !== sub);
				const d = cloneArgs.length ? cloneArgs[cloneArgs.length - 1] : "__CWD__";
				if (!check([d], true, "git clone")) return outcome;
				return outcome;
			}
			if (sub === "worktree") {
				const after = rest.slice(rest.indexOf("worktree") + 1);
				const addIdx = after.indexOf("add");
				const pathArg = addIdx !== -1 ? after.slice(addIdx + 1).find((w) => !w.startsWith("-")) : undefined;
				if (pathArg && !check([pathArg], true, "git worktree add")) return outcome;
				return outcome;
			}
			const cIdx = rest.findIndex((w) => w === "-C");
			const repoRoot = cIdx !== -1 && rest[cIdx + 1] ? rest[cIdx + 1] : cwd;
			if (!check([repoRoot], false, `git ${sub}`)) return outcome;
			return outcome;
		}
		return outcome;
	}

	// gestores de paquetes node
	if (["npm", "pnpm", "yarn", "bun"].includes(cmdName)) {
		const sub = rest.find((w) => !w.startsWith("-")) ?? "";
		const mutating = new Set(["install", "i", "add", "update", "ci", "uninstall", "remove", "link", "create", "init", "dlx"]);
		if (mutating.has(sub)) {
			if (rest.includes("-g") || rest.includes("--global")) {
				return fail("(global)", `${cmdName} ${sub} -g: instalación global fuera de zona`);
			}
			const pIdx = rest.findIndex((w) => w === "--prefix");
			const target = pIdx !== -1 && rest[pIdx + 1] ? rest[pIdx + 1] : cwd;
			if (!check([target], true, `${cmdName} ${sub}`)) return outcome;
			return outcome;
		}
		return outcome;
	}

	// pip
	const isPip = ["pip", "pip3"].includes(cmdName) || (/^python3(\.\d+)?$/.test(cmdName) && rest[0] === "-m" && rest[1] === "pip");
	if (isPip) {
		const r = cmdName.startsWith("python") ? rest.slice(2) : rest;
		if (r.includes("install")) {
			if (r.includes("--user")) return fail("~/.local/lib", "pip install --user: site-packages fuera de zona");
			const tIdx = r.indexOf("--target");
			if (tIdx !== -1 && r[tIdx + 1]) {
				if (!check([r[tIdx + 1]], true, "pip install --target")) return outcome;
				return outcome;
			}
			return fail("(site-packages)", "pip install: escribe en site-packages (~/.local/lib), fuera de zona");
		}
		return outcome;
	}

	// crontab: modifica el cron del usuario (destino no zonificado)
	if (cmdName === "crontab") {
		if (!rest.every((w) => w === "-l")) {
			return fail("(crontab)", "crontab modifica el cron del usuario (destino no zonificado)");
		}
		return outcome;
	}

	// sqlite3 DB "INSERT/UPDATE/…"
	if (cmdName === "sqlite3" && args.length) {
		const sqlish = rest.slice(1).join(" ");
		if (/\b(INSERT|UPDATE|DELETE|DROP|CREATE|REPLACE|ATTACH)\b/i.test(sqlish)) {
			if (!check([args[0]], true, "sqlite3")) return outcome;
		}
		return outcome;
	}

	// curl/wget: destinos de descarga explícitos (-o/-O/--output…)
	if (cmdName === "curl" || cmdName === "wget") {
		const targets: string[] = [];
		for (let k = 0; k < rest.length; k++) {
			const w = rest[k];
			if (w === "-o" || w === "--output") {
				if (rest[k + 1]) targets.push(rest[++k]);
			} else if (w === "-O" || w === "--output-document") {
				const n = rest[k + 1];
				if (n && !n.startsWith("-")) {
					targets.push(n);
					k++;
				} else {
					targets.push("__CWD__"); // wget -O URL: guarda con nombre de la URL en cwd
				}
			} else if (w.startsWith("--output=") || w.startsWith("--output-document=")) {
				targets.push(w.slice(w.indexOf("=") + 1));
			}
		}
		if (!check(targets, true, cmdName)) return outcome;
		return outcome;
	}

	// dd of=FILE
	if (cmdName === "dd") {
		const of = rest.find((w) => w.startsWith("of="));
		if (of && !check([of.slice(3)], true, "dd of=")) return outcome;
		return outcome;
	}

	// sed -i / perl -i: archivos operando (el primer arg es el programa)
	if (cmdName === "sed" || cmdName === "perl") {
		if (rest.some((w) => /^-i/.test(w)) && args.length > 1) {
			if (!check(args.slice(1), true, cmdName)) return outcome;
		}
		return outcome;
	}

	if (WRITE_ALL_ARGS.has(cmdName)) {
		if (!check(args, true, cmdName)) return outcome;
		return outcome;
	}
	if (WRITE_LAST_ARG.has(cmdName)) {
		if (!check(args.length ? [args[args.length - 1]] : [], true, cmdName)) return outcome;
		// -t/--target-directory DIR: destino explícito
		const tIdx = rest.findIndex((w) => w === "-t" || w === "--target-directory");
		if (tIdx !== -1 && rest[tIdx + 1] && !check([rest[tIdx + 1]], true, `${cmdName} -t`)) return outcome;
		return outcome;
	}
	if (cmdName === "mkdir") {
		if (!check(args, true, cmdName)) return outcome;
		return outcome;
	}
	// Comando desconocido (CLIs de confianza del sistema): sin destinos que validar.
	return outcome;
}

/** Analiza una línea bash completa (recursivo en $(…) y bash -c). */
function analyzeBashCommand(command: string, cwd: string, zones: string[], depth: number): AnalysisOutcome {
	const outcome: AnalysisOutcome = { writes: [] };
	if (depth > 4) {
		outcome.block = "anidamiento demasiado profundo";
		return outcome;
	}
	const { toks, subs } = tokenize(command);
	for (const cmd of parseSimpleCommands(toks)) {
		const res = analyzeSimpleCommand(cmd, cwd, zones, depth);
		if (res.block) return res;
		outcome.writes.push(...res.writes);
	}
	for (const sub of subs) {
		const res = analyzeBashCommand(sub, cwd, zones, depth + 1);
		if (res.block) {
			outcome.block = `$(…) → ${res.block}`;
			outcome.blockedDest = res.blockedDest;
			return outcome;
		}
		outcome.writes.push(...res.writes);
	}
	return outcome;
}

// ── Extensión ───────────────────────────────────────────────────────────────
export default function writeGuard(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		const cfg = loadConfig();
		const active = sessionIsActive(ctx.cwd, cfg);
		logEvent("init", {
			version: VERSION,
			encargo: ENCARGO,
			profile: process.env.PI_PROFILE ?? null,
			cwd: ctx.cwd,
			active,
			enabled: cfg.enabled,
		});
		if (active && ctx.mode === "tui") {
			ctx.ui.setStatus?.("write-guard", "🔒 write-guard");
		}
	});

	pi.on("tool_call", (event: ToolCallEvent, ctx): ToolCallEventResult | undefined => {
		const cfg = loadConfig();
		if (!sessionIsActive(ctx.cwd, cfg)) return undefined;

		if (event.toolName === "write" || event.toolName === "edit") {
			const input = event.input as { path?: unknown };
			const rawPath = typeof input.path === "string" ? input.path : "";
			if (!rawPath) return undefined; // sin path, la propia tool fallará
			const target = normalize(expandTilde(rawPath));
			if (insideZones(target, zonesFor(ctx.cwd, cfg))) {
				logEvent("allow-write", { tool: event.toolName, dest: target, cwd: ctx.cwd });
				return undefined;
			}
			return blockResult(event.toolName, target, "herramienta de escritura", ctx.cwd, cfg);
		}

		if (event.toolName === "bash" || event.toolName === "powershell") {
			const input = event.input as { command?: unknown; script?: unknown };
			const command = typeof input.command === "string" ? input.command : typeof input.script === "string" ? input.script : "";
			if (!command) return undefined;
			if (event.toolName === "powershell") {
				// PowerShell: fuera del analizador; fail-safe ante cmdlets de escritura
				if (/(?:Out-File|Set-Content|Add-Content|New-Item|Remove-Item|Move-Item|Copy-Item|Export-Csv|Export-Clixml)/i.test(command)) {
					return blockResult(event.toolName, "(powershell)", "cmdlet de escritura no analizable por zonas", ctx.cwd, cfg, command);
				}
				return undefined;
			}
			const zones = zonesFor(ctx.cwd, cfg);
			const verdict = analyzeBashCommand(command, ctx.cwd, zones, 0);
			if (verdict.block) {
				return blockResult(
					"bash",
					verdict.blockedDest ?? "(bash)",
					verdict.block,
					ctx.cwd,
					cfg,
					command,
				);
			}
			if (verdict.writes.length) {
				logEvent("allow-write", { tool: "bash", dest: verdict.writes.slice(0, 5), cwd: ctx.cwd, command: command.slice(0, 200) });
			}
			return undefined;
		}

		return undefined; // otras herramientas (read, grep, MCP, …) no escriben disco
	});

	pi.registerCommand("write-guard", {
		description: "Estado de la guarda de escritura ROT (enc-59c26f58)",
		handler: async (_name, ctx) => {
			const cfg = loadConfig();
			const active = sessionIsActive(ctx.cwd, cfg);
			const lines = [
				`write-guard v${VERSION} (${ENCARGO}) — ${active ? "ACTIVA en esta sesión" : "inactiva (no es sesión assistant/ROT)"}`,
				`Config: ${CONFIG_PATH} (enabled=${cfg.enabled}, notify=${cfg.notify})`,
				`Zonas: ${zonesDescription(ctx.cwd, cfg)}`,
				`Log: ${LOG_PATH}`,
			];
			try {
				const tail = readFileSync(LOG_PATH, "utf8").trimEnd().split("\n").slice(-5);
				lines.push("Últimos eventos:");
				for (const l of tail) {
					try {
						const e = JSON.parse(l) as { ts: string; event: string; tool?: string; dest?: string | string[] };
						const dest = Array.isArray(e.dest) ? e.dest.join(",") : (e.dest ?? "");
						lines.push(`  ${e.ts} ${e.event} ${e.tool ?? ""} ${dest}`.trimEnd());
					} catch {
						lines.push(`  ${l.slice(0, 120)}`);
					}
				}
			} catch {
				lines.push("Sin eventos aún.");
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
