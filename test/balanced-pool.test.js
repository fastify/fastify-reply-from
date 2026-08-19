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
    new Promise(resolve => target1.listen(0, '127.0.0.1', resolve)),
    new Promise(resolve => target2.listen(0, '127.0.0.1', resolve))
  ])
  const p1 = target1.address().port
  const p2 = target2.address().port

  const proxy = Fastify()
  proxy.register(From, {
    base: [`http://127.0.0.1:${p1}`, `http://127.0.0.1:${p2}`]
  })
  proxy.get('*', (_req, reply) => {
    reply.from()
  })

  t.after(() => {
    proxy.close()
    target1.close()
    target2.close()
  })

  await proxy.listen({ port: 0, host: '127.0.0.1' })
  const proxyPort = proxy.server.address().port

  for (let i = 0; i < 10; i++) {
    const res = await request(`http://127.0.0.1:${proxyPort}/hello`)
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(await res.body.text(), 'hello world')
  }
  t.assert.ok(hit[0] > 0 && hit[1] > 0, `load distribution OK => [${hit[0]}, ${hit[1]}]`)
})

t.test('undici single base array', async t => {
  const target = http.createServer((_req, res) => {
    res.statusCode = 200
    res.end('single base')
  })

  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve))
  const port = target.address().port

  const proxy = Fastify()

  proxy.register(From, {
    base: [`http://127.0.0.1:${port}`]
  })

  proxy.get('*', (_req, reply) => {
    reply.from()
  })

  t.after(async () => {
    await proxy.close()
    await new Promise(resolve => target.close(resolve))
  })

  await proxy.listen({ port: 0, host: '127.0.0.1' })

  const res = await request(
    `http://127.0.0.1:${proxy.server.address().port}/hello`
  )

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(await res.body.text(), 'single base')
})

t.test('destroys balanced pool on close', async t => {
  const instance = Fastify()

  instance.register(From, {
    base: [
      'http://localhost:12345',
      'http://localhost:12346'
    ],
    destroyAgent: true
  })

  await instance.ready()
  await instance.close()

  t.assert.ok(true)
})
