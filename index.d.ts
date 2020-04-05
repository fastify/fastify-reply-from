/// <reference types="node" />
import * as fastify from "fastify";
import {
  IncomingMessage,
  IncomingHttpHeaders,
  RequestOptions,
  AgentOptions,
} from "http";
import {
  RequestOptions as SecureRequestOptions,
  AgentOptions as SecureAgentOptions,
} from "https";
import {
  Http2ServerRequest,
  IncomingHttpHeaders as Http2IncomingHttpHeaders,
  ClientSessionRequestOptions,
  ClientSessionOptions,
  SecureClientSessionOptions,
} from "http2";

declare function fastifyReplyFrom<HttpServer, HttpRequest, HttpResponse>(
  instance: fastify.FastifyInstance<HttpServer, HttpRequest, HttpResponse>,
  opts: fastifyReplyFrom.ReplyFromOptions<
    HttpServer,
    HttpRequest,
    HttpResponse
  >,
  callback?: (err?: Error) => void
): void;

interface Http2Options {
  sessionTimeout?: number;
  requestTimeout?: number;
  sessionOptions?: ClientSessionOptions | SecureClientSessionOptions;
  requestOptions?: ClientSessionRequestOptions;
}

interface HttpOptions {
  agentOptions?: AgentOptions | SecureAgentOptions;
  requestOptions?: RequestOptions | SecureRequestOptions;
}

declare namespace fastifyReplyFrom {
  interface ReplyFromOptions<HttpServer, HttpRequest, HttpResponse>
    extends fastify.RegisterOptions<HttpServer, HttpRequest, HttpResponse> {
    base?: string;
    cacheURLs?: number;
    http?: HttpOptions;
    http2?: Http2Options | boolean;
    undici?: unknown; // undici has no TS declarations yet
    keepAliveMsecs?: number;
    maxFreeSockets?: number;
    maxSockets?: number;
    rejectUnauthorized?: boolean;
    sessionTimeout?: number;
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
          headers: Http2IncomingHttpHeaders | IncomingHttpHeaders
        ) => Http2IncomingHttpHeaders | IncomingHttpHeaders;

        rewriteRequestHeaders?: (
          req: Http2ServerRequest | IncomingMessage,
          headers: Http2IncomingHttpHeaders | IncomingHttpHeaders
        ) => Http2IncomingHttpHeaders | IncomingHttpHeaders;
      }
    ): void;
  }
}
