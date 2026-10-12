import type { FastifyInstance } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Track real HTTP streams even when the core routes predate this extension. */
export function registerEventStreamShutdown(app: FastifyInstance) {
  const streams = new Set<ServerResponse>();
  const capture = (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "GET" || !/^\/api\/events\/[^/?]+\/stream(?:\?.*)?$/.test(request.url ?? "")) return;
    streams.add(response);
    response.once("close", () => { streams.delete(response); });
  };
  // Fastify route contexts can be created before a later onRequest hook. The
  // HTTP server listener observes those routes without changing authorization.
  app.server.prependListener("request", capture);
  app.addHook("preClose", async () => {
    for (const response of streams) {
      if (!response.destroyed && !response.writableEnded) response.end();
    }
    streams.clear();
  });
  app.addHook("onClose", async () => {
    app.server.removeListener("request", capture);
  });
}
