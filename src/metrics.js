const os = require("os");
const config = require("./config");

const requests = {};

// class MetricBuilder {
//   constructor() {
//     this.metrics = [];
//   }

//   add(name, value, tags = {}) {
//     const tagString = Object.entries(tags)
//       .map(([k, v]) => `${k}="${v}"`)
//       .join(",");

//     this.metrics.push(`${name}{${tagString}} ${value}`);
//   }

//   toString(separator = "\n") {
//     return this.metrics.join(separator);
//   }

//   clear() {
//     this.metrics = [];
//   }
// }

class MetricBuilder {
  constructor() {
    this.metrics = [];
  }

  add(name, value, tags = {}) {
    const attributes = Object.entries(tags).map(([key, val]) => ({
      key,
      value: { stringValue: val },
    }));

    this.metrics.push({
      name,
      unit: "1",
      sum: {
        dataPoints: [
          {
            asInt: value,
            timeUnixNano: Date.now() * 1e6,
            attributes,
          },
        ],
        aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
        isMonotonic: true,
      },
    });
  }

  toOTLP() {
    return {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: this.metrics,
            },
          ],
        },
      ],
    };
  }

  clear() {
    this.metrics = [];
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

function httpMetrics(buf) {
  Object.values(requests).forEach((record) => {
    buf.add("http_requests_total", record.count, {
      method: record.method,
      endpoint: record.path,
    });
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

// function sendRawMetricsToGrafana(metricString) {
//   fetch(`${config.url}`, {
//     method: "POST",
//     body: metricString,
//     headers: {
//       Authorization: `Bearer ${config.apiKey}`,
//       "Content-Type": "text/plain",
//     },
//   })
//     .then((response) => {
//       if (!response.ok) {
//         console.error("Failed to push metrics to Grafana");
//       } else {
//         console.log("✅ Pushed metrics to Grafana");
//       }
//     })
//     .catch((err) => {
//       console.error("Error sending metrics:", err);
//     });
// }

// function sendMetricsPeriodically(period) {
//   setInterval(() => {
//     try {
//       const buf = new MetricBuilder();
//       httpMetrics(buf);
//       systemMetrics(buf);
//       //userMetrics(buf);
//       //purchaseMetrics(buf);
//       authMetrics(buf);

//       const metrics = buf.toString("\n");
//       sendMetricToGrafana(metrics);
//     } catch (error) {
//       console.log("Error sending metrics", error);
//     }
//   }, period);
// }

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

  console.log("Here's the url I am using so please work: ", config.metrics.url);
  fetch(`${config.metrics.url}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
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

// function sendMetricToGrafana(metricName, metricValue, attributes) {
//   attributes = { ...attributes, source: config.source };

//   const metric = {
//     resourceMetrics: [
//       {
//         scopeMetrics: [
//           {
//             metrics: [
//               {
//                 name: metricName,
//                 unit: "1",
//                 sum: {
//                   dataPoints: [
//                     {
//                       asInt: metricValue,
//                       timeUnixNano: Date.now() * 1000000,
//                       attributes: [],
//                     },
//                   ],
//                   aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
//                   isMonotonic: true,
//                 },
//               },
//             ],
//           },
//         ],
//       },
//     ],
//   };

//   Object.keys(attributes).forEach((key) => {
//     metric.resourceMetrics[0].scopeMetrics[0].metrics[0].sum.dataPoints[0].attributes.push(
//       {
//         key: key,
//         value: { stringValue: attributes[key] },
//       }
//     );
//   });

//   fetch(`${config.url}`, {
//     method: "POST",
//     body: JSON.stringify(metric),
//     headers: {
//       Authorization: `Bearer ${config.apiKey}`,
//       "Content-Type": "application/json",
//     },
//   })
//     .then((response) => {
//       if (!response.ok) {
//         console.error("Failed to push metrics data to Grafana");
//       } else {
//         console.log(`Pushed ${metricName}`);
//       }
//     })
//     .catch((error) => {
//       console.error("Error pushing metrics:", error);
//     });
// }

module.exports = { requestTracker, sendMetricsPeriodically };
