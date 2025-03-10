'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const fs = require('node:fs')
const querystring = require('node:querystring')
const http = require('node:http')

if (process.platform === 'win32') {
  t.pass()
  process.exit(0)
}

const instance = Fastify()
instance.register(From)

t.test('unix http undici from', async (t) => {
  t.plan(1)
  t.teardown(instance.close.bind(instance))

  const socketPath = `${__filename}.socket`

  try {
    fs.unlinkSync(socketPath)
  } catch (_) {
  }

  const target = http.createServer((_req, res) => {
    t.fail('no response')
    res.end()
  })

  instance.get('/', (_request, reply) => {
    reply.from(`unix+http://${querystring.escape(socketPath)}/hello`)
  })

  t.teardown(target.close.bind(target))

  await instance.listen({ port: 0 })

  await new Promise(resolve => target.listen(socketPath, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.equal(result.statusCode, 500)
})
