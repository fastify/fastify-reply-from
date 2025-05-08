'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')
const { parse } = require('node:querystring')

const instance = Fastify()
instance.register(From, {
  contentTypesToEncode: ['application/x-www-form-urlencoded']
})

instance.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'buffer', bodyLimit: 1000 },
  (_req, body, done) => done(null, parse(body.toString()))
)

t.test('post with custom encoded content-type', async (t) => {
  t.plan(6)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'POST')
    t.assert.strictEqual(req.headers['content-type'], 'application/x-www-form-urlencoded')
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (d) => {
      data += d
    })
    req.on('end', () => {
      const str = data.toString()
      t.assert.deepStrictEqual(JSON.parse(data), { some: 'info', another: 'detail' })
      res.statusCode = 200
      res.setHeader('content-type', 'application/x-www-form-urlencoded')
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
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: 'some=info&another=detail'
  })

  t.assert.strictEqual(result.headers['content-type'], 'application/x-www-form-urlencoded')
  t.assert.deepStrictEqual(await result.body.json(), { some: 'info', another: 'detail' })
})
