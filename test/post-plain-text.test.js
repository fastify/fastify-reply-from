'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.plan(8)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'POST')
  t.equal(req.headers['content-type'], 'text/plain')
  let data = ''
  req.setEncoding('utf8')
  req.on('data', (d) => {
    data += d
  })
  req.on('end', () => {
    const str = data.toString()
    t.same(str, 'this is plain text')
    res.statusCode = 200
    res.setHeader('content-type', 'text/plain')
    res.end(str)
  })
})

instance.post('/', (_request, reply) => {
  reply.from(`http://localhost:${target.address().port}`)
})

t.teardown(target.close.bind(target))

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen({ port: 0 }, async (err) => {
    t.error(err)

    const result = await request(`http://localhost:${instance.server.address().port}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'this is plain text'
    })

    t.equal(result.headers['content-type'], 'text/plain')
    t.same(await result.body.text(), 'this is plain text')
  })
})
