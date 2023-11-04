'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const got = require('got')

function internalErrorServerWhichRevives (withRetryAfterHeader, stopAfter = 4) {
  let requestCount = 0
  return http.createServer((req, res) => {
    if (requestCount++ < stopAfter) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain')
      if (withRetryAfterHeader) {
        res.setHeader('Retry-After', 100) // 100 ms
      }

      return res.end('This Service is Unavailable')
    }

    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    return res.end(`Hello World ${requestCount}!`)
  })
}




test('retry a 500 status code in a custom manner', async function (t) {
  const customRetryLogic = (req, res, registerDefaultRetry, defaultRetryAfter) => {
    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 300
    }
    return null
  }

  const target = internalErrorServerWhichRevives(true)
  await target.listen({ port: 0 })
  t.teardown(target.close.bind(target))

  const instance = Fastify()
  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (request, reply) => {
    console.log('getting reply from broken serve')
    reply.from(`http://localhost:${target.address().port}`, {
      customRetry: { retries: 10, handler: customRetryLogic }
    })
  })

  t.teardown(instance.close.bind(instance))
  await instance.listen({ port: 0 })

  // ----- End Registering The Fastify Server ---

  // making a request to the server we setup through fastify
  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })
  console.log('request to server', { statusCode: res.statusCode, body: res.body.toString()})

  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 5!')
})



const create503ServerWhichRevivesAfterRetries = async () => {
  let retryCount = 0;

  return http.createServer((req, res) => {
    if (retryCount++ < 2){
      res.statusCode = 503
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('retry-after', 200)
      return res.end('This Service is Unavailable')
    }else{
      res.statusCode = 205
      res.setHeader('Content-Type', 'text/plain')
      return res.end(`Welcome After ${retryCount}`)
    }
  })
}



//we want to be able to registerDefaultRetry which will return retryAfter if we have a default cause
//we want our default handler to use either our own retryAfter value or use it's own
//


//test cases
// -> a server just 503's and as have a custom handler attached and we register the default
// -> a server just 503's and we have a custom handler and we don't register the default. expect to 503
// -> a server 503's and we don't have a custom handler we should still revive


// -> a server 500's and we don't have a custom handler we should fail
// -> a server 500's and we have a custom handler we should revive
// -> server 500's with a custom handler and we revive but then we 503 without registering we should ultimately fail
// -> a server 500's with a custom handler and we revive but then we 503 with registering

test('we should revive a 503 ', async function(t) {

  const revival
})
