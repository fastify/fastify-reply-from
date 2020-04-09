import replyFrom, { ReplyFromOptions } from "../";
import fastify from "fastify";
import { AddressInfo } from "net";
import { IncomingHttpHeaders } from "http2";
import { Server, IncomingMessage, ServerResponse } from "http";

const fullOptions: ReplyFromOptions<Server, IncomingMessage, ServerResponse> = {
  base: "http://example2.com",
  http: {
    agentOptions: {
      keepAliveMsecs: 60 * 1000,
      maxFreeSockets: 2048,
      maxSockets: 2048
    },
    requestOptions: {
      timeout: 1000
    }
  },
  http2: {
    sessionTimeout: 1000,
    requestTimeout: 1000,
    sessionOptions: {
      rejectUnauthorized: true
    },
    requestOptions: {
      endStream: true
    }
  },
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

server.register(replyFrom);

server.register(replyFrom, {});

server.register(replyFrom, { http2: true });

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
