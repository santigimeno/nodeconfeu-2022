'use strict'

const { performance } = require('perf_hooks')

let last_cpu = process.cpuUsage()
let prev_time = performance.now()

function getCPUUsage () {
  const now = performance.now()
  const elapsed = now - prev_time
  const current = process.cpuUsage()
  const ret = (((current.user + current.system) - (last_cpu.user + last_cpu.system))/ 1000) * 100 / elapsed
  last_cpu = current;
  prev_time = now;
  return ret;
}

// Make sure you get an initial ELU.
let last_elu = performance.eventLoopUtilization()

function getELUUsage() {
  // Need to first get the full ELU.
  let current = performance.eventLoopUtilization()
  // Here the difference of the two values is taken.
  let value = performance.eventLoopUtilization(current, last_elu)
  last_elu = current
  return value.utilization * 100
}

function getMemoryUsage () {
  const mem = process.memoryUsage()
  Object.keys(mem).forEach(type => {
    mem[type] = mem[type] * 0.000001
  })
  return mem
}

module.exports = {
  getCPUUsage,
  getELUUsage,
  getMemoryUsage
}
