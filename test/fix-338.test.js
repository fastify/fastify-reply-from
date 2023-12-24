'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const pino = require('pino')
const split = require('split2')
const { request, Agent, setGlobalDispatcher } = require('undici')
const { promisify } = require('util')
const sleep = promisify(setTimeout)

setGlobalDispatcher(new Agent({
  keepAliveMaxTimeout: 1000,
  keepAliveTimeout: 1000
}))

const stream = split(JSON.parse)
const logger = pino({ level: 'debug' }, stream)

// PROXY TARGET
const fastifyProxyTarget = Fastify()
  .put('/api', async (request, reply) => reply.code(204).send())

// CLIENT REQUESTS RECEIVER
const fastify = Fastify({
  logger
})

const timeout = 1000 // 1 sec

fastify.register(From, {
  http2: false,
  http: {
    requestOptions: {
      timeout
    }
  }
})

fastify.put('/proxytest/api', (request, reply) => {
  reply.from(`http://127.0.0.1:${fastifyProxyTarget.server.address().port}/api`)
})

async function startTest () {
  await fastifyProxyTarget.listen({ port: 0 })
  await fastify.listen({ port: 0 })

  const res = await request(`http://127.0.0.1:${fastify.server.address().port}/proxytest/api`, {
    method: 'PUT'
  })

  res.body.resume()

  await sleep(2 * timeout)

  await fastify.close()
  await fastifyProxyTarget.close()
  stream.end()

  for await (const log of stream) {
    t.not(log.level, 40, 'should not log timeout error')
  }
}

startTest()
