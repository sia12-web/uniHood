export async function POST(request: Request): Promise<Response> {
  try {
    // Best-effort read to drain the body; ignore parse errors
    await request.json().catch(() => null);
  } catch {
    // noop
  }
  return new Response(null, { status: 204 });
}
