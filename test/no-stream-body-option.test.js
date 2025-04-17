'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')
const Readable = require('node:stream').Readable

const instance = Fastify()
instance.register(From)

t.test('no stream body option', async (t) => {
  t.plan(2)
  t.after(() => instance.close())

  const target = http.createServer((_req, res) => {
    t.fail('the target server should never be called')
    res.end()
  })

  instance.post('/', (_request, reply) => {
    const body = new Readable({
      read: function () {
        t.fail('the read function should never be called')
      }
    })

    t.assert.throws(() => {
      reply.from(`http://localhost:${target.address().port}`, {
        body
      })
    })

    // return a 500
    reply.code(500).send({ an: 'error' })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      hello: 'world'
    })
  })

  t.assert.strictEqual(result.statusCode, 500)
})
