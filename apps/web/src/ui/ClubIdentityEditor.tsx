import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  CREST_EMBLEMS,
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
import {
  colourInput,
  randomCrestAction,
  reduceIdentityDraft,
  type IdentityDraftAction,
} from './clubIdentityDraft';
import {
  editorPreviewAppearance,
  KIT_ROLE_LABELS,
  PREVIEW_OPPONENTS,
  type PreviewOpponent,
} from './identityPreview';
import { SHIRT_PATTERN_LABELS } from './kitPainting';
import { KitPitchPreview } from './KitPitchPreview';
import { KitSwatch } from './KitSwatch';
import { Select } from './Select';
import s from './ClubIdentityEditor.module.css';

export { KIT_ROLE_LABELS };
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
const sameParts = (a: Pick<CrestDesign, 'shape' | 'pattern' | 'emblem'>, b: CrestDesign) =>
  a.shape === b.shape && a.pattern === b.pattern && a.emblem === b.emblem;
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
}: {
  label: string;
  /** The region this colour paints. */
  hint: string;
  colour: string;
  disabled: boolean;
  onColour: (colour: string) => void;
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
 * apply/cancel, persistence and their errors. The selected shirt, an open composer and the pitch
 * preview's example opponent are local.
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
  const { crest, kits } = value;
  const [role, setRole] = useState<KitRole>('home');
  // WEB-87: the pitch preview wears the shirt being edited against an example opponent.
  const [opponent, setOpponent] = useState<PreviewOpponent>('light');
  const preview = useMemo(
    () => editorPreviewAppearance(value, role, opponent),
    [value, role, opponent],
  );
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
        <legend>색상</legend>
        <p className={s.note}>
          유니폼마다 한 가지 색을 골라요. 엠블럼은 홈·어웨이 색으로 배색돼요.
        </p>
        <div className={s.colours}>
          {KIT_ROLES.map((kit) => (
            <ColourField
              key={kit}
              label={KIT_ROLE_LABELS[kit]}
              hint={`${KIT_ROLE_LABELS[kit]} 유니폼 색`}
              colour={kits[kit].primary}
              disabled={readonly}
              onColour={(colour) => act({ type: 'kit-colour', role: kit, colour })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className={s.section}>
        <legend>엠블럼</legend>
        <div className={s.preview}>
          <CrestMark crest={crest} size={88} label={`엠블럼 미리보기: ${partLabel(crest)}`} />
          <div className={s.disclosure}>
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
        <button
          type="button"
          className={s.toggle}
          disabled={readonly}
          aria-label="엠블럼 랜덤 선택"
          onClick={() => {
            act(randomCrestAction(crest));
            setComposing(true);
          }}
        >
          랜덤
        </button>
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
      </fieldset>

      <fieldset className={s.section}>
        <legend>경기장 미리보기</legend>
        <p className={s.note}>
          고른 {roleName}을 실제 경기 크기로 잔디 위에 보여 줘요. 상대는 예시일 뿐이고 경기나 일정은
          만들지 않아요.
        </p>
        <div className={s.actions}>
          <Select
            value={opponent}
            onValueChange={(next) => setOpponent(next as PreviewOpponent)}
            aria-label="미리보기 상대 예시"
          >
            {(Object.keys(PREVIEW_OPPONENTS) as PreviewOpponent[]).map((key) => (
              <option key={key} value={key}>
                {PREVIEW_OPPONENTS[key].label}
              </option>
            ))}
          </Select>
        </div>
        <KitPitchPreview appearance={preview.appearance} labels={preview.labels} />
      </fieldset>
    </div>
  );
}
