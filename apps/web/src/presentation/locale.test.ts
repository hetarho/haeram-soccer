import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateLocalePack, type LocalePack } from './contracts';
import { validateRegistry } from './registry';
import { createLoadedLocale, createLocaleFormatters, createTranslator } from './locale';

const localeDirectory = new URL('../../public/presentation/locales/', import.meta.url);
const readResource = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(name, localeDirectory), 'utf8'));
const registry = validateRegistry(readResource('index.json'), 'locale');
const korean = validateLocalePack(readResource('ko-KR.json'));
const koreanEntry = registry.entries.find((entry) => entry.id === korean.id)!;
const koreanRegistry = validateRegistry(
  { schemaVersion: 1, defaultId: korean.id, entries: [koreanEntry] },
  'locale',
);

afterEach(() => vi.unstubAllEnvs());

describe('locale messages', () => {
  it('loads every shipped entry against the registered default', () => {
    const defaultEntry = registry.entries.find((entry) => entry.id === registry.defaultId)!;
    const baseline = validateLocalePack(readResource(defaultEntry.resource));
    expect(baseline.id).toBe(registry.defaultId);
    for (const entry of registry.entries) {
      const pack = validateLocalePack(readResource(entry.resource), baseline);
      expect(pack.id).toBe(entry.id);
    }
    expect(koreanEntry).toMatchObject({ id: korean.id, label: '한국어', direction: 'ltr' });
  });

  it('preserves current Korean shell copy', () => {
    const { t } = createLoadedLocale(koreanRegistry, korean);
    expect(
      ['dashboard', 'league', 'europe', 'history', 'people', 'training', 'business'].map((key) =>
        t(`navigation.${key}`),
      ),
    ).toEqual([
      '클럽 홈',
      '리그',
      '컵 대회',
      '클럽 기록실',
      '선수단·스태프',
      '훈련·육성',
      '구단 운영',
    ]);
    expect(
      ['league', 'europe', 'history', 'dashboard', 'people', 'training', 'business'].map((key) =>
        t(`navigation.short.${key}`),
      ),
    ).toEqual(['리그', '컵', '기록', '홈', '선수단', '훈련', '구단']);
    expect(t('shell.menu')).toBe('전체 메뉴');
    expect(t('shell.readonlyNotice')).toBe('다른 탭이 플레이 중입니다. 이 탭은 읽기 전용입니다.');
    expect(t('shell.loadingView')).toBe('화면을 여는 중…');
    expect(t('shell.footer')).toBe('HAERAM FOOTBALL · 가상의 클럽, 당신의 역사.');
    expect(t('shell.cashDetails', { amount: '£1,500', status: '안정' })).toBe(
      '운영 자금 £1,500 · 안정 · 자금 상황 보기',
    );
    expect(t('save.secondsAgo', { count: 12 })).toBe('12초 전 저장');
    expect(
      t('save.status', {
        saved: t('save.complete'),
        revision: 24,
        status: t('save.price.observed'),
      }),
    ).toBe('저장 완료 · r24 · 물가 관측');
  });

  it('preserves facility descriptions while using theme metadata for the art name', () => {
    const t = createTranslator(korean);
    const describe = (era: string, label: string, theme = '픽셀아트') =>
      t('facility.alt', { era: t(`facility.era.${era}`), label, theme });
    expect(describe('heritage', t('facility.stadium', { stage: 1 }))).toBe(
      '1950–60년대 구장 1단계 픽셀아트',
    );
    expect(describe('terraces', t('facility.locker', { stage: 9 }))).toBe(
      '1970–90년대 구장 9단계 라커룸 픽셀아트',
    );
    expect(describe('contemporary', t('facility.training.base'))).toBe(
      '2000년 이후 기본 훈련장 픽셀아트',
    );
    expect(describe('contemporary', t('facility.training.stage', { stage: 5 }), '새 그림')).toBe(
      '2000년 이후 5단계 훈련장 새 그림',
    );
  });

  it('interpolates a named parameter safely', () => {
    const pack: LocalePack = {
      schemaVersion: 1,
      id: 'ko-KR',
      messages: { 'shell.greeting': '안녕 {name}: {name}' },
    };
    const t = createTranslator(pack);
    expect(t('shell.greeting', { name: '<b>$& {name}</b>' })).toBe(
      '안녕 <b>$& {name}</b>: <b>$& {name}</b>',
    );
  });

  it('selects plural forms from locale data', () => {
    const selected: LocalePack = {
      schemaVersion: 1,
      id: 'ar',
      messages: {
        'save.secondsAgo': {
          plural: 'count',
          forms: {
            zero: 'zero {count}',
            one: 'one {count}',
            two: 'two {count}',
            few: 'few {count}',
            many: 'many {count}',
            other: 'other {count}',
          },
        },
      },
    };
    const t = createTranslator(selected, korean);
    expect([0, 1, 2, 3, 11, 100].map((count) => t('save.secondsAgo', { count }))).toEqual([
      'zero 0',
      'one 1',
      'two 2',
      'few 3',
      'many 11',
      'other 100',
    ]);
    expect(createTranslator(korean)('save.secondsAgo', { count: 1 })).toBe('1초 전 저장');
  });

  it('falls back for an absent message', () => {
    const onDiagnostic = vi.fn();
    const t = createTranslator(
      { schemaVersion: 1, id: 'fr-FR', messages: { 'shell.menu': 'Menu' } },
      korean,
      { onDiagnostic },
    );
    expect(t('shell.menu')).toBe('Menu');
    expect(t('navigation.people')).toBe('선수단·스태프');
    expect(onDiagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: 'missing-message',
        locale: 'fr-FR',
        messageId: 'navigation.people',
      }),
    );
    expect(t('unavailable.message')).toBe('[unavailable.message]');
    expect(t('constructor')).toBe('[constructor]');
    expect(onDiagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: 'missing-message',
        messageId: 'constructor',
      }),
    );
  });

  it('reports a missing interpolation parameter', () => {
    const onDiagnostic = vi.fn();
    const t = createTranslator(korean, korean, { onDiagnostic });
    expect(t('shell.cashDetails', { amount: '£500' })).toBe(
      '운영 자금 £500 · {status} · 자금 상황 보기',
    );
    expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        code: 'missing-parameter',
        locale: 'ko-KR',
        messageId: 'shell.cashDetails',
        parameter: 'status',
      }),
    );
  });

  it('keeps plural fallback readable when its numeric parameter is missing or invalid', () => {
    const onDiagnostic = vi.fn();
    const t = createTranslator(korean, korean, { onDiagnostic });
    expect(t('save.minutesAgo')).toBe('{count}분 전 저장');
    expect(onDiagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: 'missing-parameter',
        parameter: 'count',
      }),
    );
    expect(t('save.minutesAgo', { count: '여러' })).toBe('여러분 전 저장');
    expect(onDiagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: 'invalid-plural-parameter',
        parameter: 'count',
      }),
    );
    expect(() => t('save.minutesAgo', { count: Number.NaN })).not.toThrow();
  });

  it('validates keys and parameters against the default resource', () => {
    expect(() =>
      createTranslator(
        {
          schemaVersion: 1,
          id: 'fr-FR',
          messages: { 'shell.menu': '{unexpected}' },
        },
        korean,
      ),
    ).toThrow('Message parameters differ from the default');
    expect(() =>
      createTranslator(
        {
          schemaVersion: 1,
          id: 'fr-FR',
          messages: { 'unknown.key': 'Unregistered message' },
        },
        korean,
      ),
    ).toThrow('Unknown message key');
  });

  it('takes identity and direction from new registry data and freezes the loaded snapshot', () => {
    const expanded = validateRegistry(
      {
        ...koreanRegistry,
        entries: [
          ...koreanRegistry.entries,
          { id: 'ar', label: 'العربية', resource: 'future/ar.json', direction: 'rtl' },
        ],
      },
      'locale',
    );
    const selected: LocalePack = {
      schemaVersion: 1,
      id: 'ar',
      messages: { 'shell.menu': 'القائمة' },
    };
    const snapshot = createLoadedLocale(expanded, selected, korean);
    expect([snapshot.id, snapshot.label, snapshot.direction]).toEqual(['ar', 'العربية', 'rtl']);
    expect(snapshot.t('shell.menu')).toBe('القائمة');
    expect(snapshot.formatters.locale).toBe('ar');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.entry)).toBe(true);
    expect(Object.isFrozen(snapshot.pack.messages)).toBe(true);
    expect(Object.isFrozen(snapshot.defaultPack.messages['save.secondsAgo'])).toBe(true);
    const seconds = snapshot.defaultPack.messages['save.secondsAgo'];
    expect(typeof seconds !== 'string' && Object.isFrozen(seconds.forms)).toBe(true);
    expect(Reflect.set(snapshot.pack.messages, 'shell.menu', 'changed')).toBe(false);
    selected.messages['shell.menu'] = 'caller mutation';
    expanded.entries[1].label = 'caller mutation';
    expect(snapshot.label).toBe('العربية');
    expect(snapshot.t('shell.menu')).toBe('القائمة');
  });

  it('rejects a snapshot with an unregistered pack or the wrong default', () => {
    const unregistered: LocalePack = {
      schemaVersion: 1,
      id: 'fr-FR',
      messages: { 'shell.menu': 'Menu' },
    };
    expect(() => createLoadedLocale(koreanRegistry, unregistered, korean)).toThrow(
      'absent from its registry',
    );
    expect(() => createLoadedLocale(koreanRegistry, korean, unregistered)).toThrow(
      'registered default',
    );
  });
});

describe('locale display formatters', () => {
  it('keeps Korean display-count rounding and exact large integer digits', () => {
    const formatters = createLocaleFormatters(koreanEntry.id);
    expect(formatters.number(1234.5)).toBe('1,235');
    expect(formatters.number(-1.5)).toBe('-1');
    expect(formatters.number(-0.1)).toBe('-0');
    expect(formatters.number(123456789012345678901234567890n)).toBe(
      '123,456,789,012,345,678,901,234,567,890',
    );
    expect(formatters.decimal(1.5, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
      '1.50',
    );
  });

  it('uses an unseen locale without changing formatter code', () => {
    const formatters = createLocaleFormatters('de-DE');
    expect(formatters.number(12345)).toBe('12.345');
    expect(formatters.decimal(1234.5)).toBe('1.234,5');
    expect(
      formatters.numberParts(1234.5).filter(({ type }) => type === 'group' || type === 'decimal'),
    ).toEqual([
      { type: 'group', value: '.' },
      { type: 'decimal', value: ',' },
    ]);
    expect(Object.isFrozen(formatters)).toBe(true);
  });

  it('formats a fixed game date without device timezone drift', () => {
    const value = new Date(Date.UTC(1950, 7, 1));
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      vi.stubEnv('TZ', timezone);
      const formatters = createLocaleFormatters(koreanEntry.id);
      expect(formatters.gameDate(value)).toBe('1950년 8월 1일');
      expect(formatters.gameDate(value.getTime())).toBe('1950년 8월 1일');
      expect(formatters.gameDate(Date.UTC(1969, 11, 32))).toBe('1970년 1월 1일');
    }
  });

  it('keeps UTC and the Gregorian game calendar when the locale has another calendar', () => {
    const formatters = createLocaleFormatters('th-TH');
    const value = Date.UTC(1950, 7, 1);
    expect(formatters.gameDate(value, { year: 'numeric' })).toBe('1950');
    const requestedOptions = {
      year: 'numeric' as const,
      timeZone: 'Pacific/Honolulu',
      calendar: 'buddhist',
    };
    expect(formatters.gameDate(value, requestedOptions)).toBe('1950');
  });
});
