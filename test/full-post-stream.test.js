'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('full post stream', async (t) => {
  t.plan(5)
  t.teardown(instance.close.bind(instance))

  instance.addContentTypeParser('application/octet-stream', function (_req, payload, done) {
    done(null, payload)
  })

  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'POST')
    t.equal(req.headers['content-type'], 'application/octet-stream')
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (d) => {
      data += d
    })
    req.on('end', () => {
      t.same(JSON.parse(data), { hello: 'world' })
      res.statusCode = 200
      res.setHeader('content-type', 'application/octet-stream')
      res.end(JSON.stringify({ something: 'else' }))
    })
  })

  instance.post('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream'
    },
    body: JSON.stringify({
      hello: 'world'
    })
  })

  t.same(await result.body.json(), { something: 'else' })
})
