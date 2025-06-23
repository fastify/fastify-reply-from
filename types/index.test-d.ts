import fastify, { FastifyReply, FastifyRequest, RawServerBase, RequestGenericInterface, RouteGenericInterface } from 'fastify'
import * as http from 'node:http'
import { IncomingHttpHeaders } from 'node:http2'
import * as https from 'node:https'
import { AddressInfo } from 'node:net'
import { expectType } from 'tsd'
import { Agent, Client, Dispatcher, Pool } from 'undici'
import replyFrom, { FastifyReplyFromOptions, RawServerResponse } from '..'
// @ts-ignore
import tap from 'tap'

const fullOptions: FastifyReplyFromOptions = {
  base: 'http://example2.com',
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

async function main () {
  const server = fastify()

  server.register(replyFrom)

  server.register(replyFrom, {})

  server.register(replyFrom, { http2: true })

  server.register(replyFrom, fullOptions)

  server.register(replyFrom, { undici: { proxy: new URL('http://example2.com:8080') } })

  server.register(replyFrom, { undici: { proxy: { uri: 'http://example2.com:8080' } } })

  server.get('/v1', (_request, reply) => {
    expectType<FastifyReply>(reply.from())
  })
  server.get('/v3', (_request, reply) => {
    reply.from('/v3', {
      timeout: 1000,
      body: { hello: 'world' },
      rewriteRequestHeaders (req, headers) {
        expectType<FastifyRequest<RequestGenericInterface, RawServerBase>>(req)
        return headers
      },
      getUpstream (req, base) {
        expectType<FastifyRequest<RequestGenericInterface, RawServerBase>>(req)
        return base
      },
      onResponse (request, reply, res) {
        expectType<FastifyRequest<RequestGenericInterface, RawServerBase>>(request)
        expectType<FastifyReply<RouteGenericInterface, RawServerBase>>(reply)
        expectType<RawServerResponse<RawServerBase>>(res)
        expectType<number>(res.statusCode)
      }
    })
  })

  // http2
  const instance = fastify({ http2: true })
  // @ts-ignore
  tap.tearDown(instance.close.bind(instance))
  const target = fastify({ http2: true })
  // @ts-ignore
  tap.tearDown(target.close.bind(target))
  instance.get('/', (_request, reply) => {
    reply.from()
  })

  instance.get('/http2', (_request, reply) => {
    reply.from('/', {
      method: 'POST',
      retryDelay: ({ req, res, getDefaultDelay }) => {
        const defaultDelay = getDefaultDelay()
        if (defaultDelay) return defaultDelay

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
      getUpstream (_req, base) {
        return base
      },
      onError (reply: FastifyReply<RouteGenericInterface, RawServerBase>, error) {
        return reply.send(error.error)
      },
      queryString (search, reqUrl, request) {
        expectType<string | undefined>(search)
        expectType<string>(reqUrl)
        expectType<FastifyRequest<RequestGenericInterface, RawServerBase>>(request)
        return ''
      },
    })
  })

  await target.listen({ port: 0 })
  const port = (target.server.address() as AddressInfo).port
  instance.register(replyFrom, {
    base: `http://localhost:${port}`,
    http2: {
      sessionOptions: {
        rejectUnauthorized: false,
      },
    },
  })
  instance.register(replyFrom, {
    base: `http://localhost:${port}`,
    http2: true,
  })
  await instance.listen({ port: 0 })

  const undiciInstance = fastify()
  undiciInstance.register(replyFrom, {
    base: 'http://example2.com',
    undici: {
      pipelining: 10,
      connections: 10
    }
  })
  await undiciInstance.ready()

  const undiciInstanceAgent = fastify()
  undiciInstance.register(replyFrom, {
    base: 'http://example2.com',
    undici: new Agent()
  })
  await undiciInstanceAgent.ready()

  const undiciInstancePool = fastify()
  undiciInstance.register(replyFrom, {
    base: 'http://example2.com',
    undici: new Pool('http://example2.com')
  })
  await undiciInstancePool.ready()

  const undiciInstanceClient = fastify()
  undiciInstance.register(replyFrom, {
    base: 'http://example2.com',
    undici: new Client('http://example2.com')
  })
  await undiciInstanceClient.ready()

  const undiciInstanceDispatcher = fastify()
  undiciInstance.register(replyFrom, {
    base: 'http://example2.com',
    undici: new Dispatcher()
  })
  await undiciInstanceDispatcher.ready()

  tap.pass('done')
  tap.end()
}

main()
