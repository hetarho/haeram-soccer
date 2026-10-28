import { useLocale } from '../presentation/react';
import { BETA_MARK, isBetaVersion, shortVersion, versionLabel } from './versionLabel';
import m from './BetaMark.module.css';

/**
 * The small BETA pill at the top of every screen until 1.0 (→WEB-101): beside the club name in the
 * play HUD, beside the game's name elsewhere. `version` prints the game version with it
 * (`v0.7 BETA`) on the start and save-slot screens. A label, never a control.
 */
export function BetaMark({ version = false }: { version?: boolean }) {
  const { t } = useLocale();
  if (!isBetaVersion()) return null;
  return (
    <span className={m.mark}>
      <span className={m.pill} data-testid="beta-mark" aria-hidden="true">
        {version ? versionLabel() : BETA_MARK}
      </span>
      <span className={m.srOnly}>{t('shell.beta', { version: shortVersion() })}</span>
    </span>
  );
}
