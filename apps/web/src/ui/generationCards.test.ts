import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMessageParameters, validateLocalePack } from '../presentation/contracts';
import { createTranslator } from '../presentation/locale';
import type { GenerationDigest, GenerationFeat } from '../../../../packages/contracts/src/types';
import {
  cardCloses,
  clubListFollows,
  closeDue,
  featMessages,
  GENERATION_CARD,
  NO_CARDS,
  receiveDigest,
  type CardSchedule,
} from './generationCards';

const MS = GENERATION_CARD.ms;
const club = { id: 'c', name: 'Club', country: 'ENG' };
const digest = (season: number, feat?: GenerationFeat['kind']): GenerationDigest => ({
  season,
  closed: season - 1,
  elo: [],
  champions: [],
  europe: [],
  ...(feat ? { feat: { kind: feat, club } } : {}),
});
/** The schedule after each digest arrives at its time. */
const receive = (...arrivals: [number, GenerationDigest][]) =>
  arrivals.reduce<CardSchedule>(
    (schedule, [at, next]) => receiveDigest(closeDue(schedule, at), next, at),
    NO_CARDS,
  );

describe('generation feat cards (→WEB-115)', () => {
  it('opens a season’s card at once and closes it after GENERATION_CARD.ms', () => {
    const open = receive([100, digest(1931, 'league-run')]);
    expect(open.shown).toMatchObject({ season: 1931, closed: 1930, at: 100 });
    expect(cardCloses(open)).toBe(100 + MS);
    expect(closeDue(open, 100 + MS - 1)).toBe(open);
    expect(closeDue(open, 100 + MS)).toEqual({ season: 1931 });
    // A season without a feat opens nothing.
    expect(receive([0, digest(1931)])).toEqual({ season: 1931 });
  });

  it('shows one card at a time: a later card waits for the open one', () => {
    const waiting = receive([0, digest(1955, 'europe-first')], [1000, digest(1956, 'europe-two')]);
    expect(waiting.shown?.feat.kind).toBe('europe-first');
    expect(waiting.pending?.feat.kind).toBe('europe-two');
    const next = closeDue(waiting, MS + 5);
    expect(next.shown).toMatchObject({ season: 1956, at: MS + 5 });
    expect(next.pending).toBeUndefined();
    expect(closeDue(next, 2 * MS + 5)).toEqual({ season: 1956 });
  });

  it('drops a card left unshown when the next season’s digest arrives', () => {
    const replaced = receive(
      [0, digest(1960, 'treble')],
      [500, digest(1961, 'europe-two')],
      [1000, digest(1962, 'league-run')],
    );
    expect(replaced.shown?.feat.kind).toBe('treble');
    expect(replaced.pending).toMatchObject({ season: 1962, feat: { kind: 'league-run' } });
    // A season without a feat drops the waiting card too: cards never fall behind.
    const dropped = receive(
      [0, digest(1960, 'treble')],
      [500, digest(1961, 'europe-two')],
      [1000, digest(1962)],
    );
    expect(dropped.pending).toBeUndefined();
    expect(closeDue(dropped, MS)).toEqual({ season: 1962 });
  });

  it('ignores a repeated or older digest', () => {
    const open = receive([0, digest(1950, 'league-run')]);
    expect(receiveDigest(open, digest(1950, 'treble'), 10)).toBe(open);
    expect(receiveDigest(open, digest(1949, 'treble'), 10)).toBe(open);
  });

  it('words every feat with the locale pack’s messages and their parameters', () => {
    const korean = validateLocalePack(
      JSON.parse(
        readFileSync(
          new URL('../../public/presentation/locales/ko-KR.json', import.meta.url),
          'utf8',
        ),
      ),
    );
    const t = createTranslator(korean);
    const season = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
    const feats: GenerationFeat[] = [
      { kind: 'war' },
      { kind: 'treble', club, competition: 'European Cup' },
      { kind: 'europe-three', club, competition: 'European Cup', count: 3 },
      { kind: 'ballon-three', club, player: 'A. Player', count: 3 },
      { kind: 'europe-two', club, competition: 'Champions League', count: 2 },
      { kind: 'europe-first', club, competition: 'European Cup' },
      { kind: 'league-run', club, count: 5 },
    ];
    const lines = feats.map((feat) => {
      const words = featMessages({ feat, season: 1946, closed: 1938 }, season);
      for (const [id, parameters = {}] of [words.title, words.line]) {
        expect(id in korean.messages, id).toBe(true);
        expect(getMessageParameters(korean.messages[id]!).sort()).toEqual(
          Object.keys(parameters).sort(),
        );
      }
      return `${t(...words.title)} · ${t(...words.line)}`;
    });
    expect(lines).toEqual([
      '전쟁으로 멈춘 리그 · 1938/39 시즌을 끝으로 멈춘 리그가 1946/47 시즌에 다시 열려요',
      'Club 트레블 · 한 시즌에 리그, 국내 컵, European Cup 우승',
      'Club, European Cup 3연패 · 3시즌 연속 유럽 정상',
      'A. Player, 발롱도르 3년 연속 · Club 소속',
      'Club, Champions League 2연패 · 2시즌 연속 유럽 정상',
      'Club, 첫 European Cup 우승 · 구단 역사상 처음으로 유럽 정상에 섰어요',
      'Club 리그 5연패 · 5시즌 연속 리그 정상을 지켰어요',
    ]);
  });

  it('hands off to the club list once no card is open or waiting', () => {
    // A 1930 takeover has no season: the list follows at once.
    expect(clubListFollows(NO_CARDS, true)).toBe(true);
    expect(clubListFollows(NO_CARDS, false)).toBe(false);
    // The last season's card waits behind the open one, and the list behind both.
    const last = receive([0, digest(1938, 'league-run')], [100, digest(1946, 'war')]);
    expect(clubListFollows(last, true)).toBe(false);
    const war = closeDue(last, MS);
    expect(war.shown?.feat.kind).toBe('war');
    expect(clubListFollows(war, true)).toBe(false);
    expect(clubListFollows(closeDue(war, 2 * MS), true)).toBe(true);
  });
});
