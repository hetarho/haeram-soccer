import type { Root } from 'react-dom/client';

/** Game presentation styles and resources belong only to preview documents. */
export async function startDesignSystem(root: Root, preview: boolean) {
  root.render(
    <main className="ds-entry" role="status">
      디자인 시스템을 불러오는 중…
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
        <p role="alert">디자인 시스템을 불러오지 못했어요. 다시 시도해 주세요.</p>
        <button onClick={() => location.reload()}>다시 시도</button>
      </main>,
    );
  }
}
