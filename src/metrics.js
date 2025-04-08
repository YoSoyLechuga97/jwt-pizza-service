const os = require("os");
const config = require("./config");

const requests = {};

// class MetricBuilder {
//   constructor() {
//     this.metrics = [];
//   }

//   add(name, value, tags = {}) {
//     const attributes = Object.entries(tags).map(([key, val]) => ({
//       key,
//       value: { stringValue: val },
//     }));

//     this.metrics.push({
//       name,
//       unit: "1",
//       sum: {
//         dataPoints: [
//           {
//             asInt: value,
//             timeUnixNano: Date.now() * 1000000,
//             attributes: [],
//           },
//         ],
//         aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
//         isMonotonic: true,
//       },
//     });

//     Object.keys(attributes).forEach((key) => {
//       this.metric.resourceMetrics[0].scopeMetrics[0].metrics[0].sum.dataPoints[0].attributes.push(
//         {
//           key: key,
//           value: { stringValue: attributes[key] },
//         }
//       );
//     });
//   }

//   toOTLP() {
//     return {
//       resourceMetrics: [
//         {
//           resource: {
//             attributes: this.attributes,
//           },
//           scopeMetrics: [
//             {
//               metrics: this.metrics,
//             },
//           ],
//         },
//       ],
//     };
//   }

//   clear() {
//     this.metrics = [];
//   }
// }

class MetricBuilder {
  constructor() {
    this.metricMap = new Map(); // key => metric
  }

  _buildKey(name, tags) {
    return `${name}|${Object.entries(tags)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join(",")}`;
  }

  add(name, value, tags = {}) {
    const key = this._buildKey(name, tags);
    const attributes = Object.entries(tags).map(([key, val]) => ({
      key,
      value: { stringValue: val },
    }));

    if (this.metricMap.has(key)) {
      // Increment the existing value
      this.metricMap.get(key).sum.dataPoints[0].asDouble += value;
    } else {
      // Create a new metric entry
      this.metricMap.set(key, {
        name,
        unit: "1",
        sum: {
          dataPoints: [
            {
              asDouble: value,
              timeUnixNano: Date.now() * 1e6,
              attributes,
            },
          ],
          aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
          isMonotonic: true,
        },
      });
    }
  }

  toOTLP() {
    return {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: config.source || "my-service" },
              },
            ],
          },
          scopeMetrics: [
            {
              metrics: Array.from(this.metricMap.values()),
            },
          ],
        },
      ],
    };
  }

  clear() {
    this.metricMap.clear();
  }
}

function requestTracker(req, res, next) {
  const method = req.method;
  const path = req.path;
  const key = `${req.method} ${req.path}`;
  const start = Date.now();

  if (!requests[key]) {
    requests[key] = {
      method,
      path,
      count: 0,
      durations: [], // For latency
      statuses: {}, // For success/failure/response codes
    };
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const record = requests[key];

    record.count += 1;
    record.durations.push(duration);

    if (!record.statuses[status]) {
      record.statuses[status] = 0;
    }
    record.statuses[status] += 1;
  });

  next();
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

// function httpMetrics(buf) {
//   Object.values(requests).forEach((record) => {
//     buf.add("http_requests_total", record.count, {
//       method: record.method,
//       endpoint: record.path,
//     });
//   });
// }

function httpMetrics(buf) {
  Object.values(requests).forEach((record) => {
    const { method, path, count } = record;

    // Only track endpoint details for these:
    const isAuth = path.startsWith("/auth");
    const isOrder = path.includes("order") || path.includes("pizza");

    if (isAuth || isOrder) {
      buf.add("http_requests_total", count, {
        method,
        endpoint: isAuth ? "/auth" : "/order",
      });
    } else {
      // Everything else gets grouped by method only
      buf.add("http_requests_total", count, {
        method,
        endpoint: "general",
      });
    }
  });
}

function systemMetrics(buf) {
  const cpuUsage = getCpuUsagePercentage();
  const memoryUsage = getMemoryUsagePercentage();

  buf.add("system_cpu_usage_percentage", cpuUsage);
  buf.add("system_memory_usage_percentage", memoryUsage);
}

//TODO USERMETRICS (FIND OUT HOW MANY USERS ARE LOGGED IN)

//TODO PURCHASEMETRICS (FIND OUT HOW MANY PURCHASES ARE MADE)

function authMetrics(buf) {
  Object.values(requests).forEach((record) => {
    if (record.path.startsWith("/auth")) {
      const success = record.statuses[200] || 0;
      const fail = Object.entries(record.statuses)
        .filter(([code]) => code !== "200")
        .reduce((sum, [, count]) => sum + count, 0);

      buf.add("auth_attempts_success", success, { endpoint: record.path });
      buf.add("auth_attempts_failed", fail, { endpoint: record.path });
    }
  });
}

function sendMetricsPeriodically(period) {
  setInterval(() => {
    try {
      const buf = new MetricBuilder();
      httpMetrics(buf);
      systemMetrics(buf);
      authMetrics(buf);
      // userMetrics(buf);
      // purchaseMetrics(buf);

      const metricPayload = buf.toOTLP();
      if (
        !metricPayload.resourceMetrics?.[0]?.scopeMetrics?.[0]?.metrics ||
        metricPayload.resourceMetrics[0].scopeMetrics[0].metrics.length === 0
      ) {
        console.log("No metrics to send this round.");
        return; // ⛔ Don’t send empty payloads
      }
      sendMetricsToGrafana(metricPayload);
    } catch (error) {
      console.error("Error collecting metrics", error);
    }
  }, period);
}

function sendMetricsToGrafana(payload) {
  // Append `source` to each data point
  const sourceTag = { key: "source", value: { stringValue: config.source } };

  payload.resourceMetrics[0].scopeMetrics[0].metrics.forEach((metric) => {
    metric.sum.dataPoints.forEach((dp) => {
      dp.attributes.push(sourceTag);
    });
  });

  console.log("Here is the api key: ", config.metrics.apiKey);
  console.log("Here is the payload: ", JSON.stringify(payload, null, 2));

  fetch(`${config.metrics.url}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (!res.ok) {
        console.error("Failed to push metrics to Grafana:", res.statusText);
      } else {
        console.log("Metrics pushed to Grafana!");
      }
    })
    .catch((err) => {
      console.error("Error pushing metrics:", err);
    });
}

module.exports = { requestTracker, sendMetricsPeriodically };
