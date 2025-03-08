'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()

t.test('no body opts with get', async (t) => {
  t.plan(4)
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((_req, res) => {
    t.fail('this should never get called')
    res.end('hello world')
  })

  instance.get('/', (_request, reply) => {
    try {
      reply.from(null, { body: 'this is the new body' })
    } catch (e) {
      t.equal(e.message, 'Rewriting the body when doing a GET is not allowed')
      reply.send('hello world')
    }
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.equal(result.statusCode, 200)
  t.equal(await result.body.text(), 'hello world')
})
