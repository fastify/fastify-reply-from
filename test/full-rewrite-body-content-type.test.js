'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const fastifyReplyFrom = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(fastifyReplyFrom)

const payload = { hello: 'world' }
const msgPackPayload = Buffer.from([0x81, 0xa5, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0xa5, 0x77, 0x6f, 0x72, 0x6c, 0x64])

t.plan(8)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'POST')
  t.equal(req.headers['content-type'], 'application/msgpack')
  const data = []
  req.on('data', (d) => {
    data.push(d)
  })
  req.on('end', () => {
    t.same(Buffer.concat(data), msgPackPayload)
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ something: 'else' }))
  })
})

instance.post('/', (request, reply) => {
  t.same(request.body, payload)
  reply.from(`http://localhost:${target.address().port}`, {
    contentType: 'application/msgpack',
    body: msgPackPayload
  })
})

t.teardown(target.close.bind(target))

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen({ port: 0 }, async (err) => {
    t.error(err)

    const result = await request(`http://localhost:${instance.server.address().port}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ hello: 'world' }),
    })

    t.same(await result.json(), { something: 'else' })
  })
})
