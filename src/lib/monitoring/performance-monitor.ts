import { logger } from '@/lib/utils/logger';
import { CONFIG } from '@/lib/config';

/**
 * Performance metric types
 */
export enum MetricType {
  COUNTER = 'COUNTER',
  GAUGE = 'GAUGE',
  HISTOGRAM = 'HISTOGRAM',
  TIMER = 'TIMER'
}

/**
 * Metric value interface
 */
export interface MetricValue {
  value: number;
  timestamp: number;
  labels: Record<string, string>;
}

/**
 * Performance metric
 */
export interface PerformanceMetric {
  name: string;
  type: MetricType;
  description: string;
  values: MetricValue[];
  unit: string;
}

/**
 * System health status
 */
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  CRITICAL = 'CRITICAL'
}

/**
 * Health check result
 */
export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message: string;
  timestamp: number;
  responseTime: number;
  details?: Record<string, any>;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  name: string;
  condition: (metric: PerformanceMetric) => boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cooldownMs: number;
  enabled: boolean;
}

/**
 * Alert event
 */
export interface AlertEvent {
  id: string;
  configName: string;
  metric: string;
  severity: string;
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
}

/**
 * Performance monitoring system
 */
export class PerformanceMonitor {
  private metrics = new Map<string, PerformanceMetric>();
  private healthChecks = new Map<string, () => Promise<HealthCheck>>();
  private alerts = new Map<string, AlertConfig>();
  private activeAlerts = new Map<string, AlertEvent>();
  private alertCooldowns = new Map<string, number>();

  constructor() {
    // Register default metrics
    this.registerDefaultMetrics();
    
    // Start metric collection
    setInterval(() => this.collectSystemMetrics(), 30 * 1000); // Every 30 seconds
    
    // Check alerts every minute
    setInterval(() => this.checkAlerts(), 60 * 1000);
    
    // Cleanup old metrics every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Register a custom metric
   */
  registerMetric(
    name: string,
    type: MetricType,
    description: string,
    unit: string = ''
  ): void {
    this.metrics.set(name, {
      name,
      type,
      description,
      values: [],
      unit
    });

    logger.debug('Metric registered', { name, type, description, unit }, 'PerformanceMonitor.registerMetric');
  }

  /**
   * Record a metric value
   */
  recordMetric(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      logger.warn('Attempted to record unknown metric', { name }, 'PerformanceMonitor.recordMetric');
      return;
    }

    const metricValue: MetricValue = {
      value,
      timestamp: Date.now(),
      labels
    };

    metric.values.push(metricValue);

    // Keep only last 1000 values per metric
    if (metric.values.length > 1000) {
      metric.values = metric.values.slice(-1000);
    }

    logger.debug('Metric recorded', { name, value, labels }, 'PerformanceMonitor.recordMetric');
  }

  /**
   * Start a timer for measuring execution time
   */
  startTimer(name: string, labels: Record<string, string> = {}): () => void {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration, labels);
    };
  }

  /**
   * Measure function execution time
   */
  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    labels: Record<string, string> = {}
  ): Promise<T> {
    const endTimer = this.startTimer(name, labels);
    try {
      const result = await fn();
      return result;
    } finally {
      endTimer();
    }
  }

  /**
   * Measure synchronous function execution time
   */
  measure<T>(
    name: string,
    fn: () => T,
    labels: Record<string, string> = {}
  ): T {
    const endTimer = this.startTimer(name, labels);
    try {
      return fn();
    } finally {
      endTimer();
    }
  }

  /**
   * Get metric statistics
   */
  getMetricStats(name: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    sum: number;
    latest: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const metric = this.metrics.get(name);
    if (!metric || metric.values.length === 0) {
      return null;
    }

    const values = metric.values.map(v => v.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((acc, val) => acc + val, 0);
    const avg = sum / count;

    return {
      count,
      min: values[0],
      max: values[count - 1],
      avg,
      sum,
      latest: metric.values[metric.values.length - 1].value,
      p50: values[Math.floor(count * 0.5)],
      p95: values[Math.floor(count * 0.95)],
      p99: values[Math.floor(count * 0.99)]
    };
  }

  /**
   * Register a health check
   */
  registerHealthCheck(
    name: string,
    checkFn: () => Promise<HealthCheck>
  ): void {
    this.healthChecks.set(name, checkFn);
    logger.debug('Health check registered', { name }, 'PerformanceMonitor.registerHealthCheck');
  }

  /**
   * Run all health checks
   */
  async runHealthChecks(): Promise<{
    overall: HealthStatus;
    checks: HealthCheck[];
  }> {
    const checks: HealthCheck[] = [];
    let overallStatus = HealthStatus.HEALTHY;

    for (const [name, checkFn] of this.healthChecks) {
      try {
        const result = await checkFn();
        checks.push(result);

        // Determine overall status (worst case)
        if (result.status === HealthStatus.CRITICAL) {
          overallStatus = HealthStatus.CRITICAL;
        } else if (result.status === HealthStatus.UNHEALTHY && overallStatus !== HealthStatus.CRITICAL) {
          overallStatus = HealthStatus.UNHEALTHY;
        } else if (result.status === HealthStatus.DEGRADED && 
                   overallStatus !== HealthStatus.CRITICAL && 
                   overallStatus !== HealthStatus.UNHEALTHY) {
          overallStatus = HealthStatus.DEGRADED;
        }
      } catch (error) {
        const healthCheck: HealthCheck = {
          name,
          status: HealthStatus.CRITICAL,
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
          responseTime: 0
        };
        checks.push(healthCheck);
        overallStatus = HealthStatus.CRITICAL;
        
        logger.error('Health check failed', { name, error }, 'PerformanceMonitor.runHealthChecks');
      }
    }

    logger.debug('Health checks completed', { 
      overall: overallStatus, 
      checkCount: checks.length 
    }, 'PerformanceMonitor.runHealthChecks');

    return { overall: overallStatus, checks };
  }

  /**
   * Register an alert
   */
  registerAlert(config: AlertConfig): void {
    this.alerts.set(config.name, config);
    logger.debug('Alert registered', { 
      name: config.name, 
      severity: config.severity 
    }, 'PerformanceMonitor.registerAlert');
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get system overview
   */
  getSystemOverview(): {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    metricsCount: number;
    activeAlertsCount: number;
    healthChecksCount: number;
  } {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      metricsCount: this.metrics.size,
      activeAlertsCount: Array.from(this.activeAlerts.values()).filter(a => !a.resolved).length,
      healthChecksCount: this.healthChecks.size
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): AlertEvent[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, resolution: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      
      logger.info('Alert resolved', { 
        alertId, 
        configName: alert.configName,
        resolution 
      }, 'PerformanceMonitor.resolveAlert');
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    let output = '';
    
    for (const metric of this.metrics.values()) {
      output += `# HELP ${metric.name} ${metric.description}\n`;
      output += `# TYPE ${metric.name} ${metric.type.toLowerCase()}\n`;
      
      for (const value of metric.values.slice(-10)) { // Last 10 values
        const labelStr = Object.entries(value.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        
        output += `${metric.name}{${labelStr}} ${value.value} ${value.timestamp}\n`;
      }
      output += '\n';
    }
    
    return output;
  }

  // Private methods

  private registerDefaultMetrics(): void {
    // HTTP metrics
    this.registerMetric('http_requests_total', MetricType.COUNTER, 'Total HTTP requests', 'requests');
    this.registerMetric('http_request_duration', MetricType.HISTOGRAM, 'HTTP request duration', 'ms');
    this.registerMetric('http_response_size', MetricType.HISTOGRAM, 'HTTP response size', 'bytes');

    // Database metrics
    this.registerMetric('db_query_duration', MetricType.HISTOGRAM, 'Database query duration', 'ms');
    this.registerMetric('db_connections_active', MetricType.GAUGE, 'Active database connections', 'connections');

    // Cache metrics
    this.registerMetric('cache_hits_total', MetricType.COUNTER, 'Cache hits', 'hits');
    this.registerMetric('cache_misses_total', MetricType.COUNTER, 'Cache misses', 'misses');

    // API metrics
    this.registerMetric('api_calls_total', MetricType.COUNTER, 'External API calls', 'calls');
    this.registerMetric('api_call_duration', MetricType.HISTOGRAM, 'External API call duration', 'ms');

    // Error metrics
    this.registerMetric('errors_total', MetricType.COUNTER, 'Total errors', 'errors');
    this.registerMetric('error_rate', MetricType.GAUGE, 'Error rate', 'percent');

    // System metrics
    this.registerMetric('memory_usage', MetricType.GAUGE, 'Memory usage', 'bytes');
    this.registerMetric('cpu_usage', MetricType.GAUGE, 'CPU usage', 'percent');
  }

  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Memory metrics
    this.recordMetric('memory_usage', memUsage.heapUsed, { type: 'heap_used' });
    this.recordMetric('memory_usage', memUsage.heapTotal, { type: 'heap_total' });
    this.recordMetric('memory_usage', memUsage.rss, { type: 'rss' });
    this.recordMetric('memory_usage', memUsage.external, { type: 'external' });

    // CPU metrics (convert microseconds to milliseconds)
    this.recordMetric('cpu_usage', cpuUsage.user / 1000, { type: 'user' });
    this.recordMetric('cpu_usage', cpuUsage.system / 1000, { type: 'system' });
  }

  private async checkAlerts(): Promise<void> {
    const now = Date.now();

    for (const [alertName, config] of this.alerts) {
      if (!config.enabled) continue;

      // Check cooldown
      const lastTriggered = this.alertCooldowns.get(alertName) || 0;
      if (now - lastTriggered < config.cooldownMs) continue;

      // Find metric for this alert
      const metricName = alertName.replace('_alert', '');
      const metric = this.metrics.get(metricName);
      if (!metric) continue;

      try {
        if (config.condition(metric)) {
          // Trigger alert
          const alertId = `${alertName}_${now}`;
          const alertEvent: AlertEvent = {
            id: alertId,
            configName: alertName,
            metric: metricName,
            severity: config.severity,
            message: `Alert triggered for metric ${metricName}`,
            timestamp: now,
            resolved: false
          };

          this.activeAlerts.set(alertId, alertEvent);
          this.alertCooldowns.set(alertName, now);

          logger.warn('Alert triggered', {
            alertId,
            configName: alertName,
            metric: metricName,
            severity: config.severity
          }, 'PerformanceMonitor.checkAlerts');
        }
      } catch (error) {
        logger.error('Alert condition check failed', {
          alertName,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'PerformanceMonitor.checkAlerts');
      }
    }
  }

  private cleanup(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    let cleanedValues = 0;

    // Clean old metric values
    for (const metric of this.metrics.values()) {
      const originalLength = metric.values.length;
      metric.values = metric.values.filter(value => value.timestamp > cutoff);
      cleanedValues += originalLength - metric.values.length;
    }

    // Clean resolved alerts older than 7 days
    const alertCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let cleanedAlerts = 0;
    
    for (const [alertId, alert] of this.activeAlerts) {
      if (alert.resolved && alert.resolvedAt && alert.resolvedAt < alertCutoff) {
        this.activeAlerts.delete(alertId);
        cleanedAlerts++;
      }
    }

    if (cleanedValues > 0 || cleanedAlerts > 0) {
      logger.debug('Performance monitor cleanup completed', {
        cleanedValues,
        cleanedAlerts
      }, 'PerformanceMonitor.cleanup');
    }
  }
}

/**
 * Default health checks
 */
export const defaultHealthChecks = {
  /**
   * Memory usage health check
   */
  memoryUsage: async (): Promise<HealthCheck> => {
    const startTime = performance.now();
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const usagePercent = (heapUsedMB / heapTotalMB) * 100;
    
    let status = HealthStatus.HEALTHY;
    let message = `Memory usage: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB (${usagePercent.toFixed(1)}%)`;
    
    if (usagePercent > 90) {
      status = HealthStatus.CRITICAL;
      message = `Critical memory usage: ${usagePercent.toFixed(1)}%`;
    } else if (usagePercent > 80) {
      status = HealthStatus.UNHEALTHY;
      message = `High memory usage: ${usagePercent.toFixed(1)}%`;
    } else if (usagePercent > 70) {
      status = HealthStatus.DEGRADED;
      message = `Elevated memory usage: ${usagePercent.toFixed(1)}%`;
    }
    
    return {
      name: 'memory_usage',
      status,
      message,
      timestamp: Date.now(),
      responseTime: performance.now() - startTime,
      details: { heapUsedMB, heapTotalMB, usagePercent }
    };
  },

  /**
   * Process uptime health check
   */
  uptime: async (): Promise<HealthCheck> => {
    const startTime = performance.now();
    const uptimeSeconds = process.uptime();
    const uptimeMinutes = uptimeSeconds / 60;
    const uptimeHours = uptimeMinutes / 60;
    
    let status = HealthStatus.HEALTHY;
    let message = `Process uptime: ${uptimeHours.toFixed(2)} hours`;
    
    if (uptimeSeconds < 60) {
      status = HealthStatus.DEGRADED;
      message = `Recently started: ${uptimeSeconds.toFixed(0)} seconds`;
    }
    
    return {
      name: 'uptime',
      status,
      message,
      timestamp: Date.now(),
      responseTime: performance.now() - startTime,
      details: { uptimeSeconds, uptimeMinutes, uptimeHours }
    };
  }
};

/**
 * Default alert configurations
 */
export const defaultAlerts: AlertConfig[] = [
  {
    name: 'memory_usage_alert',
    condition: (metric) => {
      const latest = metric.values[metric.values.length - 1];
      return latest && latest.value > 500 * 1024 * 1024; // 500MB
    },
    severity: 'HIGH',
    cooldownMs: 5 * 60 * 1000, // 5 minutes
    enabled: true
  },
  {
    name: 'error_rate_alert',
    condition: (metric) => {
      const recentValues = metric.values.slice(-10); // Last 10 values
      const avgErrorRate = recentValues.reduce((sum, val) => sum + val.value, 0) / recentValues.length;
      return avgErrorRate > 5; // 5% error rate
    },
    severity: 'MEDIUM',
    cooldownMs: 10 * 60 * 1000, // 10 minutes
    enabled: true
  },
  {
    name: 'response_time_alert',
    condition: (metric) => {
      const recentValues = metric.values.slice(-20); // Last 20 values
      const avgResponseTime = recentValues.reduce((sum, val) => sum + val.value, 0) / recentValues.length;
      return avgResponseTime > 2000; // 2 seconds
    },
    severity: 'MEDIUM',
    cooldownMs: 5 * 60 * 1000, // 5 minutes
    enabled: true
  }
];

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

// Register default health checks
performanceMonitor.registerHealthCheck('memory_usage', defaultHealthChecks.memoryUsage);
performanceMonitor.registerHealthCheck('uptime', defaultHealthChecks.uptime);

// Register default alerts
defaultAlerts.forEach(alert => performanceMonitor.registerAlert(alert)); 