'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('../index')
const http = require('node:http')
const { parse } = require('node:querystring')

test('with explicitly set content-type application/octet-stream', async t => {
  const instance = Fastify()
  instance.register(From, {
    contentTypesToEncode: ['application/octet-stream']
  })

  instance.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: 1000 },
    (_req, body, done) => done(null, parse(body.toString()))
  )

  t.plan(6)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'POST')
    t.assert.strictEqual(req.headers['content-type'], 'application/octet-stream')
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (d) => {
      data += d
    })
    req.on('end', () => {
      const str = data.toString()
      t.assert.deepStrictEqual(JSON.parse(data), { some: 'info', another: 'detail' })
      res.statusCode = 200
      res.setHeader('content-type', 'application/octet-stream')
      res.end(str)
    })
  })

  instance.post('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: 'some=info&another=detail'
  })

  t.assert.strictEqual(result.headers['content-type'], 'application/octet-stream')
  t.assert.deepStrictEqual(await result.body.json(), { some: 'info', another: 'detail' })
})
