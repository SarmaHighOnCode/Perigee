const allowed = new Set(['stats', 'graph/demo', 'releases']);

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  const origin = process.env.PERIGEE_API_URL;
  if (!allowed.has(path) || !origin) return Response.json({ error: 'not_found' }, { status: 404 });
  const response = await fetch(`${origin.replace(/\/$/, '')}/v1/public/${path}`, { next: { revalidate: 300 } });
  return new Response(response.body, { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
}
