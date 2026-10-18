// Voice UI integration check directly against live server on port 30141.
import { chromium } from "playwright";

const base = "http://127.0.0.1:30141";
let browser;
const problems = [];

try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console.error] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3000);

  // 1. Sidebar "Hablar por Voz" button
  const sidebarVoiceBtn = page.locator('button[aria-label="Hablar por voz con ROT"]').first();
  const count = await sidebarVoiceBtn.count();
  if (count === 0) {
    problems.push("Botón 'Hablar por voz' ausente en el sidebar");
  } else {
    console.log("OK: Botón de voz presente en el sidebar");
    await sidebarVoiceBtn.click();
    await page.waitForTimeout(600);

    const modal = page.locator('[role="dialog"][aria-label="Hablar por voz con ROT"]');
    if ((await modal.count()) === 0) {
      problems.push("El modal de voz no se abrió al pulsar el botón del sidebar");
    } else {
      console.log("OK: Modal de voz se abre correctamente");
      const orb = modal.locator('button[aria-label="Conectar llamada de voz"]');
      if ((await orb.count()) === 0) {
        problems.push("El botón/orbe central de voz no está en el modal");
      } else {
        console.log("OK: Orbe central de conexión presente");
      }

      // Close modal
      const closeBtn = modal.locator('button[aria-label="Cerrar modal de voz"]');
      await closeBtn.click();
      await page.waitForTimeout(400);
      if ((await modal.count()) > 0) {
        problems.push("El modal no se cerró tras pulsar la cruz");
      } else {
        console.log("OK: Modal se cierra limpiamente");
      }
    }
  }

  // 2. Chat composer mic button
  const composerMicBtn = page.locator('button[aria-label="Hablar por voz con ROT"]').last();
  if ((await composerMicBtn.count()) === 0) {
    problems.push("Botón de micrófono ausente en la barra del compositor de chat");
  } else {
    console.log("OK: Botón de micrófono presente en el input del chat");
    await composerMicBtn.click();
    await page.waitForTimeout(600);
    const modal = page.locator('[role="dialog"][aria-label="Hablar por voz con ROT"]');
    if ((await modal.count()) === 0) {
      problems.push("El modal de voz no se abrió al pulsar el botón del compositor");
    } else {
      console.log("OK: Modal de voz se abre desde el input de chat");
      const closeBtn = modal.locator('button[aria-label="Cerrar modal de voz"]');
      await closeBtn.click();
      await page.waitForTimeout(400);
    }
  }

  if (problems.length === 0) {
    console.log("\nTODAS LAS PRUEBAS DE INTEGRACIÓN DE VOZ EN LA UI PASARON LIMPIAS.");
  } else {
    console.error(`\nFALLOS:\n${problems.join("\n")}`);
    process.exitCode = 1;
  }
} finally {
  await browser?.close().catch(() => {});
}
