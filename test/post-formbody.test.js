'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From, {
  contentTypesToEncode: ['application/x-www-form-urlencoded']
})
instance.register(require('@fastify/formbody'))

t.test('post-formbody', async (t) => {
  t.plan(6)
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'POST')
    t.equal(req.headers['content-type'], 'application/x-www-form-urlencoded')
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (d) => {
      data += d
    })
    req.on('end', () => {
      const str = data.toString()
      t.same(JSON.parse(data), { some: 'info', another: 'detail' })
      res.statusCode = 200
      res.setHeader('content-type', 'application/x-www-form-urlencoded')
      res.end(str)
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
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'some=info&another=detail'
  })

  t.equal(result.headers['content-type'], 'application/x-www-form-urlencoded')
  t.same(await result.body.json(), { some: 'info', another: 'detail' })
})
