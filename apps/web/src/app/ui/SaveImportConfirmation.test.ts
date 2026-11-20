import type { ReactElement } from 'react';
import { expect, it, vi } from 'vitest';
import { captureRender } from '../../shared/lib/render.testkit';
import { SaveImportConfirmation } from './SaveImportConfirmation';

vi.mock('../../presentation/react', () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

it('waits for the replacement operation before closing the confirmation', async () => {
  let finish!: () => void;
  const operation = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const onImport = vi.fn(() => operation);
  const onClose = vi.fn();
  const view = captureRender(() =>
    SaveImportConfirmation({ blocked: false, onClose, onExport: async () => {}, onImport }),
  );
  const button = view.props.children[2].props.children[2] as ReactElement<{
    onClick: () => Promise<void>;
  }>;
  const confirmation = button.props.onClick();
  expect(onImport).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  finish();
  await confirmation;
  expect(onClose).toHaveBeenCalledOnce();
});
