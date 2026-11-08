import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DataSource } from 'typeorm';

export function isEmployeeEvidenceFilename(filename: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(filename);
}

@Injectable()
export class EmployeeFileCleanup implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmployeeFileCleanup.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<number>;
  private readonly roots: Record<string, string>;
  constructor(config: ConfigService, @InjectDataSource() private readonly db: DataSource) {
    this.roots = {
      ATTENDANCE: resolve(config.get<string>('EVIDENCE_STORAGE_DIR') ?? join(process.cwd(), 'storage', 'attendance-evidence')),
      TRIP: resolve(config.get<string>('BUSINESS_TRIP_EVIDENCE_STORAGE_DIR') ?? join(process.cwd(), 'storage', 'business-trip-evidence')),
    };
  }
  onModuleInit(): void {
    // Durable queue survives process failure between DB commit and disk unlink.
    this.timer = setInterval(() => { void this.drain().catch(() => this.logger.warn('Employee evidence cleanup will retry')); }, 60_000);
    this.timer.unref();
    void this.drain().catch(() => this.logger.warn('Employee evidence cleanup will retry'));
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  drain(): Promise<number> {
    if (!this.running) this.running = this.clean().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async clean(): Promise<number> {
    const rows = await this.db.query<Array<{ storage_kind: string; filename: string }>>('SELECT storage_kind,filename FROM employee_file_cleanup ORDER BY created_at LIMIT 100');
    for (const row of rows) {
      const root = this.roots[row.storage_kind];
      // Exact basename only; never recursive cleanup or user-controlled paths.
      if (!root || !isEmployeeEvidenceFilename(row.filename)) continue;
      const target = resolve(root, row.filename);
      if (dirname(target) !== root) continue;
      try { await unlink(target); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { this.logger.warn('Employee evidence cleanup will retry'); continue; } }
      await this.db.query('DELETE FROM employee_file_cleanup WHERE storage_kind=$1 AND filename=$2', [row.storage_kind, row.filename]);
    }
    const [pending] = await this.db.query<Array<{ count: number }>>('SELECT count(*)::int AS count FROM employee_file_cleanup');
    return pending.count;
  }
}
