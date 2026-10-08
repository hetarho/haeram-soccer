import { expect, type Locator } from '@playwright/test';

export async function optionList(control: Locator) {
  if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click();
  const id = await control.getAttribute('aria-controls');
  const list = control.page().locator(`[id=${JSON.stringify(id)}]`);
  await expect(list).toBeVisible();
  return list;
}

export async function chooseOption(
  control: Locator,
  choice: string | { index?: number; label?: string },
) {
  const list = await optionList(control);
  const option =
    typeof choice === 'string'
      ? list.locator(`[role="option"][data-value=${JSON.stringify(choice)}]`)
      : choice.label !== undefined
        ? list.getByRole('option', { name: choice.label, exact: true })
        : list.getByRole('option').nth(choice.index || 0);
  await option.click();
  await expect(control).toHaveAttribute('aria-expanded', 'false');
}

export async function selectOptions(control: Locator) {
  const list = await optionList(control);
  const options = await list.getByRole('option').evaluateAll((elements) =>
    elements.map((element) => ({
      value: element.getAttribute('data-value')!,
      label: element.textContent!.trim(),
      disabled: element.getAttribute('aria-disabled') === 'true',
    })),
  );
  await control.page().keyboard.press('Escape');
  await expect(control).toHaveAttribute('aria-expanded', 'false');
  return options;
}
