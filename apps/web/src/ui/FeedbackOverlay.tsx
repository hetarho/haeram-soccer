import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { localizeValue, useTextLocale } from '../presentation/text';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './App.module.css';

export function FeedbackOverlay({
  children,
  label = sourceMessage('copy.FeedbackOverlay.3797c1eac2'),
  testId = 'runtime-alerts',
  urgent = false,
}: {
  children: ReactNode;
  label?: string;
  testId?: string;
  urgent?: boolean;
}) {
  useTextLocale();
  return createPortal(
    <aside
      className={`${s.feedbackOverlay} ${urgent ? s.urgentFeedback : ''}`}
      aria-label={localizeValue(label)}
      data-testid={testId}
    >
      {localizeValue(children)}
    </aside>,
    document.body,
  );
}
