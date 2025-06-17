'use strict'
const t = require('node:test')
const http = require('node:http')
const Fastify = require('fastify')
const From = require('..')
const { request } = require('undici')

t.test('undici balanced pool http', async t => {
  const hit = [0, 0]
  const makeTarget = idx => http.createServer((req, res) => {
    hit[idx]++
    res.statusCode = 200
    res.end('hello world')
  })
  const target1 = makeTarget(0)
  const target2 = makeTarget(1)

  await Promise.all([
    new Promise(resolve => target1.listen(0, resolve)),
    new Promise(resolve => target2.listen(0, resolve))
  ])
  const p1 = target1.address().port
  const p2 = target2.address().port

  const proxy = Fastify()
  proxy.register(From, {
    base: [`http://localhost:${p1}`, `http://localhost:${p2}`]
  })
  proxy.get('*', (_req, reply) => {
    reply.from()
  })

  t.after(() => {
    proxy.close()
    target1.close()
    target2.close()
  })

  await proxy.listen({ port: 0 })
  const proxyPort = proxy.server.address().port

  for (let i = 0; i < 10; i++) {
    const res = await request(`http://localhost:${proxyPort}/hello`)
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(await res.body.text(), 'hello world')
  }
  t.assert.ok(hit[0] > 0 && hit[1] > 0, `load distribution OK => [${hit[0]}, ${hit[1]}]`)
})
