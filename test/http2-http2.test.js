'use strict'

const h2url = require('h2url')
const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const fs = require('node:fs')
const path = require('node:path')
const certs = {
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.cert'))
}

t.test('http2 -> http2', async (t) => {
  const instance = Fastify({
    http2: true,
    https: certs
  })

  t.after(() => instance.close())

  const target = Fastify({
    http2: true
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

  await target.listen({ port: 0 })

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: true,
    rejectUnauthorized: false
  })

  await instance.listen({ port: 0 })

  const { headers, body } = await h2url.concat({
    url: `https://localhost:${instance.server.address().port}`
  })

  t.assert.strictEqual(headers[':status'], 404)
  t.assert.strictEqual(headers['x-my-header'], 'hello!')
  t.assert.match(headers['content-type'], /application\/json/)
  t.assert.deepStrictEqual(JSON.parse(body), { hello: 'world' })
  instance.close()
  target.close()
})
