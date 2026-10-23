/**
 * POST /api/remote/control
 *
 * The subset of /api/amp-actions the phone remote may send: output volume and
 * mutes. Everything else (limiters, crossovers, FIR, renames…) stays desktop-only.
 *
 * Body: { mac, channel, action: "volumeOut" | "muteOut" | "muteIn", value }
 */

import { executeAmpAction } from "@/lib/amp-action-executor";
import { ampActionRequestSchema } from "@/lib/validation/amp-actions";

export const dynamic = "force-dynamic";

const REMOTE_ACTIONS = new Set(["volumeOut", "muteOut", "muteIn"]);

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ampActionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request payload" }, { status: 400 });
  }

  if (!REMOTE_ACTIONS.has(parsed.data.action)) {
    return Response.json({ error: `Action ${parsed.data.action} is not available from the remote` }, { status: 403 });
  }

  return executeAmpAction(parsed.data);
}
