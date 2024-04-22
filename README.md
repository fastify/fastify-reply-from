# @fastify/reply-from

[![CI](https://github.com/fastify/fastify-reply-from/workflows/CI/badge.svg)](https://github.com/fastify/fastify-reply-from/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/@fastify/reply-from.svg?style=flat)](https://www.npmjs.com/package/@fastify/reply-from)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://standardjs.com/)

Fastify plugin to forward the current HTTP request to another server.
HTTP2 to HTTP is supported too.

## Install

```
npm i @fastify/reply-from
```

## Compatibility with @fastify/multipart
`@fastify/reply-from` and [`@fastify/multipart`](https://github.com/fastify/fastify-multipart) should not be registered as sibling plugins nor should they be registered in plugins which have a parent-child relationship.`<br>` The two plugins are incompatible, in the sense that the behavior of `@fastify/reply-from` might not be the expected one when the above-mentioned conditions are not respected.`<br>` This is due to the fact that `@fastify/multipart` consumes the multipart content by parsing it, hence this content is not forwarded to the target service by `@fastify/reply-from`.`<br>`
However, the two plugins may be used within the same fastify instance, at the condition that they belong to disjoint branches of the fastify plugins hierarchy tree.

## Usage

The following example set up two Fastify servers and forward the request
from one to the other:

```js
'use strict'

const Fastify = require('fastify')

const target = Fastify({
  logger: true
})

target.get('/', (request, reply) => {
  reply.send('hello world')
})

const proxy = Fastify({
  logger: true
})

proxy.register(require('@fastify/reply-from'), {
  base: 'http://localhost:3001/'
})

proxy.get('/', (request, reply) => {
  reply.from('/')
})

target.listen({ port: 3001 }, (err) => {
  if (err) {
    throw err
  }

  proxy.listen({ port: 3000 }, (err) => {
    if (err) {
      throw err
    }
  })
})
```

## API

### Plugin options

#### `base`

Set the base URL for all the forwarded requests. Will be required if `http2` is set to `true`
Note that _every path will be discarded_.

Custom URL protocols `unix+http:` and `unix+https:` can be used to forward requests to a unix
socket server by using `querystring.escape(socketPath)` as the hostname.  This is not supported
for http2 nor undici.  To illustrate:

```js
const socketPath = require('node:querystring').escape('/run/http-daemon.socket')
proxy.register(require('@fastify/reply-from'), {
  base: 'unix+http://${socketPath}/'
});
```

#### `undici`

By default, [undici](https://github.com/nodejs/undici) will be used to perform the HTTP/1.1
requests. Enabling this flag should guarantee
20-50% more throughput.

This flag could controls the settings of the undici client, like so:

```js
proxy.register(require('@fastify/reply-from'), {
  base: 'http://localhost:3001/',
  // default settings
  undici: {
    connections: 128,
    pipelining: 1,
    keepAliveTimeout: 60 * 1000,
    tls: {
      rejectUnauthorized: false
    }
  }
})
```

You can also include a proxy for the undici client:

```js
proxy.register(require('@fastify/reply-from'), {
  base: 'http://localhost:3001/',
  undici: {
    proxy: 'http://my.proxy.server:8080',
  }
})
```

See undici own options for more configurations.

You can also pass the plugin a custom instance:

```js
proxy.register(require('@fastify/reply-from'), {
  base: 'http://localhost:3001/',
  undici: new undici.Pool('http://localhost:3001')
})
```

#### `http`

Set the `http` option to an Object to use
Node's [`http.request`](https://nodejs.org/api/http.html#http_http_request_options_callback)
will be used if you do not enable [`http2`](#http2). To customize the `request`,
you can pass in [`agentOptions`](https://nodejs.org/api/http.html#http_new_agent_options) and
[`requestOptions`](https://nodejs.org/api/http.html#http_http_request_options_callback). To illustrate:

```js
proxy.register(require('@fastify/reply-from'), {
  base: 'http://localhost:3001/',
  http: {
    agentOptions: { // pass in any options from https://nodejs.org/api/http.html#http_new_agent_options
      keepAliveMsecs: 10 * 60 * 1000
    },
    requestOptions: { // pass in any options from https://nodejs.org/api/http.html#http_http_request_options_callback
      timeout: 5000 // timeout in msecs, defaults to 10000 (10 seconds)
    }
  }
})
```

You can also pass custom HTTP agents. If you pass the agents, then the http.agentOptions will be ignored. To illustrate:

```js
proxy.register(require('@fastify/reply-from'), {
  base: 'http://localhost:3001/',
  http: {
    agents: {
      'http:': new http.Agent({ keepAliveMsecs: 10 * 60 * 1000 }), // pass in any options from https://nodejs.org/api/http.html#http_new_agent_options
      'https:': new https.Agent({ keepAliveMsecs: 10 * 60 * 1000 })

    },
    requestOptions: { // pass in any options from https://nodejs.org/api/http.html#http_http_request_options_callback
      timeout: 5000 // timeout in msecs, defaults to 10000 (10 seconds)
    }
  }
})
```

#### `http2`

You can either set `http2` to `true` or set the settings object to connect to a HTTP/2 server.
The `http2` settings object has the shape of:

```js
proxy.register(require('@fastify/reply-from'), {
  base: 'http://localhost:3001/',
  http2: {
    sessionTimeout: 10000, // HTTP/2 session timeout in msecs, defaults to 60000 (1 minute)
    requestTimeout: 5000, // HTTP/2 request timeout in msecs, defaults to 10000 (10 seconds)
    sessionOptions: { // HTTP/2 session connect options, pass in any options from https://nodejs.org/api/http2.html#http2_http2_connect_authority_options_listener
      rejectUnauthorized: true
    },
    requestOptions: { // HTTP/2 request options, pass in any options from https://nodejs.org/api/http2.html#clienthttp2sessionrequestheaders-options
      endStream: true
    }
  }
})
```

#### `disableRequestLogging`

By default package will issue log messages when a request is received. By setting this option to true, these log messages will be disabled.

Default for `disableRequestLogging` will be `false`. To disable the log messages set `disableRequestLogging` to `true`.

```js
proxy.register(require('@fastify/reply-from'), {
  base: 'http://localhost:3001/',
  disableRequestLogging: true // request log messages will be disabled
})
```

#### `cacheURLs`

The number of parsed URLs that will be cached. Default: `100`.

#### `disableCache`

This option will disable the URL caching.
This cache is dedicated to reduce the amount of URL object generation.
Generating URLs is a main bottleneck of this module, please disable this cache with caution.

#### `contentTypesToEncode`

An array of content types whose response body will be passed through `JSON.stringify()`.
This only applies when a custom [`body`](#body) is not passed in. Defaults to:

```js
[
  'application/json'
]
```

#### `retryMethods`

On which methods should the connection be retried in case of socket hang up.
**Be aware** that setting here not idempotent method may lead to unexpected results on target.

By default: `['GET', 'HEAD', 'OPTIONS', 'TRACE']`

This plugin will always retry on 503 errors, _unless_ `retryMethods` does not contain `GET`.

#### `globalAgent`

Enables the possibility to explictly opt-in for global agents.

Usage for undici global agent:

```js
import { setGlobalDispatcher, ProxyAgent } from 'undici'

const proxyAgent = new ProxyAgent('my.proxy.server')
setGlobalDispatcher(proxyAgent)

fastify.register(FastifyReplyFrom, {
  base: 'http://localhost:3001/',
  globalAgent: true
})
```

Usage for http/https global agent:

```js
fastify.register(FastifyReplyFrom, {
  base: 'http://localhost:3001/',
  // http and https is allowed to use http.globalAgent or https.globalAgent
  globalAgent: true,
  http: {
  }
})
```

---

#### `destroyAgent`

If set to `true`, it will destroy all agents when the Fastify is closed.
If set to `false`, it will not destroy the agents.

By Default: `false`

---

#### `maxRetriesOn503`

This plugin will always retry on `GET` requests that returns 503 errors, _unless_ `retryMethods` does not contain `GET`.

This option set the limit on how many times the plugin should retry the request, specifically for 503 errors.

By Default: 10

---

### `retryDelay`

- `handler`. Required

This plugin gives the client an option to pass their own retry callback to allow the client to define what retryDelay they would like on any retries
outside the scope of what is handled by default in fastify-reply-from. To see the default please refer to index.js `getDefaultDelay()`
If a `handler` is passed to the `retryDelay` object the onus is on the client to invoke the default retry logic in their callback otherwise default cases such as 500 will not be handled

- `err` is the error thrown by making a request using whichever agent is configured
- `req` is the raw request details sent to the underlying agent. __Note__: this object is not a Fastify request object, but instead the low-level request for the agent.
- `res` is the raw response returned by the underlying agent (if available) __Note__: this object is not a Fastify response, but instead the low-level response from the agent. This property may be null if no response was obtained at all, like from a connection reset or timeout.
- `attempt` in the object callback refers to the current retriesAttempt number. You are given the freedom to use this in concert with the retryCount property set to handle retries
- `getDefaultRetry` refers to the default retry handler. If this callback returns not null and you wish to handle those case of errors simply invoke it as done below.
- `retriesCount` refers to the retriesCount property a client passes to reply-from. Note if the client does not explicitly set this value it will default to 0. The objective value here is to avoid hard-coding and seeing the retriesCount set. It is your perogative to ensure that you ensure the value here is as you wish (and not `0` if not intended to be as a result of a lack of not setting it).

Given example

```js
   const customRetryLogic = ({err, req, res, attempt, getDefaultRetry}) => {
    //If this block is not included all non 500 errors will not be retried
    const defaultDelay = getDefaultDelay();
    if (defaultDelay) return defaultDelay();

    //Custom retry logic
    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 300
    }

    if (err && err.code == "UND_ERR_SOCKET"){
      return 600
    }

    return null
  }

.......

fastify.register(FastifyReplyFrom, {
  base: 'http://localhost:3001/',
  retryDelay: customRetryLogic
})

```

Note the Typescript Equivalent
```
const customRetryLogic = ({req, res, err, getDefaultRetry}: RetryDetails) => {
  ...
}
...

```
---

### `reply.from(source, [opts])`

The plugin decorates the
[`Reply`](https://fastify.dev/docs/latest/Reference/Reply)
instance with a `from` method, which will reply to the original request
__from the desired source__. The options allows to override any part of
the request or response being sent or received to/from the source.

**Note: If `base` is specified in plugin options, the `source` here should not override the host/origin.**

#### `onResponse(request, reply, res)`

Called when a HTTP response is received from the source.
The default behavior is `reply.send(res)`, which will be disabled if the
option is specified.

When replying with a body of a different length it is necessary to remove
the `content-length` header.

```js
{
  onResponse: (request, reply, res) => {
    reply.removeHeader('content-length');
    reply.send('New body of different length');
  }
}
```

#### `onError(reply, error)`

Called when a HTTP response is received with error from the source.
The default behavior is `reply.send(error)`, which will be disabled if the
option is specified.
It must reply the error.

#### `rewriteHeaders(headers, request)`

Called to rewrite the headers of the response, before them being copied
over to the outer response.
Parameters are the original headers and the Fastify request.
It must return the new headers object.

#### `rewriteRequestHeaders(request, headers)`

Called to rewrite the headers of the request, before them being sent to the other server.
Parameters are the Fastify request and the original request headers.
It must return the new headers object.

#### `getUpstream(request, base)`

Called to get upstream destination, before the request is being sent. Useful when you want to decide which target server to call based on the request data.
Helpful for a gradual rollout of new services.
Parameters are the Fastify request and the base string from the plugin options.
It must return the upstream destination.

Only http1! As http2 uses one connection for the whole session only the base upstream is used. If you want to
have different upstreams based on the request you can add multiple Fastify.register's with different
ContraintStrategies.

e.g.:

Route grpc-web/http1 and grpc/http2 to different routes with a ContentType-ConstraintStrategy:

```
const contentTypeMatchContraintStrategy = {
    // strategy name for referencing in the route handler `constraints` options
    name: 'contentType',
    // storage factory for storing routes in the find-my-way route tree
    storage: function () {
      let handlers = {}
      return {
        get: (type: any) => { return handlers[type] || null },
        set: (type: any, store: any) => { handlers[type] = store }
      }
    },
    // function to get the value of the constraint from each incoming request
    deriveConstraint: (req: any, ctx: any) => {
      return req.headers['content-type']
    },
    // optional flag marking if handlers without constraints can match requests that have a value for this constraint
    mustMatchWhenDerived: true
  }

  server.addConstraintStrategy(contentTypeMatchContraintStrategy);
```

and then 2 different upstreams with different register's:

```
// grpc-web / http1
server.register(fastifyHttpProxy, {
    // Although most browsers send with http2, nodejs cannot handle this http2 request
    // therefore we have to transport to the grpc-web-proxy via http1
    http2: false,
    upstream: 'http://grpc-web-proxy',
    constraints: { "contentType": "application/grpc-web+proto" }
});

// grpc / http2
server.register(fastifyHttpProxy, {
    http2: true,
    upstream: 'http://grpc.server',
    constraints: { "contentType": "application/grpc+proto" }
});
```

#### `queryString` or `queryString(search, reqUrl, request)`

Replaces the original querystring of the request with what is specified.
This will be passed to
[`querystring.stringify`](https://nodejs.org/api/querystring.html#querystring_querystring_stringify_obj_sep_eq_options).

- `object`: accepts an object that will be passed to `querystring.stringify`
- `function`: function that will return a string with the query parameters e.g. `name=test&type=user`

#### `body`

Replaces the original request body with what is specified. Unless
[`contentType`](#contentType) is specified, the content will be passed
through `JSON.stringify()`.
Setting this option for GET, HEAD requests will throw an error "Rewriting the body when doing a {GET|HEAD} is not allowed".
Setting this option to `null` will strip the body (and `content-type` header) entirely from the proxied request.

#### `method`

Replaces the original request method with what is specified.

#### `retriesCount`

How many times it will try to pick another connection on socket hangup (`ECONNRESET` error).
Useful when keeping the connection open (KeepAlive).
This number should be a function of the number of connections and the number of instances of a target.

By default: 0 (disabled)

#### `contentType`

Override the `'Content-Type'` header of the forwarded request, if we are
already overriding the [`body`](#body).

### Combining with [@fastify/formbody](https://github.com/fastify/fastify-formbody)

`formbody` expects the body to be returned as a string and not an object.
Use the [`contentTypesToEncode`](#contentTypesToEncode) option to pass in `['application/x-www-form-urlencoded']`

### HTTP & HTTP2 timeouts

This library has:

- `timeout` for `http` set by default. The default value is 10 seconds (`10000`).
- `requestTimeout` & `sessionTimeout` for `http2` set by default.
  - The default value for `requestTimeout` is 10 seconds (`10000`).
  - The default value for `sessionTimeout` is 60 seconds (`60000`).

When a timeout happens, [`504 Gateway Timeout`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/504)
will be returned to the client.

## TODO

* [ ] support overriding the body with a stream
* [ ] forward the request id to the other peer might require some
  refactoring because we have to make the `req.id` unique
  (see [hyperid](https://npm.im/hyperid)).
* [ ] Support origin HTTP2 push
* [X] benchmarks

## License

MIT

[http-agent]: https://nodejs.org/api/http.html#http_new_agent_options
[https-agent]: https://nodejs.org/api/https.html#https_class_https_agent
