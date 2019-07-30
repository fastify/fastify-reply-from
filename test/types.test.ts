import replyFrom from "../";
import fastify from "fastify";

const simple = replyFrom({
  base: "http://example.com"
});

const fullOptions = replyFrom({
  base: "http://example2.com",
  http2: true,
  cacheURLs: 100,
  keepAliveMsecs: 60 * 1000,
  maxFreeSockets: 2048,
  maxSockets: 2048,
  rejectUnauthorized: true,
  undici: {
    connections: 100,
    pipelining: 10
  }
});

const server = fastify();

server.register(simple);

server.register(fullOptions);

server.get("/v1", (erquest, reply) => {
  reply.from();
});
server.get("/v3", (erquest, reply) => {
  reply.from("/v3", { body: { hello: "world" } });
});
