/**
 * POST /api/amp-actions
 *
 * Validates a control command and hands it to executeAmpAction
 * (lib/amp-action-executor.ts), which documents the wire format for every action.
 *
 * Request body (JSON):
 * {
 *   mac:    string,           // target amp MAC e.g. "6A:20:67:18:B5:8A"
 *   action: AmpAction,        // see lib/validation/amp-actions.ts
 *   channel: number,         // channel index (0-based)
 *   value:  boolean | number  // action-specific payload
 * }
 */

import { executeAmpAction } from "@/lib/amp-action-executor";
import { ampActionRequestSchema } from "@/lib/validation/amp-actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ampActionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid request payload",
        issues: parsed.error.issues
      },
      { status: 400 }
    );
  }

  return executeAmpAction(parsed.data);
}
