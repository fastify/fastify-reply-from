'use strict'

const h2url = require('h2url')
const t = require('tap')
const Fastify = require('fastify')
const From = require('../..')
const fs = require('fs')
const path = require('path')
const certs = {
  key: fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'fastify.key')),
  cert: fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'fastify.cert'))
}

const instance = Fastify({
  http2: true,
  https: certs
})

t.tearDown(instance.close.bind(instance))

const target = Fastify({
  http2: true
})

target.get('/', (request, reply) => {
  t.pass('request proxied')
  reply.code(404).header('x-my-header', 'hello!').send({
    hello: 'world'
  })
})

instance.get('/', (request, reply) => {
  reply.from()
})

t.tearDown(target.close.bind(target))

async function run () {
  await target.listen(0)

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: true,
    rejectUnauthorized: false
  })

  await instance.listen(0)

  t.test('http2 -> http2', async (t) => {
    const { headers, body } = await h2url.concat({
      url: `https://localhost:${instance.server.address().port}`
    })

    t.equal(headers[':status'], 404)
    t.equal(headers['x-my-header'], 'hello!')
    t.equal(headers['content-type'], 'application/json')
    t.deepEqual(JSON.parse(body), { hello: 'world' })
  })
}

run()
