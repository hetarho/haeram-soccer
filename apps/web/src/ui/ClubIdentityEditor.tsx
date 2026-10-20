import { useId, useState, type ReactNode } from 'react';
import {
  CREST_EMBLEMS,
  CREST_PALETTE,
  CREST_PATTERNS,
  CREST_PRESETS,
  CREST_SHAPES,
  KIT_ROLES,
  SHIRT_PATTERNS,
  type ClubIdentity,
  type CrestDesign,
  type CrestEmblem,
  type CrestPattern,
  type CrestShape,
  type KitRole,
} from '../../../../packages/contracts/src/identity';
import { CrestMark } from './ClubCrest';
import { colourInput, reduceIdentityDraft, type IdentityDraftAction } from './clubIdentityDraft';
import { SHIRT_PATTERN_LABELS } from './kitPainting';
import { KitSwatch } from './KitSwatch';
import s from './ClubIdentityEditor.module.css';

export const KIT_ROLE_LABELS: Readonly<Record<KitRole, string>> = {
  home: '홈',
  away: '원정',
  third: '서드',
};
export const CREST_SHAPE_LABELS: Readonly<Record<CrestShape, string>> = {
  shield: '방패',
  round: '원형',
  french: '프렌치 방패',
  badge: '팔각형',
  diamond: '마름모',
  crown: '왕관 방패',
};
export const CREST_PATTERN_LABELS: Readonly<Record<CrestPattern, string>> = {
  plain: '단색',
  stripes: '세로 줄무늬',
  hoops: '가로 줄무늬',
  halves: '좌우 반반',
  quarters: '4분할',
  sash: '대각선 띠',
  chevron: '갈매기 무늬',
  cross: '십자',
  band: '가로 띠',
  checks: '체크',
};
export const CREST_EMBLEM_LABELS: Readonly<Record<CrestEmblem, string>> = {
  star: '별',
  ball: '공',
  crown: '왕관',
  moon: '달',
  sun: '해',
  bolt: '번개',
  flame: '불꽃',
  anchor: '닻',
  tower: '탑',
  tree: '나무',
  mountain: '산',
  wave: '물결',
  key: '열쇠',
  heart: '하트',
  gem: '보석',
  arrow: '화살표',
  bird: '새',
  wheel: '바퀴',
  clover: '클로버',
  horseshoe: '말굽',
};
/** KIT-4: main and secondary, then the optional accent. */
const COLOUR_LABELS = ['주색', '보조색', '강조색'] as const;

const sameParts = (a: Pick<CrestDesign, 'shape' | 'pattern' | 'emblem'>, b: CrestDesign) =>
  a.shape === b.shape && a.pattern === b.pattern && a.emblem === b.emblem;
/**
 * The colour a newly added optional region starts with, shown at once in its field: the first of
 * `candidates`, else the first palette colour, not already in `taken`.
 */
function startColour(candidates: (string | undefined)[], taken: (string | undefined)[]) {
  const used = new Set(taken.flatMap((colour) => (colour ? [colour.toLowerCase()] : [])));
  return [...candidates, ...CREST_PALETTE].find(
    (colour): colour is string => !!colour && !used.has(colour.toLowerCase()),
  )!;
}

/**
 * A named colour region: a colour picker and its `#RRGGBB` code as editable text. Text that is not
 * a colour stays here as an input error and never reaches the draft.
 */
function ColourField({
  label,
  hint,
  colour,
  disabled,
  onColour,
  onRemove,
}: {
  label: string;
  /** The region this colour paints. */
  hint: string;
  colour: string;
  disabled: boolean;
  onColour: (colour: string) => void;
  /** Present for an optional region. */
  onRemove?: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(colour);
  const [shown, setShown] = useState(colour);
  // A new value from the draft replaces whatever was being typed.
  if (shown !== colour) {
    setShown(colour);
    setText(colour);
  }
  const invalid = colourInput(text) === null;
  return (
    <div className={s.colour}>
      <label htmlFor={`${id}-pick`}>
        <b>{label}</b>
        <small id={`${id}-hint`}>{hint}</small>
      </label>
      <div className={s.colourInputs}>
        <input
          id={`${id}-pick`}
          type="color"
          value={colour.toLowerCase()}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onColour(event.target.value)}
        />
        <input
          type="text"
          value={text}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-label={`${label} 색 코드`}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : `${id}-hint`}
          onChange={(event) => {
            setText(event.target.value);
            const next = colourInput(event.target.value);
            if (next && next !== colour) onColour(next);
          }}
        />
        {onRemove && (
          <button type="button" disabled={disabled} aria-label={`${label} 빼기`} onClick={onRemove}>
            빼기
          </button>
        )}
      </div>
      {invalid && (
        <small id={`${id}-error`} className={s.error} role="alert">
          #RRGGBB 형식의 색 코드를 입력해 주세요.
        </small>
      )}
    </div>
  );
}

/**
 * A choice among the catalogue's options, pressed when selected (→WEB-86); its name is the label,
 * and the small preview inside is only a picture of it.
 */
function Choice({
  label,
  pressed,
  disabled,
  onSelect,
  children,
}: {
  label: string;
  pressed: boolean;
  disabled: boolean;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={s.choice}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onSelect}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

/**
 * KIT-2–5/9/10/14, WEB-86: the one club-design editor for founding and career, as a controlled
 * component (docs/CLUB-IDENTITY-CONTRACT.md §7). Every change goes through `reduceIdentityDraft`
 * and comes back as a new complete identity through `onChange`; the caller owns the entry copy,
 * apply/cancel, persistence and their errors. The selected shirt and an open composer are local.
 */
export function ClubIdentityEditor({
  value,
  onChange,
  readonly = false,
}: {
  value: ClubIdentity;
  onChange: (value: ClubIdentity) => void;
  /** Read-only ownership: the design stays visible, every change control is disabled. */
  readonly?: boolean;
}) {
  const id = useId();
  const { colours, crest, kits } = value;
  const [role, setRole] = useState<KitRole>('home');
  // A composition that is no ready-made crest opens the composer that made it.
  const [composing, setComposing] = useState(
    () => !CREST_PRESETS.some((preset) => sameParts(preset, crest)),
  );
  const act = (action: IdentityDraftAction) => {
    if (readonly) return;
    const next = reduceIdentityDraft(value, action);
    if (next !== value) onChange(next);
  };
  const shirt = kits[role];
  const roleName = `${KIT_ROLE_LABELS[role]} 유니폼`;
  const partLabel = (parts: Pick<CrestDesign, 'shape' | 'emblem'>) =>
    `${CREST_SHAPE_LABELS[parts.shape]} · ${CREST_EMBLEM_LABELS[parts.emblem]}`;
  /** What the crest looks like after an action, for the choice that would take it. */
  const crestAfter = (action: IdentityDraftAction) => reduceIdentityDraft(value, action).crest;

  return (
    <div className={s.editor}>
      {readonly && (
        <p className={s.readonly} role="note">
          읽기 전용 탭이에요. 디자인은 볼 수 있지만 바꿀 수는 없어요.
        </p>
      )}

      <fieldset className={s.section}>
        <legend>대표색</legend>
        <p className={s.note}>
          대표색은 1~3가지예요. 대표색을 바꿔도 엠블럼과 유니폼 색은 그대로이고, 유니폼에는 대표색
          적용으로 넣어요.
        </p>
        <div className={s.colours}>
          {colours.map((colour, index) => (
            <ColourField
              key={index}
              label={`대표 ${COLOUR_LABELS[index]}`}
              hint={
                index === 0 ? '구단을 대표하는 첫 색' : index === 1 ? '두 번째 색' : '세 번째 색'
              }
              colour={colour}
              disabled={readonly}
              onColour={(next) => act({ type: 'colour', index: index as 0 | 1 | 2, colour: next })}
              onRemove={
                index > 0 ? () => act({ type: 'remove-colour', index: index as 1 | 2 }) : undefined
              }
            />
          ))}
        </div>
        {colours.length < 3 && (
          <button
            type="button"
            className={s.add}
            disabled={readonly}
            onClick={() =>
              act({
                type: 'add-colour',
                colour: startColour([crest.secondary, crest.accent], colours),
              })
            }
          >
            대표 {COLOUR_LABELS[colours.length as 1 | 2]} 추가
          </button>
        )}
      </fieldset>

      <fieldset className={s.section}>
        <legend>엠블럼</legend>
        <div className={s.preview}>
          <CrestMark crest={crest} size={88} label={`엠블럼 미리보기: ${partLabel(crest)}`} />
          <div className={s.disclosure}>
            {crest.secondary === undefined && (
              <p>
                한 가지 색 엠블럼이에요. 무늬·원 테두리
                {crest.accent === undefined ? '·엠블럼' : ''} 자리는 비워 두어 뒤 배경이 비쳐
                보여요.
              </p>
            )}
            <p>바깥 테두리선은 모든 엠블럼에 같은 밝은 중립색으로 고정돼요.</p>
          </div>
        </div>
        <fieldset className={s.group}>
          <legend>기본 엠블럼</legend>
          <div className={s.choices}>
            {CREST_PRESETS.map((preset, index) => (
              <Choice
                key={index}
                label={partLabel(preset)}
                pressed={sameParts(preset, crest)}
                disabled={readonly}
                onSelect={() => act({ type: 'crest-preset', index })}
              >
                <CrestMark crest={crestAfter({ type: 'crest-preset', index })} size={32} />
              </Choice>
            ))}
          </div>
        </fieldset>
        <fieldset className={s.group}>
          <legend>엠블럼 색</legend>
          <div className={s.colours}>
            <ColourField
              label="바탕색"
              hint="바탕과 가운데 원"
              colour={crest.primary}
              disabled={readonly}
              onColour={(next) => act({ type: 'crest-colour', region: 'primary', colour: next })}
            />
            {crest.secondary !== undefined && (
              <ColourField
                label="무늬색"
                hint={`${CREST_PATTERN_LABELS[crest.pattern]} 무늬와 원 테두리`}
                colour={crest.secondary}
                disabled={readonly}
                onColour={(next) =>
                  act({ type: 'crest-colour', region: 'secondary', colour: next })
                }
                onRemove={() => act({ type: 'crest-colour', region: 'secondary', colour: null })}
              />
            )}
            {crest.accent !== undefined && (
              <ColourField
                label="엠블럼색"
                hint={`${CREST_EMBLEM_LABELS[crest.emblem]} 엠블럼`}
                colour={crest.accent}
                disabled={readonly}
                onColour={(next) => act({ type: 'crest-colour', region: 'accent', colour: next })}
                onRemove={() => act({ type: 'crest-colour', region: 'accent', colour: null })}
              />
            )}
          </div>
          <div className={s.actions}>
            {crest.secondary === undefined && (
              <button
                type="button"
                className={s.add}
                disabled={readonly}
                onClick={() =>
                  act({
                    type: 'crest-colour',
                    region: 'secondary',
                    colour: startColour([colours[1], colours[0]], [crest.primary, crest.accent]),
                  })
                }
              >
                무늬색 추가
              </button>
            )}
            {crest.accent === undefined && (
              <button
                type="button"
                className={s.add}
                disabled={readonly}
                onClick={() =>
                  act({
                    type: 'crest-colour',
                    region: 'accent',
                    colour: startColour([colours[2], colours[1]], [crest.primary, crest.secondary]),
                  })
                }
              >
                엠블럼색 추가
              </button>
            )}
          </div>
        </fieldset>
        <button
          type="button"
          className={s.toggle}
          aria-expanded={composing}
          aria-controls={`${id}-composer`}
          onClick={() => setComposing((open) => !open)}
        >
          직접 꾸미기
        </button>
        {composing && (
          <div id={`${id}-composer`} className={s.composer}>
            <fieldset className={s.group}>
              <legend>모양</legend>
              <div className={s.choices}>
                {CREST_SHAPES.map((shape) => (
                  <Choice
                    key={shape}
                    label={CREST_SHAPE_LABELS[shape]}
                    pressed={crest.shape === shape}
                    disabled={readonly}
                    onSelect={() => act({ type: 'crest-part', part: 'shape', value: shape })}
                  >
                    <CrestMark
                      crest={crestAfter({ type: 'crest-part', part: 'shape', value: shape })}
                      size={28}
                    />
                  </Choice>
                ))}
              </div>
            </fieldset>
            <fieldset className={s.group}>
              <legend>바탕 무늬</legend>
              <div className={s.choices}>
                {CREST_PATTERNS.map((pattern) => (
                  <Choice
                    key={pattern}
                    label={CREST_PATTERN_LABELS[pattern]}
                    pressed={crest.pattern === pattern}
                    disabled={readonly}
                    onSelect={() => act({ type: 'crest-part', part: 'pattern', value: pattern })}
                  >
                    <CrestMark
                      crest={crestAfter({ type: 'crest-part', part: 'pattern', value: pattern })}
                      size={28}
                    />
                  </Choice>
                ))}
              </div>
            </fieldset>
            <fieldset className={s.group}>
              <legend>엠블럼 모양</legend>
              <div className={s.choices}>
                {CREST_EMBLEMS.map((emblem) => (
                  <Choice
                    key={emblem}
                    label={CREST_EMBLEM_LABELS[emblem]}
                    pressed={crest.emblem === emblem}
                    disabled={readonly}
                    onSelect={() => act({ type: 'crest-part', part: 'emblem', value: emblem })}
                  >
                    <CrestMark
                      crest={crestAfter({ type: 'crest-part', part: 'emblem', value: emblem })}
                      size={28}
                    />
                  </Choice>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </fieldset>

      <fieldset className={s.section}>
        <legend>유니폼</legend>
        <div className={s.roles} role="group" aria-label="편집할 유니폼">
          {KIT_ROLES.map((kit) => (
            <Choice
              key={kit}
              label={`${KIT_ROLE_LABELS[kit]} 유니폼`}
              pressed={role === kit}
              disabled={false}
              onSelect={() => setRole(kit)}
            >
              <KitSwatch shirt={kits[kit]} label={`${KIT_ROLE_LABELS[kit]} 유니폼`} size={28} />
            </Choice>
          ))}
        </div>
        <div className={s.preview}>
          <KitSwatch shirt={shirt} label={roleName} size={96} number={10} />
          <p className={s.note}>골키퍼 색은 경기마다 두 팀 유니폼을 보고 자동으로 골라요.</p>
        </div>
        <fieldset className={s.group}>
          <legend>{roleName} 무늬</legend>
          <div className={s.choices}>
            {SHIRT_PATTERNS.map((pattern) => (
              <Choice
                key={pattern}
                label={SHIRT_PATTERN_LABELS[pattern]}
                pressed={shirt.pattern === pattern}
                disabled={readonly}
                onSelect={() => act({ type: 'shirt-pattern', role, pattern })}
              >
                <KitSwatch
                  shirt={
                    reduceIdentityDraft(value, { type: 'shirt-pattern', role, pattern }).kits[role]
                  }
                  label={SHIRT_PATTERN_LABELS[pattern]}
                  size={28}
                />
              </Choice>
            ))}
          </div>
        </fieldset>
        <fieldset className={s.group}>
          <legend>{roleName} 색</legend>
          <div className={s.colours}>
            <ColourField
              key={`${role}-primary`}
              label="주색"
              hint="몸통 바탕"
              colour={shirt.primary}
              disabled={readonly}
              onColour={(next) =>
                act({ type: 'shirt-colour', role, region: 'primary', colour: next })
              }
            />
            {shirt.pattern !== 'plain' && shirt.secondary !== undefined && (
              <ColourField
                key={`${role}-secondary`}
                label="보조색"
                hint={`${SHIRT_PATTERN_LABELS[shirt.pattern]} 부분`}
                colour={shirt.secondary}
                disabled={readonly}
                onColour={(next) =>
                  act({ type: 'shirt-colour', role, region: 'secondary', colour: next })
                }
              />
            )}
            {shirt.trim !== undefined && (
              <ColourField
                key={`${role}-trim`}
                label="테두리"
                hint="가장자리 테두리"
                colour={shirt.trim}
                disabled={readonly}
                onColour={(next) =>
                  act({ type: 'shirt-colour', role, region: 'trim', colour: next })
                }
                onRemove={() => act({ type: 'shirt-colour', role, region: 'trim', colour: null })}
              />
            )}
          </div>
          <div className={s.actions}>
            {shirt.trim === undefined && (
              <button
                type="button"
                className={s.add}
                disabled={readonly}
                onClick={() =>
                  act({
                    type: 'shirt-colour',
                    role,
                    region: 'trim',
                    colour: startColour([colours[2], colours[1]], [shirt.primary, shirt.secondary]),
                  })
                }
              >
                테두리 추가
              </button>
            )}
            <button
              type="button"
              className={s.reuse}
              disabled={readonly}
              aria-describedby={`${id}-reuse`}
              onClick={() => act({ type: 'shirt-reuse', role })}
            >
              대표색 적용
            </button>
          </div>
          <p id={`${id}-reuse`} className={s.note}>
            대표색을 {roleName}에만 넣어요. 무늬와 다른 유니폼은 그대로예요.
          </p>
        </fieldset>
      </fieldset>
    </div>
  );
}
