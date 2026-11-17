export const dynamic = 'force-dynamic';

// This is intentionally a browser key, restricted to Maps Embed and the staging
// HTTPS referrer. Never use GOOGLE_MAPS_API_KEY (production Address Validation).
export function GET() {
  if (process.env.NEXT_PUBLIC_ATTENDANCE_TEST !== 'true') return new Response(null, { status: 404 });
  const browserKey = process.env.GOOGLE_MAPS_EMBED_BROWSER_KEY?.trim();
  const enabled = Boolean(browserKey && /^AIza[\w-]{20,}$/.test(browserKey));
  return Response.json({ enabled, ...(enabled ? { browserKey } : {}) }, {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
