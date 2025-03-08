'use strict'

const t = require('tap')
const http = require('node:http')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')
const FakeTimers = require('@sinonjs/fake-timers')

const clock = FakeTimers.createClock()

t.test('undici body timeout', async (t) => {
  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    req.on('data', () => undefined)
    req.on('end', () => {
      res.writeHead(200)
      res.flushHeaders()
      res.write('test')
      clock.setTimeout(() => {
        res.end()
        t.end()
      }, 1000)
    })
  })

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))
  t.teardown(target.close.bind(target))

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: {
      bodyTimeout: 100
    }
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  await instance.listen({ port: 0 })

  const result = await request(`http://localhost:${instance.server.address().port}/`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })

  t.equal(result.statusCode, 200)

  clock.tick(1000)
})
