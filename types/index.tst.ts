import { expect } from 'tstyche'
import fastify, {
  type FastifyReply,
  type FastifyRequest,
  type RawServerBase,
  type RequestGenericInterface,
  type RouteGenericInterface
} from 'fastify'
import * as http from 'node:http'
import { type IncomingHttpHeaders } from 'node:http2'
import * as https from 'node:https'
import { Agent, Client, Dispatcher, Pool } from 'undici'
import replyFrom, {
  type FastifyReplyFromOptions,
  type RawServerResponse
} from '.'

const fullOptions: FastifyReplyFromOptions = {
  base: 'http://example2.com',
  http: {
    agentOptions: {
      keepAliveMsecs: 60 * 1000,
      maxFreeSockets: 2048,
      maxSockets: 2048
    },
    requestOptions: { timeout: 1000 },
    agents: {
      'http:': new http.Agent({}),
      'https:': new https.Agent({})
    }
  },
  http2: {
    sessionTimeout: 1000,
    requestTimeout: 1000,
    sessionOptions: { rejectUnauthorized: true },
    requestOptions: { endStream: true }
  },
  cacheURLs: 100,
  disableCache: false,
  undici: {
    connections: 100,
    pipelining: 10,
    proxy: 'http://example2.com:8080'
  },
  contentTypesToEncode: ['application/x-www-form-urlencoded'],
  retryMethods: ['GET', 'HEAD', 'OPTIONS', 'TRACE'],
  maxRetriesOn503: 10,
  disableRequestLogging: false,
  globalAgent: false,
  destroyAgent: true
}

const app = fastify()

app.register(replyFrom)
app.register(replyFrom, {})
app.register(replyFrom, { http2: true })
app.register(replyFrom, fullOptions)
app.register(replyFrom, { undici: { proxy: new URL('http://example2.com:8080') } })
app.register(replyFrom, { undici: { proxy: { uri: 'http://example2.com:8080' } } })

app.register(replyFrom, { base: 'http://example.com', undici: new Agent() })
app.register(replyFrom, { base: 'http://example.com', undici: new Pool('http://example.com') })
app.register(replyFrom, { base: 'http://example.com', undici: new Client('http://example.com') })
app.register(replyFrom, { base: 'http://example.com', undici: new Dispatcher() })

app.get('/v1', (_request, reply) => {
  expect(reply.from()).type.toBe<FastifyReply>()
})

app.get('/v3', (_request, reply) => {
  reply.from('/v3', {
    timeout: 1000,
    body: { hello: 'world' },
    rewriteRequestHeaders (req, headers) {
      expect(req).type.toBe<FastifyRequest<RequestGenericInterface, RawServerBase>>()
      return headers
    },
    getUpstream (req, base) {
      expect(req).type.toBe<FastifyRequest<RequestGenericInterface, RawServerBase>>()
      return base
    },
    onResponse (request, reply, res) {
      expect(request).type.toBe<FastifyRequest<RequestGenericInterface, RawServerBase>>()
      expect(reply).type.toBe<FastifyReply<RouteGenericInterface, RawServerBase>>()
      expect(res).type.toBe<RawServerResponse<RawServerBase>>()
      expect(res.statusCode).type.toBe<number>()
    }
  })
})

app.get('/async-on-response', (_request, reply) => {
  reply.from('/async-on-response', {
    async onResponse (request, reply, res) {
      expect(request).type.toBe<FastifyRequest<RequestGenericInterface, RawServerBase>>()
      expect(reply).type.toBe<FastifyReply<RouteGenericInterface, RawServerBase>>()
      expect(res).type.toBe<RawServerResponse<RawServerBase>>()
    }
  })
})

app.get('/http2', (_request, reply) => {
  reply.from('/', {
    method: 'POST',
    retryDelay: ({ req, res, err, attempt, getDefaultDelay }) => {
      const defaultDelay = getDefaultDelay(req, res, err, attempt)
      expect(defaultDelay).type.toBe<number | null>()

      if (res && res.statusCode === 500 && req.method === 'GET') {
        return 300
      }
      return null
    },
    rewriteHeaders (headers) {
      return headers
    },
    rewriteRequestHeaders (_req, headers: IncomingHttpHeaders) {
      return headers
    },
    onError (reply: FastifyReply<RouteGenericInterface, RawServerBase>, error) {
      return reply.send(error.error)
    },
    queryString (search, reqUrl, request) {
      expect(search).type.toBe<string | undefined>()
      expect(reqUrl).type.toBe<string>()
      expect(request).type.toBe<FastifyRequest<RequestGenericInterface, RawServerBase>>()
      return ''
    },
  })
})

expect<FastifyReplyFromOptions>().type.toBeAssignableFrom(fullOptions)
expect<FastifyReplyFromOptions>().type.toBeAssignableFrom({ http2: true })
