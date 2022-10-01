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
const { meter, metricAttrs, tracer } = setupOpentelemetry('Fastify Auth')
// Create metric instruments
const { requestCounter } = createMetrics(meter, metricAttrs)

const api = require('@opentelemetry/api')
const fastify = require('fastify')()
fastify.register(require('@fastify/jwt'), {
  secret: 'qwertyuiopasdfghjklzxcvbnm123456'
})

const port = process.env.PORT || 8080;

const schema = {
  body: {
    type: 'object',
    properties: {
      token: { type: 'string' }
    }
  }
}

fastify.post('/verify', schema, async (req, reply) => {
  requestCounter.add(1, metricAttrs)
  try {
    const decodedToken = await fastify.jwt.verify(req.body.token)
    reply.code(200)
    reply.send(decodedToken)
  } catch (err) {
    const activeSpan = api.trace.getSpan(api.context.active())
    activeSpan.recordException(err)
    reply.code(401)
    return reply.send()
  }
})

fastify.listen({ host: '0.0.0.0', port }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  // Server is now listening on ${address}
})
