import { NextResponse } from "next/server";
import { join } from "path";
import { applyVisionAssessments, getPostStudio, postStudioRoot, writeValidation } from "@/lib/post-studio";
import { runVisionValidation } from "@/lib/post-studio-vision";
import { POST_ID_RE } from "@/lib/post-studio-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/post-studio/validate — { post }: one full-post vision pass over
 * the CURRENT selection (photos downscaled with sharp, video frames via
 * CT126 ffmpeg, one multimodal call through the LiteLLM gateway). Writes
 * validation.json (selectionHash-scoped) and fills missing per-item vision
 * gaps in studio.json. `decide` refuses to lock a post without a fresh,
 * passing validation — this is the visual gate from enc-ebe31041.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400, headers: NO_STORE });
  }
  const post = typeof body.post === "string" ? body.post : "";
  if (!POST_ID_RE.test(post)) {
    return NextResponse.json({ error: "BAD_POST_ID" }, { status: 400, headers: NO_STORE });
  }
  const snapshot = getPostStudio(post);
  if (!snapshot) {
    return NextResponse.json({ error: "POST_NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }
  if (snapshot.state.decidedAt) {
    return NextResponse.json({ error: "STUDIO_LOCKED" }, { status: 409, headers: NO_STORE });
  }
  const outcome = await runVisionValidation(
    {
      definition: snapshot.definition,
      state: snapshot.state,
      mediaRoot: join(postStudioRoot(), post, "media"),
    },
    {
      saveValidation: (validation) => writeValidation(post, validation),
      fillVision: async (assessments) => {
        const applied = await applyVisionAssessments(post, assessments);
        if (!applied.ok) throw new Error(applied.error);
      },
    },
  );
  if (!outcome.ok || !outcome.validation) {
    return NextResponse.json({ error: outcome.error ?? "VISION_FAILED" }, { status: 502, headers: NO_STORE });
  }
  const fresh = getPostStudio(post);
  return NextResponse.json(
    {
      definition: fresh?.definition ?? snapshot.definition,
      state: fresh?.state ?? snapshot.state,
      validation: outcome.validation,
      filled: outcome.filled ?? [],
    },
    { headers: NO_STORE },
  );
}
