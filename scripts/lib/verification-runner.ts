import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface VerificationStageEntry {
  stage: string;
  status: 'running' | 'cancelling' | 'passed' | 'failed' | 'cancelled';
  command: string;
  argv: string[];
  pid?: number;
  started: string;
  finished?: string;
  elapsedMs?: number;
  exitCode: number | null;
  commandExitCode?: number | null;
  afterExitCode?: number | null;
  signal?: NodeJS.Signals;
  stdoutPath: string;
  stderrPath: string;
  cancelRequested?: { at: string; signal: NodeJS.Signals };
  failure?: { kind: 'spawn' | 'after' | 'after-result' | 'log'; name?: string; message?: string };
  [key: string]: unknown;
}
export interface VerificationStage {
  stage: string;
  command?: string;
  args: string[];
  inherit?: boolean;
  background?: boolean;
  after?: (entry: VerificationStageEntry) => VerificationStageEntry;
}
export interface VerificationStageOptions {
  directory: string;
  onUpdate: (entry: VerificationStageEntry) => void;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
  stderr?: Pick<NodeJS.WriteStream, 'write'>;
}
export interface VerificationStageRun {
  child: ChildProcess;
  done: Promise<VerificationStageEntry>;
  cancel: (signal?: NodeJS.Signals) => void;
}

/** Each update is a copy: earlier live receipts cannot silently turn into later terminal ones. */
export function runVerificationStage(
  spec: VerificationStage,
  options: VerificationStageOptions,
): VerificationStageRun {
  mkdirSync(options.directory, { recursive: true });
  const safe = spec.stage.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const stdoutPath = join(options.directory, `${safe}.stdout.log`);
  const stderrPath = join(options.directory, `${safe}.stderr.log`);
  const stdoutFd = openSync(stdoutPath, 'w'),
    stderrFd = openSync(stderrPath, 'w');
  const command = spec.command ?? 'pnpm';
  const start = performance.now();
  const child = spawn(command, spec.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: options.env ?? process.env,
    cwd: options.cwd,
  });
  let entry: VerificationStageEntry = {
    stage: spec.stage,
    status: 'running',
    command: [command, ...spec.args].join(' '),
    argv: [command, ...spec.args],
    pid: child.pid,
    started: new Date().toISOString(),
    exitCode: null,
    stdoutPath,
    stderrPath,
  };
  const update = () => options.onUpdate({ ...entry });
  update();
  const output = (fd: number, destination: Pick<NodeJS.WriteStream, 'write'>, chunk: Buffer) => {
    try {
      writeFileSync(fd, chunk);
    } catch (error) {
      entry.failure ??= {
        kind: 'log',
        name: error instanceof Error ? error.name : undefined,
        message: String(error),
      };
      child.kill();
    }
    if (spec.inherit) destination.write(chunk);
  };
  child.stdout!.on('data', (chunk: Buffer) =>
    output(stdoutFd, options.stdout ?? process.stdout, chunk),
  );
  child.stderr!.on('data', (chunk: Buffer) =>
    output(stderrFd, options.stderr ?? process.stderr, chunk),
  );
  child.on('error', (error) => {
    entry.failure = { kind: 'spawn', name: error.name, message: error.message };
  });
  const done = new Promise<VerificationStageEntry>((resolve) => {
    child.on('close', (code, signal) => {
      closeSync(stdoutFd);
      closeSync(stderrFd);
      entry = {
        ...entry,
        finished: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - start),
        exitCode: code,
        commandExitCode: code,
        signal: signal ?? undefined,
        status:
          signal || entry.cancelRequested
            ? 'cancelled'
            : code === 0 && !entry.failure
              ? 'passed'
              : 'failed',
      };
      if (entry.failure && entry.exitCode === 0) entry.exitCode = 1;
      try {
        const after = spec.after?.({ ...entry });
        if (
          spec.after &&
          (!after || (typeof after.exitCode !== 'number' && after.exitCode !== null))
        ) {
          entry = {
            ...entry,
            exitCode: entry.exitCode || 1,
            status: entry.cancelRequested || signal ? 'cancelled' : 'failed',
            afterExitCode: 1,
            failure: { kind: 'after-result' },
          };
        } else if (after) {
          // A reporter cannot erase a command failure, signal, cancellation or its provenance.
          const failed = entry.exitCode !== 0 || !!entry.failure || !!entry.cancelRequested;
          entry = {
            ...after,
            afterExitCode: after.exitCode,
            ...entry,
            ...(!failed
              ? { exitCode: after.exitCode, status: after.exitCode === 0 ? 'passed' : 'failed' }
              : {}),
          };
        }
      } catch (error) {
        entry = {
          ...entry,
          exitCode: entry.exitCode || 1,
          status: entry.cancelRequested || signal ? 'cancelled' : 'failed',
          afterExitCode: 1,
          failure: {
            kind: 'after',
            name: error instanceof Error ? error.name : undefined,
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
      update();
      resolve({ ...entry });
    });
  });
  return {
    child,
    done,
    cancel: (signal = 'SIGTERM') => {
      if (entry.finished) return;
      entry = {
        ...entry,
        status: 'cancelling',
        cancelRequested: { at: new Date().toISOString(), signal },
      };
      update();
      child.kill(signal);
    },
  };
}
