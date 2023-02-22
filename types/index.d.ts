/// <reference types="node" />

import {
  FastifyRequest,
  FastifyReply,
  RawReplyDefaultExpression,
  RawServerBase,
  RequestGenericInterface,
  HTTPMethods,
  FastifyPluginCallback,
} from 'fastify';

import {
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
  IncomingHttpHeaders as Http2IncomingHttpHeaders,
  ClientSessionRequestOptions,
  ClientSessionOptions,
  SecureClientSessionOptions,
} from "http2";
import { Pool } from 'undici'

declare module "fastify" {
  interface FastifyReply {
    from(
      source?: string,
      opts?: fastifyReplyFrom.FastifyReplyFromHooks
    ): this;
  }
}

type FastifyReplyFrom = FastifyPluginCallback<fastifyReplyFrom.FastifyReplyFromOptions>

declare namespace fastifyReplyFrom {
  type QueryStringFunction = (search: string | undefined, reqUrl: string) => string;
  export interface FastifyReplyFromHooks {
    queryString?: { [key: string]: unknown } | QueryStringFunction;
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
      headers: Http2IncomingHttpHeaders | IncomingHttpHeaders,
      request?: FastifyRequest<RequestGenericInterface, RawServerBase>
    ) => Http2IncomingHttpHeaders | IncomingHttpHeaders;
    rewriteRequestHeaders?: (
      request: FastifyRequest<RequestGenericInterface, RawServerBase>,
      headers: Http2IncomingHttpHeaders | IncomingHttpHeaders
    ) => Http2IncomingHttpHeaders | IncomingHttpHeaders;
    getUpstream?: (
      request: FastifyRequest<RequestGenericInterface, RawServerBase>,
      base: string
    ) => string;
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
    undici?: Pool.Options;
    contentTypesToEncode?: string[];
    retryMethods?: (HTTPMethods | 'TRACE')[];
    maxRetriesOn503?: number;
    disableRequestLogging?: boolean;
    globalAgent?: boolean;
  }

  export const fastifyReplyFrom: FastifyReplyFrom
  export { fastifyReplyFrom as default }
}

declare function fastifyReplyFrom(...params: Parameters<FastifyReplyFrom>): ReturnType<FastifyReplyFrom>
export = fastifyReplyFrom
