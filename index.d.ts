/// <reference types="node" />

import {
  FastifyRequest,
  FastifyReply,
  FastifyPlugin,
  RawReplyDefaultExpression,
  RawServerBase,
} from 'fastify';

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

declare module "fastify" {
  interface FastifyReply {
    from(
      source?: string,
      opts?: {
        queryString?: { [key: string]: unknown };
        contentType?: string;
        onResponse?: (
          request: FastifyRequest<RawServerBase>,
          reply: FastifyReply<RawServerBase>,
          res: RawReplyDefaultExpression<RawServerBase>
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

export interface FastifyReplyFromOptions {
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

declare const fastifyReplyFrom: FastifyPlugin<FastifyReplyFromOptions>
export default fastifyReplyFrom;
