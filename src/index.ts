interface Env {
  ASSETS: Fetcher;
}

const APP_NAME = "Guess It India";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, app: APP_NAME });
    }

    return env.ASSETS.fetch(request);
  },
};
