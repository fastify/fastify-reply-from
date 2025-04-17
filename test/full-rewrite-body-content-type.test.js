'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const fastifyReplyFrom = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(fastifyReplyFrom)

const payload = { hello: 'world' }
const msgPackPayload = Buffer.from([0x81, 0xa5, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0xa5, 0x77, 0x6f, 0x72, 0x6c, 0x64])

t.test('full rewrite body content-type', async (t) => {
  t.plan(6)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'POST')
    t.assert.strictEqual(req.headers['content-type'], 'application/msgpack')
    const data = []
    req.on('data', (d) => {
      data.push(d)
    })
    req.on('end', () => {
      t.assert.deepStrictEqual(Buffer.concat(data), msgPackPayload)
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ something: 'else' }))
    })
  })

  instance.post('/', (request, reply) => {
    t.assert.deepStrictEqual(request.body, payload)
    reply.from(`http://localhost:${target.address().port}`, {
      contentType: 'application/msgpack',
      body: msgPackPayload
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ hello: 'world' }),
  })

  t.assert.deepStrictEqual(await result.body.json(), { something: 'else' })
})
