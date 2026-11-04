import { richMessage } from '../presentation/LocalizedMessage';
import type { Root } from 'react-dom/client';

/** Game presentation styles and resources belong only to preview documents. */
export async function startDesignSystem(root: Root, preview: boolean) {
  root.render(
    <main className="ds-entry" role="status">
      {richMessage('copy.start.51a5ee2b62')}
    </main>,
  );
  try {
    if (preview) {
      const [{ default: StoryFrame }, { startPresentation }] = await Promise.all([
        import('./StoryFrame'),
        import('../presentation/startPresentation'),
      ]);
      await startPresentation(root, <StoryFrame />);
    } else {
      const [{ default: Workbench }, { createPresentationResources }] = await Promise.all([
        import('./Workbench'),
        import('../adapters/presentationResources'),
      ]);
      const themeRegistry = await createPresentationResources({ fetch }).loadRegistry('theme');
      root.render(<Workbench themeRegistry={themeRegistry} />);
    }
  } catch {
    root.render(
      <main className="ds-entry">
        <p role="alert">{richMessage('copy.start.6ca1e824a3')}</p>
        <button onClick={() => location.reload()}>{richMessage('presentation.retry')}</button>
      </main>,
    );
  }
}
