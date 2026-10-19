/**
 * Parsers puros (sin IO) para la vista Inspector de Agentes.
 * La lectura de disco vive en app/api/agents-inspector/route.ts;
 * aquí solo transformamos texto/JSON ya leídos.
 */

export interface AgentCard {
  name: string;
  description?: string;
  model?: string;
  skills: string[];
  /** Cuerpo del archivo tras el frontmatter, recortado. */
  prompt: string;
  /** Ruta relativa al home, p.ej. '~/.pi/agent/agents/rot.md'. */
  sourcePath: string;
}

export interface SkillInfo {
  name: string;
  description?: string;
  source: "user" | "project";
  /** Ruta relativa al home, p.ej. '~/.agents/skills/exo-now/SKILL.md'. */
  path: string;
}

export interface McpServer {
  name: string;
  command?: string;
  url?: string;
}

export interface InspectorSnapshot {
  agents: AgentCard[];
  skills: SkillInfo[];
  mcpServers: McpServer[];
  defaultModel?: string;
  disabledTools: string[];
}

/** Quita comillas envolventes y espacios de un valor de frontmatter. */
function cleanValue(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.trim();
}

/**
 * Frontmatter YAML simple: bloque inicial entre líneas '---', claves
 * 'key: value' por línea. Valores de listas (skills) separados por comas.
 * Devuelve un mapa clave → valor crudo (string).
 */
function parseSimpleFrontmatter(
  contents: string,
): { frontmatter: Record<string, string>; body: string } {
  const normalized = contents.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) {
    return { frontmatter: {}, body: normalized };
  }
  const firstLineEnd = normalized.indexOf("\n");
  if (firstLineEnd === -1) {
    return { frontmatter: {}, body: "" };
  }
  const rest = normalized.slice(firstLineEnd + 1);
  const endMatch = rest.match(/^(---|\.\.\.)\s*(\r?\n|$)/m);
  if (!endMatch || endMatch.index === undefined) {
    return { frontmatter: {}, body: normalized };
  }
  const frontmatterBlock = rest.slice(0, endMatch.index);
  const body = rest.slice(endMatch.index + endMatch[0].length);

  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterBlock.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (match) {
      frontmatter[match[1]] = match[2];
    }
  }
  return { frontmatter, body };
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => cleanValue(item))
    .filter((item) => item.length > 0);
}

function baseName(sourcePath: string): string {
  const withoutSlash = sourcePath.split("/").pop() ?? sourcePath;
  const dot = withoutSlash.lastIndexOf(".");
  return dot > 0 ? withoutSlash.slice(0, dot) : withoutSlash;
}

/**
 * Parsea un archivo de agente Markdown con frontmatter
 * (name/description/model/skills) y el cuerpo como prompt.
 */
export function parseAgentFile(contents: string, sourcePath = ""): AgentCard {
  const { frontmatter, body } = parseSimpleFrontmatter(contents);
  const skillsRaw = frontmatter["skills"];
  return {
    name: cleanValue(frontmatter["name"] ?? "") || baseName(sourcePath),
    description: frontmatter["description"]
      ? cleanValue(frontmatter["description"])
      : undefined,
    model: frontmatter["model"] ? cleanValue(frontmatter["model"]) : undefined,
    skills: skillsRaw ? splitList(skillsRaw) : [],
    prompt: body.trim(),
    sourcePath,
  };
}

/** Extrae name y description del frontmatter de un SKILL.md. */
export function parseSkillFrontmatter(contents: string): {
  name: string;
  description?: string;
} {
  const { frontmatter } = parseSimpleFrontmatter(contents);
  return {
    name: cleanValue(frontmatter["name"] ?? ""),
    description: frontmatter["description"]
      ? cleanValue(frontmatter["description"])
      : undefined,
  };
}

/** Lee el command/url de una entrada de servidor MCP, tolerante a formas anidadas. */
function serverEntry(value: unknown): { command?: string; url?: string } {
  if (typeof value === "string") {
    return { command: value };
  }
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  let command: string | undefined;
  let url: string | undefined;

  const rawCommand = record["command"];
  if (typeof rawCommand === "string") command = rawCommand;
  else if (rawCommand && typeof rawCommand === "object") {
    const nested = (rawCommand as Record<string, unknown>)["command"];
    if (typeof nested === "string") command = nested;
  }

  const rawUrl = record["url"];
  if (typeof rawUrl === "string") url = rawUrl;
  else if (rawUrl && typeof rawUrl === "object") {
    const nested = (rawUrl as Record<string, unknown>)["url"];
    if (typeof nested === "string") url = nested;
  }
  return { command, url };
}

/**
 * Parsea una config MCP tolerante: admite {mcpServers:{...}} y
 * {servers:{...}}; cada entrada puede llevar command (stdio) o url (remote).
 */
export function parseMcpConfig(jsonText: string): McpServer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const root = parsed as Record<string, unknown>;
  const table =
    (root["mcpServers"] as Record<string, unknown> | undefined) ??
    (root["servers"] as Record<string, unknown> | undefined);
  if (!table || typeof table !== "object") {
    return [];
  }

  const servers: McpServer[] = [];
  for (const [name, value] of Object.entries(table)) {
    if (value === null || typeof value !== "object") continue;
    const { command, url } = serverEntry(value);
    if (!command && !url) continue;
    servers.push({ name, command, url });
  }
  return servers;
}

/** True si el JSON de settings describe un objeto plano (no array/null). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Compone el snapshot del inspector: agentes ordenados por nombre, catálogo
 * de skills deduplicado (la versión project gana sobre la user) y las
 * herramientas deshabilitadas desde settings.defaultTools ('-web_search').
 */
export function buildInspectorSnapshot(input: {
  agentsRaw: AgentCard[];
  userSkills: SkillInfo[];
  projectSkills: SkillInfo[];
  mcpServers: McpServer[];
  settingsJson: unknown;
}): InspectorSnapshot {
  const { agentsRaw, userSkills, projectSkills, mcpServers, settingsJson } =
    input;

  const byName = new Map<string, SkillInfo>();
  for (const skill of userSkills) {
    if (skill.name) byName.set(skill.name, skill);
  }
  for (const skill of projectSkills) {
    if (skill.name) byName.set(skill.name, skill); // project gana
  }
  const skills = Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const settings = isRecord(settingsJson) ? settingsJson : {};
  const defaultModel =
    typeof settings["defaultModel"] === "string"
      ? (settings["defaultModel"] as string)
      : undefined;

  const disabledTools: string[] = [];
  const defaultTools = settings["defaultTools"];
  if (Array.isArray(defaultTools)) {
    for (const entry of defaultTools) {
      if (typeof entry === "string" && entry.startsWith("-")) {
        const tool = entry.slice(1).trim();
        if (tool) disabledTools.push(tool);
      }
    }
  }

  const agents = [...agentsRaw].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return { agents, skills, mcpServers, defaultModel, disabledTools };
}
