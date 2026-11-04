import { message as sourceMessage } from '../../contracts/src/messages';
import type { Player, World } from '../../contracts/src/types';
import { registrationRule, type RegistrationRule } from '../../catalogs/src/index';
import { activePlayers, clubOf } from './player-state';
type Registrant = Pick<Player, 'born' | 'position' | 'loanUntil' | 'graduate' | 'joined'>;
export function registrationExempt(rule: RegistrationRule, year: number, player: Registrant) {
  const age = year - player.born,
    exempt = rule.exempt;
  return !!(
    exempt &&
    ((exempt.ageAtMost !== undefined &&
      age <= exempt.ageAtMost &&
      !(exempt.loansCount && player.loanUntil !== undefined)) ||
      (exempt.goalkeepers && player.position === 'GK') ||
      (exempt.graduatesAgeAtMost !== undefined &&
        player.graduate &&
        age <= exempt.graduatesAgeAtMost))
  );
}
export function registration(w: World) {
  const club = clubOf(w),
    rule = registrationRule(club.country, club.tier, w.year),
    players = activePlayers(w);
  const countedPlayers = players.filter((p) => !registrationExempt(rule, w.year, p)),
    counted = countedPlayers.length;
  const veterans = rule.bandiera
    ? countedPlayers.filter(
        (p) => p.joined !== undefined && w.year - p.joined >= rule.bandiera!.seasons,
      ).length
    : 0;
  const allowed = rule.max + (rule.bandiera ? Math.min(rule.bandiera.extra, veterans) : 0);
  return {
    rule,
    counted,
    exempt: players.length - counted,
    total: players.length,
    allowed,
    ceiling: rule.ceiling,
    estimated: rule.status === 'estimated',
  };
}
export function registrationLabel(rule: RegistrationRule, allowed = rule.max) {
  const parts: string[] = [];
  if (rule.exempt?.ageAtMost !== undefined)
    parts.push(
      sourceMessage('copy.registration.529802b5fa', {
        p0: rule.exempt.ageAtMost,
        p1: rule.exempt.loansCount ? sourceMessage('copy.registration.7d89ecb17f') : '',
      }),
    );
  if (rule.exempt?.goalkeepers) parts.push(sourceMessage('copy.registration.a42c5da312'));
  if (rule.exempt?.graduatesAgeAtMost !== undefined)
    parts.push(
      sourceMessage('copy.registration.62f95ebcf1', { p0: rule.exempt.graduatesAgeAtMost }),
    );
  if (rule.bandiera)
    parts.push(sourceMessage('copy.registration.a4c300e907', { p0: rule.bandiera.extra }));
  return sourceMessage('copy.ProfilePanels.fd0076ac0a', {
    p0: allowed,
    p1: parts.length ? ` · ${parts.join(' · ')}` : '',
  });
}
/** Existing over-limit squads keep everyone; only exempt arrivals can bypass the counted limit. */
export function registrationRoom(w: World, player: Registrant) {
  const state = registration(w);
  if (state.total >= state.ceiling)
    return sourceMessage('copy.registration.e5901e6714', { p0: state.ceiling });
  if (!registrationExempt(state.rule, w.year, player) && state.counted >= state.allowed)
    return sourceMessage('copy.registration.ee43eef0c1', {
      p0: registrationLabel(state.rule, state.allowed),
    });
  return undefined;
}
