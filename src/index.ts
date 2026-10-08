import { categories, isCategoryId } from "./game/categories.ts";
import { pickSecret } from "./game/secrets.ts";

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

    if (url.pathname === "/api/categories" && request.method === "GET") {
      return Response.json({ categories });
    }

    if (url.pathname === "/api/dev/pick-secret" && request.method === "POST") {
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
      }

      const category =
        typeof body === "object" && body !== null && "category" in body
          ? body.category
          : undefined;

      if (!isCategoryId(category)) {
        return Response.json(
          { error: "Invalid category. Choose one of the available category IDs." },
          { status: 400 },
        );
      }

      return Response.json({
        category,
        secret: pickSecret(category).answer,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
