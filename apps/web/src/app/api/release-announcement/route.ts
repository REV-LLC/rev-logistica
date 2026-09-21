// The release text is captured by next.config.js during the build.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(JSON.parse(process.env.RELEASE_ANNOUNCEMENT_JSON || 'null'), {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
