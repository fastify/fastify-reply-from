/// <reference types="node" />

import {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
  HTTPMethods,
  RawReplyDefaultExpression,
  RawServerBase,
  RequestGenericInterface,
  RouteGenericInterface
} from 'fastify'

import {
  Agent,
  AgentOptions,
  IncomingHttpHeaders,
  IncomingMessage,
  RequestOptions,
} from 'node:http'
import {
  ClientSessionOptions,
  ClientSessionRequestOptions,
  IncomingHttpHeaders as Http2IncomingHttpHeaders,
  SecureClientSessionOptions,
} from 'node:http2'
import {
  Agent as SecureAgent,
  AgentOptions as SecureAgentOptions,
  RequestOptions as SecureRequestOptions
} from 'node:https'
import { Pool, ProxyAgent, Dispatcher } from 'undici'

declare module 'fastify' {
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
  ) => string

  export type RetryDetails = {
    err: Error;
    req: FastifyRequest<RequestGenericInterface, RawServerBase>;
    res: FastifyReply<RouteGenericInterface, RawServerBase>;
    attempt: number;
    retriesCount: number;
    getDefaultDelay: () => number | null;
  }

  export type RawServerResponse<T extends RawServerBase> = RawReplyDefaultExpression<T> & {
    stream: IncomingMessage
  }

  export interface FastifyReplyFromHooks {
    queryString?: { [key: string]: unknown } | QueryStringFunction;
    contentType?: string;
    retryDelay?: (details: RetryDetails) => {} | null;
    retriesCount?: number;
    onResponse?: (
      request: FastifyRequest<RequestGenericInterface, RawServerBase>,
      reply: FastifyReply<RouteGenericInterface, RawServerBase>,
      res: RawServerResponse<RawServerBase>
    ) => void;
    onError?: (
      reply: FastifyReply<RouteGenericInterface, RawServerBase>,
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
    timeout?: number;
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
    base?: string | string[];
    cacheURLs?: number;
    disableCache?: boolean;
    http?: HttpOptions;
    http2?: Http2Options | boolean;
    undici?: Pool.Options & { proxy?: string | URL | ProxyAgent.Options } | { request: Dispatcher['request'] };
    balancedPoolOptions?: Pool.Options & Record<string, unknown>;
    contentTypesToEncode?: string[];
    retryMethods?: (HTTPMethods | 'TRACE')[];
    maxRetriesOn503?: number;
    disableRequestLogging?: boolean;
    globalAgent?: boolean;
    destroyAgent?: boolean;
  }

  export const fastifyReplyFrom: FastifyReplyFrom
  export { fastifyReplyFrom as default }
}

declare function fastifyReplyFrom (...params: Parameters<FastifyReplyFrom>): ReturnType<FastifyReplyFrom>
export = fastifyReplyFrom
