'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')

async function createTarget (i) {
  const target = Fastify({
    keepAliveTimeout: 1
  })

  target.get('/test', async () => {
    return `Hello from target ${i}`
  })

  t.after(() => target.close())
  await target.listen({ port: 3000 + i })
}

async function run (t) {
  await Promise.all([
    createTarget(1),
    createTarget(2)
  ])

  const instance = Fastify({
    keepAliveTimeout: 1
  })

  instance.register(From, {
    base: 'http://localhost',
    http: true
  })

  instance.get('/', (req, reply) => {
    const hostNumber = parseInt(req.headers['x-host-number'])
    const port = 3000 + hostNumber

    reply.from('/test', {
      getUpstream () {
        return `http://localhost:${port}`
      }
    })
  })

  t.after(() => instance.close())
  await instance.listen({ port: 3000 })

  const res1 = await instance.inject({
    method: 'GET',
    url: '/',
    headers: {
      'x-host-number': 1
    }
  })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.body, 'Hello from target 1')

  const res2 = await instance.inject({
    method: 'GET',
    url: '/',
    headers: {
      'x-host-number': 2
    }
  })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.body, 'Hello from target 2')
}

t.test('get-upstream-cache', async (t) => {
  t.plan(4)
  await run(t)
})
