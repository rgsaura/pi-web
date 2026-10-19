import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  parseAgentFile,
  parseSkillFrontmatter,
  parseMcpConfig,
  buildInspectorSnapshot,
} = await jiti.import("./agents-inspector.ts");

const AGENT_WITH_SKILLS = `---
name: rot
description: Agente asistente personal ROT
model: litellm/failover-fast
skills: personal-notifications, exo-now, exo-context
---
Asistente operativo de ROT para Rodrigo.

Reglas:
- Ultra-conciso y directo.
`;

const AGENT_WITHOUT_SKILLS = `---
name: dev
description: "Ingeniero de software"
model: 'litellm/failover-normal'
---
Ingeniero para tareas de implementación.

Cuerpo con varias líneas.`;

const AGENT_NO_FRONTMATTER = "Solo cuerpo sin frontmatter.";

test("parseAgentFile: frontmatter completo con skills", () => {
  const agent = parseAgentFile(AGENT_WITH_SKILLS, "~/.pi/agent/agents/rot.md");
  assert.equal(agent.name, "rot");
  assert.equal(agent.description, "Agente asistente personal ROT");
  assert.equal(agent.model, "litellm/failover-fast");
  assert.deepEqual(agent.skills, [
    "personal-notifications",
    "exo-now",
    "exo-context",
  ]);
  assert.equal(agent.sourcePath, "~/.pi/agent/agents/rot.md");
  assert.ok(agent.prompt.startsWith("Asistente operativo de ROT"));
  assert.ok(agent.prompt.endsWith("directo."));
  assert.ok(!agent.prompt.includes("---"));
  assert.ok(!agent.prompt.startsWith("\n"));
});

test("parseAgentFile: sin skills y valores entrecomillados", () => {
  const agent = parseAgentFile(
    AGENT_WITHOUT_SKILLS,
    "~/.pi/agent/agents/dev.md",
  );
  assert.equal(agent.name, "dev");
  assert.equal(agent.description, "Ingeniero de software");
  assert.equal(agent.model, "litellm/failover-normal");
  assert.deepEqual(agent.skills, []);
  assert.equal(
    agent.prompt,
    "Ingeniero para tareas de implementación.\n\nCuerpo con varias líneas.",
  );
});

test("parseAgentFile: sin frontmatter cae al nombre del archivo", () => {
  const agent = parseAgentFile(
    AGENT_NO_FRONTMATTER,
    "~/.pi/agent/agents/worker.md",
  );
  assert.equal(agent.name, "worker");
  assert.equal(agent.model, undefined);
  assert.equal(agent.description, undefined);
  assert.equal(agent.prompt, AGENT_NO_FRONTMATTER);
});

test("parseSkillFrontmatter: extrae name y description", () => {
  const skill = parseSkillFrontmatter(`---
name: exo-now
description: Situación actual de Rodrigo (zona, batería, calendario).
allowed-tools: Bash, Read
metadata:
  owner: custom
---
# Contenido

Texto del cuerpo.
`);
  assert.equal(skill.name, "exo-now");
  assert.equal(
    skill.description,
    "Situación actual de Rodrigo (zona, batería, calendario).",
  );
});

test("parseMcpConfig: formato mcpServers con command", () => {
  const servers = parseMcpConfig(
    JSON.stringify({
      mcpServers: {
        beeper: { command: "ssh", args: ["-o", "BatchMode=yes"] },
        empty: { description: "sin comando ni url" },
      },
    }),
  );
  assert.deepEqual(servers, [{ name: "beeper", command: "ssh", url: undefined }]);
});

test("parseMcpConfig: formato servers con url y JSON inválido", () => {
  const servers = parseMcpConfig(
    JSON.stringify({
      servers: {
        fetch: { url: "https://mcp.example.com/sse" },
      },
    }),
  );
  assert.deepEqual(servers, [
    { name: "fetch", command: undefined, url: "https://mcp.example.com/sse" },
  ]);
  assert.deepEqual(parseMcpConfig("no-es-json{{"), []);
  assert.deepEqual(parseMcpConfig("[]"), []);
  assert.deepEqual(parseMcpConfig("{}"), []);
});

test("buildInspectorSnapshot: dedupe de skills gana project y ordena", () => {
  const userSkills = [
    {
      name: "exo-now",
      description: "Versión user",
      source: "user",
      path: "~/.agents/skills/exo-now/SKILL.md",
    },
    {
      name: "search",
      description: "Búsqueda web",
      source: "user",
      path: "~/.agents/skills/search/SKILL.md",
    },
  ];
  const projectSkills = [
    {
      name: "exo-now",
      description: "Versión project",
      source: "project",
      path: "~/.pi/agent/skills/exo-now/SKILL.md",
    },
  ];
  const snapshot = buildInspectorSnapshot({
    agentsRaw: [
      {
        name: "rot",
        skills: ["exo-now"],
        prompt: "p",
        sourcePath: "~/.pi/agent/agents/rot.md",
      },
    ],
    userSkills,
    projectSkills,
    mcpServers: [{ name: "beeper", command: "ssh" }],
    settingsJson: {
      defaultModel: "failover-normal",
      defaultTools: ["-web_search", "Read", "-tasks"],
    },
  });
  assert.equal(snapshot.agents.length, 1);
  assert.deepEqual(
    snapshot.skills.map((s) => `${s.source}:${s.description}`),
    ["project:Versión project", "user:Búsqueda web"],
  );
  assert.equal(snapshot.defaultModel, "failover-normal");
  assert.deepEqual(snapshot.disabledTools, ["web_search", "tasks"]);
});

test("buildInspectorSnapshot: settings ausentes o no objeto", () => {
  const snapshot = buildInspectorSnapshot({
    agentsRaw: [],
    userSkills: [],
    projectSkills: [],
    mcpServers: [],
    settingsJson: null,
  });
  assert.equal(snapshot.defaultModel, undefined);
  assert.deepEqual(snapshot.disabledTools, []);
  assert.deepEqual(snapshot.skills, []);
});

test("buildInspectorSnapshot: agentes ordenados por nombre", () => {
  const snapshot = buildInspectorSnapshot({
    agentsRaw: [
      { name: "planner", skills: [], prompt: "p", sourcePath: "a" },
      { name: "dev", skills: [], prompt: "p", sourcePath: "b" },
    ],
    userSkills: [],
    projectSkills: [],
    mcpServers: [],
    settingsJson: {},
  });
  assert.deepEqual(
    snapshot.agents.map((a) => a.name),
    ["dev", "planner"],
  );
});
