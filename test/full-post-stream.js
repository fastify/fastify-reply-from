'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat

const instance = Fastify()
instance.register(From)

t.plan(8)
t.tearDown(instance.close.bind(instance))

instance.addContentTypeParser('application/octet-stream', function (req, payload, done) {
  done(null, payload)
})

t.tearDown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'POST')
  t.equal(req.headers['content-type'], 'application/octet-stream')
  let data = ''
  req.setEncoding('utf8')
  req.on('data', (d) => {
    data += d
  })
  req.on('end', () => {
    t.deepEqual(JSON.parse(data), { hello: 'world' })
    res.statusCode = 200
    res.setHeader('content-type', 'application/octet-stream')
    res.end(JSON.stringify({ something: 'else' }))
  })
})

instance.post('/', (request, reply) => {
  reply.from(`http://localhost:${target.address().port}`)
})

t.tearDown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)

  target.listen(0, (err) => {
    t.error(err)

    get({
      url: `http://localhost:${instance.server.address().port}`,
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream'
      },
      body: JSON.stringify({
        hello: 'world'
      })
    }, (err, res, data) => {
      t.error(err)
      t.deepEqual(JSON.parse(data), { something: 'else' })
    })
  })
})
