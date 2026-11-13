import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sourceMessages } from '../../../../packages/contracts/src/source-messages';
import { message, type SourceMessageId } from '../../../../packages/contracts/src/messages';
import { verbatimParameters } from '../../../../packages/contracts/src/message-parameters';
import { createLoadedLocale } from './locale';
import { LocalizedMessage } from './LocalizedMessage';
import { displayMessage, localizeText, localizeValue, setTextLocale } from './text';
import type { LocalePack } from './contracts';
import { validateRegistry } from './registry';

const korean: LocalePack = JSON.parse(
  readFileSync(new URL('../../public/presentation/locales/ko-KR.json', import.meta.url), 'utf8'),
);
const idFor = (text: string) =>
  Object.entries(sourceMessages).find(([, source]) => source === text)![0] as SourceMessageId;
const select = (messages: LocalePack['messages']) =>
  setTextLocale(
    createLoadedLocale(
      {
        schemaVersion: 1,
        defaultId: 'ko-KR',
        entries: [
          { id: 'ko-KR', label: '한국어', direction: 'ltr', resource: 'ko-KR.json' },
          { id: 'en-GB', label: 'English', direction: 'ltr', resource: 'en-GB.json' },
        ],
      },
      { schemaVersion: 1, id: 'en-GB', messages },
      korean,
    ),
  );
afterEach(() => setTextLocale());

describe('source prose and display translation', () => {
  it('keeps every canonical source message unchanged without reading a locale', () => {
    for (const id of Object.keys(sourceMessages) as SourceMessageId[])
      expect(message(id)).toBe(sourceMessages[id]);
    const id = idFor('약 {p0}주');
    expect(message(id, { p0: '$&{literal}' })).toBe('약 $&{literal}주');
    select({ [id]: 'About {p0} weeks' });
    expect(message(id, { p0: 3 })).toBe('약 3주');
    expect(displayMessage(id, { p0: 3 })).toBe('About 3 weeks');
  });

  it('translates exact source labels and recognized historical templates without mutating data', () => {
    const label = idFor('인수'),
      weeks = idFor('약 {p0}주');
    select({ [label]: 'Takeover', [weeks]: 'About {p0} weeks' });
    const record = {
      label: '인수',
      detail: '약 3주',
      unknown: '아카이브에만 존재하는 오래된 소식',
    };
    expect(localizeValue([record.label, record.detail, 3])).toEqual([
      'Takeover',
      'About 3 weeks',
      3,
    ]);
    expect(localizeText(' 인수 ')).toBe(' Takeover ');
    expect(localizeText(record.unknown)).toBe(record.unknown);
    expect(localizeValue(record)).toBe(record);
    expect(record.detail).toBe('약 3주');
  });

  it('keeps saved project reports translatable after their producer retires', () => {
    const directory = new URL('../../public/presentation/locales/', import.meta.url);
    const registry = validateRegistry(
      JSON.parse(readFileSync(new URL('index.json', directory), 'utf8')),
      'locale',
    );
    const english: LocalePack = JSON.parse(readFileSync(new URL('en-GB.json', directory), 'utf8'));
    const saved = Object.freeze({
      title: '인수, 대형 투자 유치',
      detail: '새 구단주와 대규모 투자로 앞으로 몇 시즌 동안 전력이 크게 오를 전망이에요. 지금 전력 64.',
    });
    select(english.messages);
    expect(localizeText(saved.title)).toBe('인수 attracts large investments');
    expect(localizeText(saved.detail)).toBe(
      "With a new owner and large-scale investment, the team's power is expected to rise significantly over the next few seasons. Now power 64.",
    );
    for (const entry of registry.entries) {
      const pack: LocalePack = JSON.parse(readFileSync(new URL(entry.resource, directory), 'utf8'));
      expect(pack.messages['copy.dynamics.d1735c6a1e']).toContain('{p0}');
      expect(pack.messages['copy.dynamics.f3616ce2a8']).toContain('{p0}');
    }
    setTextLocale();
    expect(localizeText(saved.title)).toBe(saved.title);
    expect(localizeText(saved.detail)).toBe(saved.detail);
  });

  it('translates authored competition names inside generated messages', () => {
    const directory = new URL('../../public/presentation/locales/', import.meta.url);
    const registry = validateRegistry(
      JSON.parse(readFileSync(new URL('index.json', directory), 'utf8')),
      'locale',
    );
    const english: LocalePack = JSON.parse(readFileSync(new URL('en-GB.json', directory), 'utf8'));
    setTextLocale(createLoadedLocale(registry, english, korean));
    const id = 'copy.cups.f3b8bcee16';
    expect(displayMessage(id, { p0: '국내 컵' })).not.toMatch(/[가-힣]/);
    expect(localizeText(message(id, { p0: '국내 컵' }))).not.toMatch(/[가-힣]/);
  });

  it('preserves identity parameters even when a name happens to equal a translated label', () => {
    const [id, names] = Object.entries(verbatimParameters).find(
      ([id, names]) =>
        names.includes('p0') && sourceMessages[id as SourceMessageId].includes('{p0}'),
    )!;
    const source = sourceMessages[id as SourceMessageId];
    const parameters = Object.fromEntries(
      [...source.matchAll(/\{(p\d+)\}/g)].map((match) => [match[1], '인수']),
    );
    const translation = Object.keys(parameters)
      .map((name) => `{${name}}`)
      .join(' / ');
    select({ [id]: translation, [idFor('인수')]: 'Takeover' });
    expect(names).toContain('p0');
    expect(displayMessage(id as SourceMessageId, parameters).split(' / ')[0]).toBe('인수');
  });

  it('reorders rich inline content, escapes text and updates when the selected locale changes', () => {
    const id = idFor('난이도 {p0}');
    const node = createElement(LocalizedMessage, {
      id,
      values: { p0: createElement('strong', null, '<hard>') },
    });
    expect(renderToStaticMarkup(node)).toContain('난이도 <strong>&lt;hard&gt;</strong>');
    select({ [id]: '{p0} difficulty' });
    expect(renderToStaticMarkup(node)).toBe('<strong>&lt;hard&gt;</strong> difficulty');
    setTextLocale();
    expect(renderToStaticMarkup(node)).toContain('난이도 <strong>&lt;hard&gt;</strong>');
  });
});
