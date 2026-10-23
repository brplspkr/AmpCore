/**
 * PUT  /api/remote/system-eq   { projectId, bands?, targets? }
 *   Saves the project's system input EQ and pushes changes to its target channels.
 *
 * POST /api/remote/system-eq   { projectId }
 *   Re-sends the whole system EQ to every target.
 *
 * Both return { success, systemEq, failures: [{ mac, channel, error }] }.
 */

import { z } from "zod";
import {
  resendSystemEq,
  systemEqUpdateSchema,
  updateSystemEq,
  type SystemEqUpdateResult
} from "@/lib/remote/system-eq";

export const dynamic = "force-dynamic";

function toResponse(result: SystemEqUpdateResult): Response {
  return Response.json({ success: result.failures.length === 0, systemEq: result.eq, failures: result.failures });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function PUT(request: Request): Promise<Response> {
  const parsed = systemEqUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request payload" }, { status: 400 });
  }
  return toResponse(await updateSystemEq(parsed.data));
}

export async function POST(request: Request): Promise<Response> {
  const parsed = z.object({ projectId: z.string().trim().min(1) }).safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json({ error: "Missing projectId" }, { status: 400 });
  }
  return toResponse(await resendSystemEq(parsed.data.projectId));
}
