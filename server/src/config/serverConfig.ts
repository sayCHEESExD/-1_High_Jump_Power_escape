import { resolve } from 'node:path';
import { DEFAULT_SERVER_PORT, SERVER_TICK_RATE } from '@highjump/shared';

/** Runtime server configuration, overridable by environment variables. */
export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly tickRate: number;
  /** Milliseconds between state patches sent to clients. */
  readonly patchRateMs: number;
  /** Directory holding persisted player profiles. */
  readonly dataDir: string;
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * `--port N` from the command line wins over `PORT`, and the dev script passes
 * it: a dev harness hosting the client often exports `PORT` for its own web
 * server. Managed hosts pass no argv, so `PORT` still wins in production.
 */
const portArgument = (): string | undefined => {
  const at = process.argv.indexOf('--port');
  return at >= 0 ? process.argv[at + 1] : undefined;
};

export const serverConfig: ServerConfig = {
  port: int(portArgument() ?? process.env['PORT'], DEFAULT_SERVER_PORT),
  host: process.env['HOST'] ?? '0.0.0.0',
  tickRate: SERVER_TICK_RATE,
  patchRateMs: 1000 / SERVER_TICK_RATE,
  dataDir: resolve(process.env['HIGHJUMP_DATA_DIR'] ?? 'data'),
};
