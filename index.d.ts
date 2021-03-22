/// <reference types="node" />

import {
  FastifyRequest,
  FastifyReply,
  FastifyPlugin,
  RawReplyDefaultExpression,
  RawServerBase,
  RequestGenericInterface
} from 'fastify';

import {
  IncomingMessage,
  IncomingHttpHeaders,
  RequestOptions,
  AgentOptions,
  Agent,
} from "http";
import {
  RequestOptions as SecureRequestOptions,
  AgentOptions as SecureAgentOptions,
  Agent as SecureAgent
} from "https";
import {
  Http2ServerRequest,
  IncomingHttpHeaders as Http2IncomingHttpHeaders,
  ClientSessionRequestOptions,
  ClientSessionOptions,
  SecureClientSessionOptions,
} from "http2";

export interface FastifyReplyFromHooks {
  queryString?: { [key: string]: unknown };
  contentType?: string;
  onResponse?: (
    request: FastifyRequest<RequestGenericInterface, RawServerBase>,
    reply: FastifyReply<RawServerBase>,
    res: RawReplyDefaultExpression<RawServerBase>
  ) => void;
  onError?: (
      reply: FastifyReply<RawServerBase>,
      error: { error: Error }
  ) => void;
  body?: unknown;
  rewriteHeaders?: (
    headers: Http2IncomingHttpHeaders | IncomingHttpHeaders
  ) => Http2IncomingHttpHeaders | IncomingHttpHeaders;
  rewriteRequestHeaders?: (
    req: Http2ServerRequest | IncomingMessage,
    headers: Http2IncomingHttpHeaders | IncomingHttpHeaders
  ) => Http2IncomingHttpHeaders | IncomingHttpHeaders;
  getUpstream?: (
      req: Http2ServerRequest | IncomingMessage,
      base: string
  ) => string;
}

declare module "fastify" {
  interface FastifyReply {
    from(
      source?: string,
      opts?: FastifyReplyFromHooks
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
  agents?: { 'http:': Agent, 'https:': SecureAgent }
}

export interface FastifyReplyFromOptions {
  base?: string;
  cacheURLs?: number;
  disableCache?: boolean;
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
