import { promises as fs } from "fs";
import { homedir } from "os";
import { join } from "path";
import { NextResponse } from "next/server";
import {
  buildInspectorSnapshot,
  parseAgentFile,
  parseMcpConfig,
  parseSkillFrontmatter,
  type AgentCard,
  type InspectorSnapshot,
  type SkillInfo,
} from "@/lib/agents-inspector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 60_000;

const home = homedir();

let cache: { data: InspectorSnapshot; readAt: number } | null = null;
let inFlight: Promise<InspectorSnapshot> | null = null;

/** Ruta relativa al home: nunca expone el absoluto completo. */
function tildePath(absolute: string): string {
  if (home && (absolute === home || absolute.startsWith(`${home}/`))) {
    return `~${absolute.slice(home.length)}`;
  }
  return absolute;
}

async function readText(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Agentes desde ~/.pi/agent/agents/*.md. */
async function readAgents(): Promise<AgentCard[]> {
  const dir = join(home, ".pi/agent/agents");
  const files = (await listFiles(dir)).filter((f) => f.endsWith(".md")).sort();
  const agents: AgentCard[] = [];
  for (const file of files) {
    const path = join(dir, file);
    const contents = await readText(path);
    if (contents === null) continue;
    try {
      agents.push(parseAgentFile(contents, tildePath(path)));
    } catch {
      // Archivo corrupto: se omite sin tumbar la fuente.
    }
  }
  return agents;
}

/** Skills desde un directorio padre: cada subdirectorio con SKILL.md. */
async function readSkills(
  dir: string,
  source: "user" | "project",
): Promise<SkillInfo[]> {
  let subdirs: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    subdirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }

  const skills: SkillInfo[] = [];
  for (const sub of subdirs) {
    const skillPath = join(dir, sub, "SKILL.md");
    const contents = await readText(skillPath);
    if (contents === null) continue;
    try {
      const parsed = parseSkillFrontmatter(contents);
      skills.push({
        name: parsed.name || sub,
        description: parsed.description,
        source,
        path: tildePath(skillPath),
      });
    } catch {
      // SKILL.md ilegible: se omite.
    }
  }
  return skills;
}

async function readSnapshot(): Promise<InspectorSnapshot> {
  // try/catch por fuente: una fuente caída no tumba la respuesta.
  const [agents, userSkills, projectSkills, mcpRaw, settingsRaw] =
    await Promise.all([
      readAgents().catch(() => [] as AgentCard[]),
      readSkills(join(home, ".agents/skills"), "user").catch(
        () => [] as SkillInfo[],
      ),
      readSkills(join(home, ".pi/agent/skills"), "project").catch(
        () => [] as SkillInfo[],
      ),
      readText(join(home, ".pi/agent/mcp.json")),
      readText(join(home, ".pi/agent/settings.json")),
    ]);

  let mcpServers: ReturnType<typeof parseMcpConfig> = [];
  try {
    mcpServers = mcpRaw ? parseMcpConfig(mcpRaw) : [];
  } catch {
    mcpServers = [];
  }

  let settingsJson: unknown = null;
  if (settingsRaw) {
    try {
      settingsJson = JSON.parse(settingsRaw);
    } catch {
      settingsJson = null;
    }
  }

  return buildInspectorSnapshot({
    agentsRaw: agents,
    userSkills,
    projectSkills,
    mcpServers,
    settingsJson,
  });
}

export async function GET() {
  if (cache && Date.now() - cache.readAt < CACHE_MS) {
    return NextResponse.json(cache.data);
  }
  if (!inFlight) {
    inFlight = readSnapshot()
      .then((data) => {
        cache = { data, readAt: Date.now() };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  try {
    const data = await inFlight;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer la configuración de agentes" },
      { status: 500 },
    );
  }
}
