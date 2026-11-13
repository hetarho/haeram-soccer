import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import {
  runVerificationStage,
  type VerificationStage,
  type VerificationStageEntry,
} from './verification-runner';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function child(code: string, after?: VerificationStage['after']) {
  const directory = mkdtempSync(join(tmpdir(), 'verification-stage-'));
  directories.push(directory);
  const updates: VerificationStageEntry[] = [];
  const run = runVerificationStage(
    { stage: 'fake:node', command: process.execPath, args: ['-e', code], after },
    { directory, onUpdate: (entry) => updates.push(entry) },
  );
  return { ...run, directory, updates };
}

describe('verification stage receipts and raw logs', () => {
  it('records running PID/command/log paths before completion, then success', async () => {
    const run = child(
      "process.stdout.write('started');setTimeout(()=>{process.stderr.write('warning');},40)",
    );
    expect(run.updates).toHaveLength(1);
    const initial = run.updates[0];
    expect(initial.status).toBe('running');
    expect(initial.pid).toBeGreaterThan(0);
    expect(initial.argv[0]).toBe(process.execPath);
    expect(initial.finished).toBeUndefined();
    expect(existsSync(initial.stdoutPath)).toBe(true);
    expect(existsSync(initial.stderrPath)).toBe(true);
    const terminal = await run.done;
    expect(terminal.status).toBe('passed');
    expect(terminal.exitCode).toBe(0);
    expect(readFileSync(terminal.stdoutPath, 'utf8')).toBe('started');
    expect(readFileSync(terminal.stderrPath, 'utf8')).toBe('warning');
    expect(initial.status).toBe('running');
    expect(run.updates.at(-1)).toEqual(terminal);
  });
  it('keeps complete stdout and warning-heavy stderr alongside a nonzero failure', async () => {
    const run = child(
      "process.stdout.write('result');process.stderr.write('warning\\n'.repeat(10000));process.exitCode=7",
    );
    const terminal = await run.done;
    expect(terminal.status).toBe('failed');
    expect(terminal.exitCode).toBe(7);
    expect(readFileSync(terminal.stdoutPath, 'utf8')).toBe('result');
    expect(readFileSync(terminal.stderrPath, 'utf8')).toBe('warning\n'.repeat(10000));
  });
  it('records an externally requested cancellation and the real child signal', async () => {
    const run = child("process.stdout.write('ready');setInterval(()=>{},1000)");
    await once(run.child.stdout!, 'data');
    run.cancel('SIGTERM');
    expect(run.updates.at(-1)?.status).toBe('cancelling');
    const terminal = await run.done;
    expect(terminal.status).toBe('cancelled');
    expect(terminal.exitCode).not.toBe(0);
    expect(terminal.signal).toBe('SIGTERM');
    expect(terminal.commandExitCode).toBeNull();
    expect(terminal.cancelRequested?.signal).toBe('SIGTERM');
    expect(readFileSync(terminal.stdoutPath, 'utf8')).toBe('ready');
  });
  it('cancels nested children holding inherited pipes, including a signal-resistant descendant', async () => {
    const nested = `process.on('SIGTERM',()=>{});process.stdout.write(JSON.stringify({grandchild:process.pid})+'\\n');setInterval(()=>{},1000);`;
    const code = `const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(nested)}],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000);`;
    const run = child(code);
    const [chunk] = await once(run.child.stdout!, 'data');
    const grandchild = (JSON.parse(chunk.toString()) as { grandchild: number }).grandchild;
    let guard: ReturnType<typeof setTimeout> | undefined;
    try {
      run.cancel('SIGTERM');
      const terminal = await Promise.race([
        run.done,
        new Promise<never>(
          (_, reject) =>
            (guard = setTimeout(
              () => reject(new Error('descendant-cancellation-incomplete')),
              2000,
            )),
        ),
      ]);
      expect(terminal.status).toBe('cancelled');
      expect(terminal.commandExitCode).toBeNull();
      expect(terminal.signal).toBe('SIGTERM');
      expect(terminal.cancellationCleanup).toMatchObject({
        descendants: [grandchild],
        escalated: [grandchild],
      });
      expect(() => process.kill(grandchild, 0)).toThrow();
      expect(readFileSync(terminal.stdoutPath, 'utf8')).toContain(String(grandchild));
      expect(run.updates.at(-1)?.status).toBe('cancelled');
    } finally {
      clearTimeout(guard);
      try {
        process.kill(grandchild, 'SIGKILL');
      } catch {
        /* Already gone is the expected outcome. */
      }
      run.child.kill('SIGKILL');
    }
  });
  it('records a self-terminated child even without a cancellation request', async () => {
    const terminal = await child("process.kill(process.pid,'SIGTERM')").done;
    expect(terminal.status).toBe('cancelled');
    expect(terminal.signal).toBe('SIGTERM');
    expect(terminal.exitCode).not.toBe(0);
  });
  it.each(['malformed', 'missing'])(
    'turns %s reporter output into a terminal failed receipt',
    async (kind) => {
      const run = child("process.stdout.write('finished')", (entry) => {
        const path = join(run.directory, 'reporter.json');
        if (kind === 'missing') readFileSync(path, 'utf8');
        JSON.parse('{');
        return entry;
      });
      const terminal = await run.done;
      expect(terminal.status).toBe('failed');
      expect(terminal.exitCode).toBe(1);
      expect(terminal.failure?.kind).toBe('after');
      expect(terminal.commandExitCode).toBe(0);
      expect(terminal.afterExitCode).toBe(1);
      expect(terminal.finished).toBeTruthy();
      expect(run.updates.at(-1)).toEqual(terminal);
      expect(readFileSync(terminal.stdoutPath, 'utf8')).toBe('finished');
    },
  );
  it('never lets an after hook erase a real failure or its command provenance', async () => {
    const terminal = await child('process.exitCode=9', (entry) => ({
      ...entry,
      exitCode: 0,
      command: 'rewritten',
      pid: 0,
    })).done;
    expect(terminal.status).toBe('failed');
    expect(terminal.exitCode).toBe(9);
    expect(terminal.command).not.toBe('rewritten');
    expect(terminal.pid).toBeGreaterThan(0);
  });
  it('retains reporter diagnostics when its check returns failure', async () => {
    const terminal = await child('', (entry) => ({ ...entry, exitCode: 1, emptyTiers: ['unit'] }))
      .done;
    expect(terminal.status).toBe('failed');
    expect(terminal.exitCode).toBe(1);
    expect(terminal.emptyTiers).toEqual(['unit']);
  });
  it('retains a spawn error rather than leaving the stage running', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'verification-stage-'));
    directories.push(directory);
    const updates: VerificationStageEntry[] = [];
    const terminal = await runVerificationStage(
      { stage: 'missing', command: join(directory, 'absent'), args: [] },
      { directory, onUpdate: (entry) => updates.push(entry) },
    ).done;
    expect(terminal.status).toBe('failed');
    expect(terminal.failure?.kind).toBe('spawn');
    expect(updates.map((e) => e.status)).toEqual(['running', 'failed']);
  });
});
