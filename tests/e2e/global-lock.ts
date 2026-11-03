import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

/**
 * One browser run at a time per clone. Several sessions share this host, and their journeys run
 * side by side overloaded it, whether started by the batch check or by hand; every worktree shares
 * the git common directory, so a run waits here until the run holding the lock ends. CI gives each
 * job its own runner and skips the wait; `E2E_LOCK=off` skips it on purpose.
 */
const POLL_MS = 5000;
/** A lock without its owner record is abandoned after this long (the owner died while writing). */
const ABANDONED_MS = 60000;

interface Owner {
  pid: number;
  host: string;
  cwd?: string;
}

function lockDirectory() {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' });
  return path.resolve(common.trim(), 'haeram', 'e2e-lock');
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
function ownerOf(lock: string): Owner | undefined {
  try {
    return JSON.parse(readFileSync(path.join(lock, 'owner.json'), 'utf8')) as Owner;
  } catch {
    return undefined;
  }
}
/** A lock left by a run that is gone from this host, or one that never got its record. */
function abandoned(lock: string, owner: Owner | undefined) {
  if (owner) return owner.host === hostname() && !alive(owner.pid);
  try {
    return Date.now() - statSync(lock).mtimeMs > ABANDONED_MS;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  if (process.env.CI || process.env.E2E_LOCK === 'off') return;
  const lock = lockDirectory();
  mkdirSync(path.dirname(lock), { recursive: true });
  let told = false;
  for (;;) {
    try {
      mkdirSync(lock);
      const owner: Owner = { pid: process.pid, host: hostname(), cwd: process.cwd() };
      writeFileSync(path.join(lock, 'owner.json'), JSON.stringify(owner));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = ownerOf(lock);
      if (abandoned(lock, owner)) {
        rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (!told) {
        console.log(
          `e2e lock held by ${owner?.cwd ?? 'another run'} (pid ${owner?.pid ?? '?'}); waiting`,
        );
        told = true;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
  return () => rmSync(lock, { recursive: true, force: true });
}
