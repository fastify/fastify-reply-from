'use strict'

const t = require('tap')
const get = require('simple-get').concat
const undici = require('undici')
const Fastify = require('fastify')
const FastifyUndiciDispatcher = require('fastify-undici-dispatcher')
const From = require('..')

const target = Fastify()
target.get('/', (req, reply) => {
  t.pass('request proxied')
  t.equal(req.headers.connection, 'keep-alive')

  reply.headers({
    'Content-Type': 'text/plain',
    'x-my-header': 'hello!'
  })

  reply.statusCode = 205
  reply.send('hello world')
})

t.test('use a custom instance of \'undici\'', async t => {
  t.teardown(target.close.bind(target))

  await new Promise((resolve, reject) => target.listen({ port: 0 }, err => err ? reject(err) : resolve()))

  t.test('custom undici dispatcher', t => {
    const instance = Fastify()
    t.teardown(instance.close.bind(instance))

    const fastifyDispatcher = new FastifyUndiciDispatcher(new undici.Agent())
    fastifyDispatcher.route('myserver.local', target)

    instance.register(From, {
      undici: fastifyDispatcher
    })

    instance.get('/', (request, reply) => {
      reply.from('http://myserver.local')
    })

    instance.listen({ port: 0 }, (err) => {
      t.error(err)

      get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
        t.error(err)
        t.equal(res.headers['content-type'], 'text/plain')
        t.equal(res.headers['x-my-header'], 'hello!')
        t.equal(res.statusCode, 205)
        t.equal(data.toString(), 'hello world')
        t.end()
      })
    })
  })
})
