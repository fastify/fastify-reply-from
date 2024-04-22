/// <reference types="node" />

import {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
  HTTPMethods,
  RawReplyDefaultExpression,
  RawServerBase,
  RequestGenericInterface,
} from 'fastify';

import {
  Agent,
  AgentOptions,
  IncomingHttpHeaders,
  RequestOptions,
} from "http";
import {
  ClientSessionOptions,
  ClientSessionRequestOptions,
  IncomingHttpHeaders as Http2IncomingHttpHeaders,
  SecureClientSessionOptions,
} from "http2";
import {
  Agent as SecureAgent,
  AgentOptions as SecureAgentOptions,
  RequestOptions as SecureRequestOptions
} from "https";
import { Pool } from 'undici';
import { ProxyAgent } from 'undici';

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
  type QueryStringFunction = (
    search: string | undefined,
    reqUrl: string,
    request: FastifyRequest<RequestGenericInterface, RawServerBase>
  ) => string;

  export type RetryDetails = {
    err: Error;
    req: FastifyRequest<RequestGenericInterface, RawServerBase>;
    res: FastifyReply<RawServerBase>;
    attempt: number;
    retriesCount: number;
    getDefaultDelay: () => number | null;
  }
  export interface FastifyReplyFromHooks {
    queryString?: { [key: string]: unknown } | QueryStringFunction;
    contentType?: string;
    retryDelay?: (details: RetryDetails) => {} | null;
    retriesCount?: number;
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
    method?: HTTPMethods;
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
    undici?: Pool.Options & { proxy?: string  | URL | ProxyAgent.Options };
    contentTypesToEncode?: string[];
    retryMethods?: (HTTPMethods | 'TRACE')[];
    maxRetriesOn503?: number;
    disableRequestLogging?: boolean;
    globalAgent?: boolean;
    destroyAgent?: boolean;
  }

  export const fastifyReplyFrom: FastifyReplyFrom
  export { fastifyReplyFrom as default };
}

declare function fastifyReplyFrom(...params: Parameters<FastifyReplyFrom>): ReturnType<FastifyReplyFrom>
export = fastifyReplyFrom
