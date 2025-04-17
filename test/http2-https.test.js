'use strict'

const h2url = require('h2url')
const t = require('node:test')
const assert = require('node:assert')
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

const target = Fastify({
  https: certs
})

target.get('/', (_request, reply) => {
  assert.ok('request proxied')
  reply.code(404).header('x-my-header', 'hello!').send({
    hello: 'world'
  })
})

instance.get('/', (_request, reply) => {
  reply.from()
})

async function run (t) {
  await target.listen({ port: 0 })

  instance.register(From, {
    base: `https://localhost:${target.server.address().port}`,
    rejectUnauthorized: false
  })

  await instance.listen({ port: 0 })

  await t.test('http2 -> https', async (t) => {
    t.plan(4)
    const { headers, body } = await h2url.concat({
      url: `https://localhost:${instance.server.address().port}`
    })

    t.assert.strictEqual(headers[':status'], 404)
    t.assert.strictEqual(headers['x-my-header'], 'hello!')
    t.assert.match(headers['content-type'], /application\/json/)
    t.assert.deepStrictEqual(JSON.parse(body), { hello: 'world' })
  })

  await t.test('https -> https', async (t) => {
    t.plan(4)
    const result = await request(`https://localhost:${instance.server.address().port}`, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })

    t.assert.strictEqual(result.statusCode, 404)
    t.assert.strictEqual(result.headers['x-my-header'], 'hello!')
    t.assert.match(result.headers['content-type'], /application\/json/)
    t.assert.deepStrictEqual(await result.body.json(), { hello: 'world' })
  })
}

t.test('http2 -> https', async (t) => {
  t.plan(2)
  t.after(() => instance.close())
  t.after(() => target.close())

  await run(t)
})
