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
  const upstreamUrl = new URL(env.BACKEND_ORIGIN);
  const apiPath = incomingUrl.pathname.slice('/api'.length);
  upstreamUrl.pathname = `${upstreamUrl.pathname.replace(/\/$/, '')}/api${apiPath}`;
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');

  const upstreamResponse = await fetch(
    new Request(upstreamUrl.toString(), {
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      headers,
      method: request.method,
      redirect: 'manual',
    }),
  );

  return new Response(upstreamResponse.body, {
    headers: upstreamResponse.headers,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });
}
