/// <reference types="node" />
import fastify, { FastifyRequest } from "fastify";
import {
  IncomingHttpHeaders,
  Server,
  ServerResponse,
  IncomingMessage
} from "http";

declare function fastifyReplyFrom<
  HttpServer = Server,
  HttpRequest = IncomingMessage,
  HttpResponse = ServerResponse,
  T = any
>(
  options?: fastifyReplyFrom.ReplyFromOptions
): fastify.Plugin<HttpServer, HttpRequest, HttpResponse, T>;

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
      source: string,
      opts: {
        queryString?: { [key: string]: unknown };
        contentType?: string;
        onResponse?: (
          request: FastifyRequest,
          reply: FastifyReply<HttpResponse>,
          res: any
        ) => void;

        body: any;
        // rewriteHeaders?: (headers: => Headers;

        rewriteRequestHeaders?: (
          req: IncomingMessage,
          Headers: IncomingHttpHeaders
        ) => IncomingHttpHeaders;
      }
    ): void;
  }
}
