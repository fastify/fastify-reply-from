'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')

async function createTarget (i) {
  const target = Fastify({
    keepAliveTimeout: 1
  })

  target.get('/test', async () => {
    return `Hello from target ${i}`
  })

  t.teardown(() => target.close())
  await target.listen({ port: 3000 + i })
}

t.plan(4)

async function run () {
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

  t.teardown(() => instance.close())
  await instance.listen({ port: 3000 })

  const res1 = await instance.inject({
    method: 'GET',
    url: '/',
    headers: {
      'x-host-number': 1
    }
  })
  t.equal(res1.statusCode, 200)
  t.equal(res1.body, 'Hello from target 1')

  const res2 = await instance.inject({
    method: 'GET',
    url: '/',
    headers: {
      'x-host-number': 2
    }
  })
  t.equal(res2.statusCode, 200)
  t.equal(res2.body, 'Hello from target 2')
}

run()
