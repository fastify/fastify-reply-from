/// <reference types="node" />
import * as fastify from "fastify";
import { IncomingMessage, IncomingHttpHeaders } from "http";
import {
  Http2ServerRequest,
  IncomingHttpHeaders as Http2IncomingHttpHeaders
} from "http2";

declare function fastifyReplyFrom<HttpServer, HttpRequest, HttpResponse>(
  instance: fastify.FastifyInstance<HttpServer, HttpRequest, HttpResponse>,
  opts: fastifyReplyFrom.ReplyFromOptions,
  callback?: (err?: Error) => void
): void;

declare namespace fastifyReplyFrom {
  interface ReplyFromOptions {
    base: string;
    cacheURLs?: number;
    http2?: boolean;
    keepAliveMsecs?: number;
    maxFreeSockets?: number;
    maxSockets?: number;
    rejectUnauthorized?: boolean;
    undici?: unknown;
  }
}

export = fastifyReplyFrom;

declare module "fastify" {
  interface FastifyReply<HttpResponse> {
    from(
      source?: string,
      opts?: {
        queryString?: { [key: string]: unknown };
        contentType?: string;
        onResponse?: (
          request: FastifyRequest,
          reply: FastifyReply<HttpResponse>,
          res: unknown
        ) => void;

        body?: unknown;
        rewriteHeaders?: (
          headers: Http2IncomingHttpHeaders
        ) => Http2IncomingHttpHeaders;

        rewriteRequestHeaders?: (
          req: Http2ServerRequest | IncomingMessage,
          headers: Http2IncomingHttpHeaders
        ) => Http2IncomingHttpHeaders;
      }
    ): void;
  }
}
