'use strict'

const test = require('tap').test
const Fastify = require('fastify')
const From = require('../index')
const http = require('node:http')
const { parse } = require('node:querystring')

test('with explicitly set content-type application/octet-stream', t => {
  const instance = Fastify()
  instance.register(From, {
    contentTypesToEncode: ['application/octet-stream']
  })

  instance.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: 1000 },
    (_req, body, done) => done(null, parse(body.toString()))
  )

  t.plan(8)
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
      const str = data.toString()
      t.same(JSON.parse(data), { some: 'info', another: 'detail' })
      res.statusCode = 200
      res.setHeader('content-type', 'application/octet-stream')
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

      const result = await fetch(`http://localhost:${instance.server.address().port}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: 'some=info&another=detail'
      })

      t.equal(result.headers.get('content-type'), 'application/octet-stream')
      t.same(await result.json(), { some: 'info', another: 'detail' })
    })
  })
})
