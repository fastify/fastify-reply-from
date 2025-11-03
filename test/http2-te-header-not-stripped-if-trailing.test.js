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

t.test('do not strip te header if set to trailing', async (t) => {
  const instance = Fastify({
    http2: true,
    https: certs
  })

  t.after(() => instance.close())

  const target = Fastify({
    http2: true
  })

  target.get('/', (request, reply) => {
    t.assert.strictEqual(request.headers['te'], 'trailers')

    reply.send({
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

  const { headers } = await h2url.concat({
    url: `https://localhost:${instance.server.address().port}`,
    headers: {
      te: 'trailers'
    }
  })

  t.assert.strictEqual(headers[':status'], 200)

  instance.close()
  target.close()
})
