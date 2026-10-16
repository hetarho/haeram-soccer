import type { Player, World } from '../../contracts/src/types';
import { registrationRule, type RegistrationRule } from '../../catalogs/src/index';
import { activePlayers, clubOf } from './world';
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
      `${rule.exempt.ageAtMost}세 이하 제외${rule.exempt.loansCount ? '(임대 선수는 포함)' : ''}`,
    );
  if (rule.exempt?.goalkeepers) parts.push('골키퍼 제외');
  if (rule.exempt?.graduatesAgeAtMost !== undefined)
    parts.push(`아카데미 출신 ${rule.exempt.graduatesAgeAtMost}세 이하 제외`);
  if (rule.bandiera) parts.push(`장기 소속 추가 최대 ${rule.bandiera.extra}명`);
  return `${allowed}명${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}
/** Existing over-limit squads keep everyone; only exempt arrivals can bypass the counted limit. */
export function registrationRoom(w: World, player: Registrant) {
  const state = registration(w);
  if (state.total >= state.ceiling) return `선수단은 최대 ${state.ceiling}명이에요.`;
  if (!registrationExempt(state.rule, w.year, player) && state.counted >= state.allowed)
    return `선수단 등록 한도가 가득 찼어요 (${registrationLabel(state.rule, state.allowed)})`;
  return undefined;
}
