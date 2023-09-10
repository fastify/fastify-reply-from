'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const https = require('node:https')
const get = require('simple-get').concat

const fs = require('node:fs')
const path = require('node:path')
const certs = {
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.cert'))
}

test('https global agent is used, but not destroyed', async (t) => {
  https.globalAgent.destroy = () => {
    t.fail()
  }
  const instance = Fastify({
    https: certs
  })
  t.teardown(instance.close.bind(instance))
  instance.get('/', (request, reply) => {
    reply.from()
  })

  const target = https.createServer(certs, (req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    t.equal(req.url, '/')
    res.statusCode = 200
    res.end()
  })
  t.teardown(target.close.bind(target))

  const executionFlow = () => new Promise((resolve) => {
    target.listen({ port: 0 }, (err) => {
      t.error(err)

      instance.register(From, {
        base: `https://localhost:${target.address().port}`,
        globalAgent: true,
        http: {
        }
      })

      instance.listen({ port: 0 }, (err) => {
        t.error(err)

        get(
          {
            url: `https://localhost:${instance.server.address().port}`,
            rejectUnauthorized: false
          },
          (err, res) => {
            t.error(err)
            t.equal(res.statusCode, 200)
            resolve()
          }
        )
      })
    })
  })

  await executionFlow()

  target.close()
})
