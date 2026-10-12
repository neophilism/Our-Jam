import type { FastifyInstance } from "fastify";
import type { ServerResponse } from "node:http";

/** End only long-lived event streams before Fastify waits for active requests. */
export function registerEventStreamShutdown(app: FastifyInstance) {
  const streams = new Set<ServerResponse>();
  app.addHook("onRequest", async (request, reply) => {
    if (request.routeOptions.url !== "/api/events/:slug/stream") return;
    const response = reply.raw;
    streams.add(response);
    response.once("close", () => { streams.delete(response); });
  });
  app.addHook("preClose", async () => {
    for (const response of streams) {
      if (!response.destroyed && !response.writableEnded) response.end();
    }
    streams.clear();
  });
}
