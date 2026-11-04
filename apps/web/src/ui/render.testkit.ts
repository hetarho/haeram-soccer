import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** Inspect a component's returned tree while running its hooks through React. */
export function captureRender<T>(render: () => T): T {
  let value!: T;
  function Capture() {
    value = render();
    return null;
  }
  renderToStaticMarkup(createElement(Capture));
  return value;
}
