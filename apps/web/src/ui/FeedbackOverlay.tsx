import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './App.module.css';

export function FeedbackOverlay({
  children,
  label = '진행 알림',
  testId = 'runtime-alerts',
  urgent = false,
}: {
  children: ReactNode;
  label?: string;
  testId?: string;
  urgent?: boolean;
}) {
  return createPortal(
    <aside
      className={`${s.feedbackOverlay} ${urgent ? s.urgentFeedback : ''}`}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </aside>,
    document.body,
  );
}
