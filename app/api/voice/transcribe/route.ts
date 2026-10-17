import { NextResponse, type NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveApiKey(): string | null {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envFile = join(homedir(), ".config/exo-services/pi-env");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^OPENAI_API_KEY=(.*)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

/**
 * POST /api/voice/transcribe
 * Transcribes audio via OpenAI Whisper API.
 * Accepts multipart/form-data with "audio" file or raw audio body.
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY no disponible para transcripción" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: "Se requiere un archivo de audio en el campo 'audio'" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Prepare multipart request to OpenAI Whisper API
    const boundary = "----WhisperFormBoundary" + Math.random().toString(36).substring(2);
    const crlf = "\r\n";

    let header = "";
    header += `--${boundary}${crlf}`;
    header += `Content-Disposition: form-data; name="file"; filename="audio.webm"${crlf}`;
    header += `Content-Type: ${audioFile.type || "audio/webm"}${crlf}${crlf}`;

    let fields = `${crlf}--${boundary}${crlf}`;
    fields += `Content-Disposition: form-data; name="model"${crlf}${crlf}`;
    fields += `whisper-1${crlf}`;
    fields += `--${boundary}${crlf}`;
    fields += `Content-Disposition: form-data; name="language"${crlf}${crlf}`;
    fields += `es${crlf}`;
    fields += `--${boundary}--${crlf}`;

    const body = Buffer.concat([
      Buffer.from(header, "utf8"),
      buffer,
      Buffer.from(fields, "utf8"),
    ]);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { ok: false, error: `Error Whisper OpenAI (${res.status}): ${errText}` },
        { status: res.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = await res.json();
    return NextResponse.json(
      { ok: true, text: data.text || "" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Fallo de transcripción: ${msg}` },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
