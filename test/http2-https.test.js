'use strict'

const h2url = require('h2url')
const t = require('tap')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')
const fs = require('node:fs')
const path = require('node:path')
const certs = {
  allowHTTP1: true, // fallback support for HTTP1
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.cert'))
}

const instance = Fastify({
  http2: true,
  https: certs
})

t.plan(4)
t.after(() => instance.close())

const target = Fastify({
  https: certs
})

target.get('/', (_request, reply) => {
  t.assert.ok('request proxied')
  reply.code(404).header('x-my-header', 'hello!').send({
    hello: 'world'
  })
})

instance.get('/', (_request, reply) => {
  reply.from()
})

t.after(() => target.close())

async function run () {
  await target.listen({ port: 0 })

  instance.register(From, {
    base: `https://localhost:${target.server.address().port}`,
    rejectUnauthorized: false
  })

  await instance.listen({ port: 0 })

  t.test('http2 -> https', async (t) => {
    const { headers, body } = await h2url.concat({
      url: `https://localhost:${instance.server.address().port}`
    })

    t.assert.deepEqual(headers[':status'], 404)
    t.assert.deepEqual(headers['x-my-header'], 'hello!')
    t.match(headers['content-type'], /application\/json/)
    t.same(JSON.parse(body), { hello: 'world' })
  })

  t.test('https -> https', async (t) => {
    const result = await request(`https://localhost:${instance.server.address().port}`, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })

    t.assert.deepEqual(result.statusCode, 404)
    t.assert.deepEqual(result.headers['x-my-header'], 'hello!')
    t.match(result.headers['content-type'], /application\/json/)
    t.same(await result.body.json(), { hello: 'world' })
  })
}

run()
