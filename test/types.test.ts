import replyFrom, { ReplyFromOptions } from "../";
import fastify from "fastify";
import { AddressInfo } from "net";
import { IncomingHttpHeaders } from "http2";

const fullOptions: ReplyFromOptions = {
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
};

const server = fastify();

server.register(replyFrom, {
  base: "http://example.com"
});

server.register(replyFrom, fullOptions);

server.get("/v1", (erquest, reply) => {
  reply.from();
});
server.get("/v3", (erquest, reply) => {
  reply.from("/v3", {
    body: { hello: "world" },
    rewriteRequestHeaders(req, headers) {
      return headers;
    }
  });
});

// http2
const instance = fastify({ http2: true });

const target = fastify({ http2: true });

instance.get("/", (request, reply) => {
  reply.from();
});

instance.get("/http2", (request, reply) => {
  reply.from("/", {
    rewriteHeaders(headers) {
      return headers;
    },
    rewriteRequestHeaders(req, headers: IncomingHttpHeaders) {
      return headers;
    }
  });
});

instance.register(replyFrom, {
  base: `http://localhost:${(target.server.address() as AddressInfo).port}`,
  http2: true,
  rejectUnauthorized: false
});
