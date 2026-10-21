import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './App.module.css';

export function FeedbackOverlay({
  children,
  label = '진행 알림',
  testId = 'runtime-alerts',
}: {
  children: ReactNode;
  label?: string;
  testId?: string;
}) {
  return createPortal(
    <aside className={s.feedbackOverlay} aria-label={label} data-testid={testId}>
      {children}
    </aside>,
    document.body,
  );
}
