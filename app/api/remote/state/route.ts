/**
 * GET /api/remote/state?projectId=<id>
 *
 * Snapshot for the phone remote: project list, the chosen project's amps and
 * channels, and its system EQ. Falls back to the first project when
 * projectId is missing or unknown.
 */

import { buildRemoteState } from "@/lib/remote/state";
import { loadSystemEq } from "@/lib/remote/system-eq";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get("projectId");

  try {
    const state = await buildRemoteState(projectId);
    const systemEq = state.projectId ? await loadSystemEq(state.projectId) : null;
    return Response.json({ success: true, ...state, systemEq });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
