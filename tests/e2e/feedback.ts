import { expect, type Page } from '@playwright/test';

/** Close a decision's feedback before using controls it can cover. */
export async function dismissFeedback(page: Page) {
  const toast = page.getByTestId('action-outcome');
  if (!(await toast.isVisible())) return;
  // Home's open event group can sit over the toast; it then clears itself after a few seconds.
  await toast
    .getByRole('button', { name: /^(확인|알림 닫기)$/ })
    .click({ timeout: 3000 })
    .catch(() => expect(toast).toHaveCount(0, { timeout: 10000 }));
}
