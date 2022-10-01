'use strict';

function setupOpentelemetry(serviceName) {
  const { FastifyInstrumentation } = require('@opentelemetry/instrumentation-fastify')
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')

  const { ignoreIncomingRequestHook, setup } = require('./otel')

  const instrumentations = [
    // Fastify instrumentation expects HTTP layer to be instrumented
    new HttpInstrumentation({ ignoreIncomingRequestHook }),
    new FastifyInstrumentation()
  ];

  return setup(serviceName, instrumentations);
}

function createMetrics(meter, metricAttrs) {
  const {
    getCPUUsage,
    getELUUsage,
  } = require('./tools')

  const requestCounter = meter.createCounter('http.requests', {
    description: 'HTTP Requests Counter',
  });

  const cpuUsage = meter.createObservableGauge('process.cpu', {
    description: 'CPU Usage',
  });

  cpuUsage.addCallback(result => {
    result.observe(getCPUUsage(), metricAttrs);
  });

  const eluUsage = meter.createObservableGauge('thread.elu', {
    description: 'ELU Usage',
  });

  eluUsage.addCallback(result => {
    result.observe(getELUUsage(), metricAttrs);
  });

  return {
    cpuUsage,
    eluUsage,
    requestCounter
  };
}

// Setting up observability BEFORE our actual code.
const { meter, metricAttrs, tracer } = setupOpentelemetry('Fastify API')
// Create metric instruments
const { requestCounter } = createMetrics(meter, metricAttrs)

const api = require('@opentelemetry/api')
const fastify = require('fastify')()
const fetch = require('node-fetch')
const port = process.env.PORT || 8080

fastify.addHook('preHandler', async(req, reply) => {
  requestCounter.add(1, metricAttrs)
  let token = ''
  const auth = req.headers.authorization
  if (auth) {
    const parts = auth.split(' ')
    token = parts[1]
  }

  const opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token
    }),
  }

  const resp = await fetch('http://auth:8080/verify', opts)
  if (resp.status >= 400) {
    reply.code(resp.status)
    reply.send()
    return reply
  }


  const body = await resp.json();
  const activeSpan = api.trace.getSpan(api.context.active())
  activeSpan.addEvent('User Authenticated', { licenseKey: body.licenseKey })
})

fastify.get('/', async () => {
  const id = generateRandomInt(1, 110)
  const req = await fetch(`http://service_1:8080/users/${id}`)
  const payload = await req.json()
  return payload
})

fastify.listen({ host: '0.0.0.0', port }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  // Server is now listening on ${address}
})

function generateRandomInt(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1) + min)
}