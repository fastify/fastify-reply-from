import replyFrom, { FastifyReplyFromOptions } from "../";
import fastify, {FastifyReply, RawServerBase} from "fastify";
import { AddressInfo } from "net";
import { IncomingHttpHeaders } from "http2";
import { expectType } from 'tsd';
import * as http from 'http';
import * as https from 'https';
import * as http2 from 'http2';
// @ts-ignore
import tap from 'tap'

const fullOptions: FastifyReplyFromOptions = {
  base: "http://example2.com",
  http: {
    agentOptions: {
      keepAliveMsecs: 60 * 1000,
      maxFreeSockets: 2048,
      maxSockets: 2048
    },
    requestOptions: {
      timeout: 1000
    },
    agents: {
      'http:': new http.Agent({}),
      'https:': new https.Agent({})
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
  disableCache: false,
  undici: {
    connections: 100,
    pipelining: 10
  },
  contentTypesToEncode: ['application/x-www-form-urlencoded'],
  retryMethods: ['GET', 'HEAD', 'OPTIONS', 'TRACE'],
  maxRetriesOn503: 10,
};
tap.autoend(false);

async function main() {
  const server = fastify();

  server.register(replyFrom);

  server.register(replyFrom, {});

  server.register(replyFrom, {http2: true});

  server.register(replyFrom, fullOptions);

  server.get("/v1", (request, reply) => {
      reply.from();
  });
  server.get("/v3", (request, reply) => {
      reply.from("/v3", {
          body: {hello: "world"},
          rewriteRequestHeaders(req, headers) {
              expectType<http.IncomingMessage | http2.Http2ServerRequest>(req);
              return headers;
          },
          getUpstream(req, base) {
              expectType<http.IncomingMessage | http2.Http2ServerRequest>(req);
              return base;
          }
      });
  });

// http2
  const instance = fastify({http2: true});
  // @ts-ignore
  tap.tearDown(instance.close.bind(instance));
  const target = fastify({http2: true});
  // @ts-ignore
  tap.tearDown(target.close.bind(target));
  instance.get("/", (request, reply) => {
      reply.from();
  });

  instance.get("/http2", (request, reply) => {
      reply.from("/", {
          rewriteHeaders(headers, req) {
              return headers;
          },
          rewriteRequestHeaders(req, headers: IncomingHttpHeaders) {
              return headers;
          },
          getUpstream(req, base) {
              return base;
          },
          onError(reply: FastifyReply<RawServerBase>, error) {
              return reply.send(error.error);
          }
      });
  });

  await target.listen(0);
  const port = (target.server.address() as AddressInfo).port;
  instance.register(replyFrom, {
      base: `http://localhost:${port}`,
      http2: {
        sessionOptions: {
          rejectUnauthorized: false,
        },
      },
  });
  instance.register(replyFrom, {
    base: `http://localhost:${port}`,
    http2: true,
});
  await instance.listen(0);

  const undiciInstance = fastify();
  undiciInstance.register(replyFrom, {
    base: "http://example2.com",
    undici: {
      pipelining: 10,
      connections: 10
    }
  });
  await undiciInstance.ready();

  tap.pass('done');
  tap.end();
}

main();
