import * as THREE from 'three';

export interface GpuTimingResult {
  /** Суммарное время работы GPU за кадр в миллисекундах */
  totalMs: number;
  /** Время выполнения отдельных проходов (в миллисекундах) */
  passes: Map<string, number>;
  /** Поддерживается ли расширение таймеров текущим WebGL2 контекстом */
  isSupported: boolean;
}

export class GpuProfiler {
  private gl: WebGL2RenderingContext | null = null;
  private ext: any = null;
  private isSupported: boolean = false;

  private activePassName: string | null = null;
  private activeQuery: WebGLQuery | null = null;

  private pendingQueries: Array<{
    name: string;
    query: WebGLQuery;
    frameIndex: number;
  }> = [];

  private currentFrameIndex: number = 0;
  private passTimings = new Map<string, number>();
  private lastTotalMs: number = 0;

  public init(renderer: THREE.WebGLRenderer): void {
    const gl = renderer.getContext();
    if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
      this.gl = gl;
      this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      this.isSupported = Boolean(this.ext);
    }
  }

  public beginPass(name: string): void {
    if (!this.isSupported || !this.gl || !this.ext) return;
    if (this.activeQuery) {
      this.endPass();
    }

    const query = this.gl.createQuery();
    if (!query) return;

    this.activePassName = name;
    this.activeQuery = query;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
  }

  public endPass(): void {
    if (!this.isSupported || !this.gl || !this.ext || !this.activeQuery) return;

    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pendingQueries.push({
      name: this.activePassName || 'Unknown',
      query: this.activeQuery,
      frameIndex: this.currentFrameIndex,
    });

    this.activePassName = null;
    this.activeQuery = null;
  }

  public resolve(): void {
    this.currentFrameIndex++;
    if (!this.isSupported || !this.gl || !this.ext) return;

    const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    if (disjoint) {
      for (const item of this.pendingQueries) {
        this.gl.deleteQuery(item.query);
      }
      this.pendingQueries.length = 0;
      return;
    }

    const remaining: typeof this.pendingQueries = [];
    let updatedAny = false;

    for (const item of this.pendingQueries) {
      const available = this.gl.getQueryParameter(item.query, this.gl.QUERY_RESULT_AVAILABLE);

      if (available) {
        const timeElapsedNs = this.gl.getQueryParameter(item.query, this.gl.QUERY_RESULT);
        const ms = timeElapsedNs / 1_000_000;
        this.passTimings.set(item.name, ms);
        this.gl.deleteQuery(item.query);
        updatedAny = true;
      } else {
        if (this.currentFrameIndex - item.frameIndex > 10) {
          this.gl.deleteQuery(item.query);
        } else {
          remaining.push(item);
        }
      }
    }

    this.pendingQueries = remaining;

    if (updatedAny) {
      let sum = 0;
      for (const val of this.passTimings.values()) {
        sum += val;
      }
      this.lastTotalMs = sum;
    }
  }

  public getResult(): GpuTimingResult {
    return {
      totalMs: this.lastTotalMs,
      passes: this.passTimings,
      isSupported: this.isSupported,
    };
  }

  public dispose(): void {
    if (this.gl) {
      for (const item of this.pendingQueries) {
        this.gl.deleteQuery(item.query);
      }
      if (this.activeQuery) {
        this.gl.deleteQuery(this.activeQuery);
      }
    }
    this.pendingQueries.length = 0;
    this.passTimings.clear();
    this.activeQuery = null;
    this.activePassName = null;
    this.gl = null;
    this.ext = null;
    this.isSupported = false;
  }
}
