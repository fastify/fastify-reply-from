'use strict'

const h2url = require('h2url')
const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')
const fs = require('fs')
const path = require('path')
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
t.teardown(instance.close.bind(instance))

const target = Fastify({
  https: certs
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

t.teardown(target.close.bind(target))

async function run () {
  await target.listen(0)

  instance.register(From, {
    base: `https://localhost:${target.server.address().port}`,
    rejectUnauthorized: false
  })

  await instance.listen(0)

  t.test('http2 -> https', async (t) => {
    const { headers, body } = await h2url.concat({
      url: `https://localhost:${instance.server.address().port}`
    })

    t.equal(headers[':status'], 404)
    t.equal(headers['x-my-header'], 'hello!')
    t.match(headers['content-type'], /application\/json/)
    t.same(JSON.parse(body), { hello: 'world' })
  })

  t.test('https -> https', async (t) => {
    try {
      await got(`https://localhost:${instance.server.address().port}`, {
        https: {
          rejectUnauthorized: false
        }
      })
    } catch (err) {
      t.equal(err.response.statusCode, 404)
      t.equal(err.response.headers['x-my-header'], 'hello!')
      t.match(err.response.headers['content-type'], /application\/json/)
      t.same(JSON.parse(err.response.body), { hello: 'world' })
      return
    }
    t.fail()
  })
}

run()
