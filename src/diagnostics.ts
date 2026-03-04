import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Performance diagnostics and profiling infrastructure
 * 
 * Tracks:
 * - Cache hit rates
 * - Query latency histograms
 * - Memory usage
 * - Operation counts
 */

type LatencyBucket = {
  min: number;
  max: number;
  count: number;
};

type DiagnosticsData = {
  cache: {
    index_cache_size: number;
    status_cache_size: number;
    query_cache_hits: number;
    query_cache_misses: number;
    query_cache_hit_rate: number;
  };
  latency: {
    buckets: LatencyBucket[];
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    max_ms: number;
    build_p95_ms: number;
    build_max_ms: number;
  };
  memory: {
    heap_used_mb: number;
    heap_total_mb: number;
    external_mb: number;
    rss_mb: number;
  };
  operations: {
    total_queries: number;
    index_builds: number;
    cache_invalidations: number;
  };
};

class PerformanceDiagnostics {
  private queryCacheHits = 0;
  private queryCacheMisses = 0;
  private totalQueries = 0;
  private indexBuilds = 0;
  private cacheInvalidations = 0;
  private latencies: number[] = [];
  private buildLatencies: number[] = [];
  private indexCacheSize = 0;
  private statusCacheSize = 0;
  private loaded = false;
  private hooksInstalled = false;
  private dirty = false;
  private lastPersistMs = 0;
  private readonly persistIntervalMs = Number(process.env.VEIL_DIAGNOSTICS_PERSIST_MS ?? "1000");
  private readonly statePath = process.env.VEIL_DIAGNOSTICS_PATH ?? join(process.cwd(), ".agents", "index", "diagnostics-state.json");

  private installExitHooks(): void {
    if (this.hooksInstalled) return;
    this.hooksInstalled = true;
    const flush = (): void => {
      this.persistNow();
    };
    process.on("beforeExit", flush);
    process.on("exit", flush);
    process.on("SIGINT", () => {
      flush();
      process.exit(130);
    });
    process.on("SIGTERM", () => {
      flush();
      process.exit(143);
    });
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.installExitHooks();
    if (!existsSync(this.statePath)) return;
    try {
      const raw = readFileSync(this.statePath, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      this.queryCacheHits = Number(data.queryCacheHits ?? 0);
      this.queryCacheMisses = Number(data.queryCacheMisses ?? 0);
      this.totalQueries = Number(data.totalQueries ?? 0);
      this.indexBuilds = Number(data.indexBuilds ?? 0);
      this.cacheInvalidations = Number(data.cacheInvalidations ?? 0);
      this.latencies = Array.isArray(data.latencies) ? data.latencies.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
      this.buildLatencies = Array.isArray(data.buildLatencies)
        ? data.buildLatencies.map((v) => Number(v)).filter((v) => Number.isFinite(v))
        : [];
      this.indexCacheSize = Number(data.indexCacheSize ?? 0);
      this.statusCacheSize = Number(data.statusCacheSize ?? 0);
    } catch {
      this.loaded = true;
    }
  }

  private persistNow(): void {
    if (!this.loaded || !this.dirty) return;
    try {
      mkdirSync(dirname(this.statePath), { recursive: true });
      writeFileSync(
        this.statePath,
        `${JSON.stringify(
          {
            queryCacheHits: this.queryCacheHits,
            queryCacheMisses: this.queryCacheMisses,
            totalQueries: this.totalQueries,
            indexBuilds: this.indexBuilds,
            cacheInvalidations: this.cacheInvalidations,
            latencies: this.latencies.slice(-1000),
            buildLatencies: this.buildLatencies.slice(-200),
            indexCacheSize: this.indexCacheSize,
            statusCacheSize: this.statusCacheSize,
          },
          null,
          2,
        )}\n`,
      );
      this.dirty = false;
      this.lastPersistMs = Date.now();
    } catch {
      // ignore diagnostics persistence errors
    }
  }

  private schedulePersist(): void {
    this.dirty = true;
    const now = Date.now();
    if (now - this.lastPersistMs >= this.persistIntervalMs) {
      this.persistNow();
    }
  }

  recordCacheHit(): void {
    this.ensureLoaded();
    this.queryCacheHits++;
    this.schedulePersist();
  }

  recordCacheMiss(): void {
    this.ensureLoaded();
    this.queryCacheMisses++;
    this.schedulePersist();
  }

  recordQuery(latencyMs: number): void {
    this.ensureLoaded();
    this.totalQueries++;
    this.latencies.push(latencyMs);
    
    // Keep only last 1000 latencies to avoid unbounded growth
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
    this.schedulePersist();
  }

  recordIndexBuild(): void {
    this.ensureLoaded();
    this.indexBuilds++;
    this.schedulePersist();
  }

  recordBuildLatency(latencyMs: number): void {
    this.ensureLoaded();
    this.buildLatencies.push(latencyMs);
    if (this.buildLatencies.length > 200) {
      this.buildLatencies.shift();
    }
    this.schedulePersist();
  }

  recordCacheInvalidation(): void {
    this.ensureLoaded();
    this.cacheInvalidations++;
    this.schedulePersist();
  }

  updateCacheSizes(indexSize: number, statusSize: number): void {
    this.ensureLoaded();
    this.indexCacheSize = indexSize;
    this.statusCacheSize = statusSize;
    this.schedulePersist();
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx] ?? 0;
  }

  private createLatencyBuckets(): LatencyBucket[] {
    const buckets: LatencyBucket[] = [
      { min: 0, max: 1, count: 0 },
      { min: 1, max: 5, count: 0 },
      { min: 5, max: 10, count: 0 },
      { min: 10, max: 50, count: 0 },
      { min: 50, max: 100, count: 0 },
      { min: 100, max: 500, count: 0 },
      { min: 500, max: Infinity, count: 0 },
    ];

    for (const latency of this.latencies) {
      for (const bucket of buckets) {
        if (latency >= bucket.min && latency < bucket.max) {
          bucket.count++;
          break;
        }
      }
    }

    return buckets;
  }

  getDiagnostics(): DiagnosticsData {
    this.ensureLoaded();
    this.persistNow();
    const hitRate =
      this.queryCacheHits + this.queryCacheMisses > 0
        ? this.queryCacheHits / (this.queryCacheHits + this.queryCacheMisses)
        : 0;

    const memUsage = process.memoryUsage();

    return {
      cache: {
        index_cache_size: this.indexCacheSize,
        status_cache_size: this.statusCacheSize,
        query_cache_hits: this.queryCacheHits,
        query_cache_misses: this.queryCacheMisses,
        query_cache_hit_rate: Number((hitRate * 100).toFixed(2)),
      },
      latency: {
        buckets: this.createLatencyBuckets(),
        p50_ms: Number(this.percentile(this.latencies, 50).toFixed(4)),
        p95_ms: Number(this.percentile(this.latencies, 95).toFixed(4)),
        p99_ms: Number(this.percentile(this.latencies, 99).toFixed(4)),
        max_ms: this.latencies.length > 0 ? Number(Math.max(...this.latencies).toFixed(4)) : 0,
        build_p95_ms: Number(this.percentile(this.buildLatencies, 95).toFixed(4)),
        build_max_ms: this.buildLatencies.length > 0 ? Number(Math.max(...this.buildLatencies).toFixed(4)) : 0,
      },
      memory: {
        heap_used_mb: Number((memUsage.heapUsed / 1024 / 1024).toFixed(2)),
        heap_total_mb: Number((memUsage.heapTotal / 1024 / 1024).toFixed(2)),
        external_mb: Number((memUsage.external / 1024 / 1024).toFixed(2)),
        rss_mb: Number((memUsage.rss / 1024 / 1024).toFixed(2)),
      },
      operations: {
        total_queries: this.totalQueries,
        index_builds: this.indexBuilds,
        cache_invalidations: this.cacheInvalidations,
      },
    };
  }

  reset(): void {
    this.ensureLoaded();
    this.queryCacheHits = 0;
    this.queryCacheMisses = 0;
    this.totalQueries = 0;
    this.indexBuilds = 0;
    this.cacheInvalidations = 0;
    this.latencies = [];
    this.buildLatencies = [];
    this.indexCacheSize = 0;
    this.statusCacheSize = 0;
    this.dirty = true;
    this.persistNow();
  }
}

// Global diagnostics instance
export const diagnostics = new PerformanceDiagnostics();

// Profiling utilities
type ProfileMarker = {
  name: string;
  start: number;
  end?: number;
  duration?: number;
};

class Profiler {
  private markers: ProfileMarker[] = [];
  private enabled = false;

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  mark(name: string): void {
    if (!this.enabled) return;
    
    const now = typeof Bun !== "undefined" && typeof Bun.nanoseconds === "function"
      ? Number(Bun.nanoseconds()) / 1_000_000
      : Date.now();
    
    this.markers.push({ name, start: now });
  }

  measure(name: string): void {
    if (!this.enabled) return;
    
    const now = typeof Bun !== "undefined" && typeof Bun.nanoseconds === "function"
      ? Number(Bun.nanoseconds()) / 1_000_000
      : Date.now();
    
    // Find the most recent marker with this name
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const marker = this.markers[i];
      if (marker.name === name && !marker.end) {
        marker.end = now;
        marker.duration = now - marker.start;
        break;
      }
    }
  }

  getMarkers(): ProfileMarker[] {
    return this.markers.filter((m) => m.duration !== undefined);
  }

  reset(): void {
    this.markers = [];
  }

  report(): string {
    const completed = this.getMarkers();
    if (completed.length === 0) {
      return "No profiling data available";
    }

    const lines = ["=== Profiling Report ==="];
    for (const marker of completed) {
      lines.push(`${marker.name}: ${marker.duration!.toFixed(4)}ms`);
    }

    return lines.join("\n");
  }
}

// Global profiler instance
export const profiler = new Profiler();
