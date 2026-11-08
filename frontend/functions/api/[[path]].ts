interface PagesEnvironment {
  BACKEND_ORIGIN?: string;
}

interface PagesContext {
  env: PagesEnvironment;
  request: Request;
}

export async function onRequest({ env, request }: PagesContext): Promise<Response> {
  if (!env.BACKEND_ORIGIN) {
    return Response.json(
      {
        code: 'DEMO_BACKEND_OFFLINE',
        message: 'Backend demo chưa được kết nối hoặc đang tạm dừng.',
      },
      { status: 503 },
    );
  }

  const incomingUrl = new URL(request.url);
  let upstreamUrl: URL;
  try { upstreamUrl = new URL(env.BACKEND_ORIGIN); }
  catch { return unavailable(); }
  if (upstreamUrl.protocol !== 'https:' || upstreamUrl.username || upstreamUrl.password) return unavailable();
  const apiPath = incomingUrl.pathname.slice('/api'.length);
  upstreamUrl.pathname = `${upstreamUrl.pathname.replace(/\/$/, '')}/api${apiPath}`;
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  // Preserve Origin for the Backend's cookie-mutation checks. No retry of writes.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const upstreamResponse = await fetch(
      new Request(upstreamUrl.toString(), new Request(request, {
        headers, redirect: 'manual', signal: controller.signal,
      })),
    );

    if (upstreamResponse.status >= 500 && !upstreamResponse.headers.get('content-type')?.includes('application/json')) return unavailable();
    return new Response(upstreamResponse.body, {
      headers: upstreamResponse.headers,
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
    });
  } catch { return unavailable(); }
  finally { clearTimeout(timer); }
}

function unavailable(): Response {
  return Response.json({ code: 'DEMO_BACKEND_OFFLINE', message: 'Backend demo đang mất kết nối hoặc tạm dừng. Thử kết nối lại; không gửi lại thao tác tự động.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
