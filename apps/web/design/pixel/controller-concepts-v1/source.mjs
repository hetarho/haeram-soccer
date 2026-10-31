import { uiSvg } from '../../../../../scripts/ui-art-resources.mjs';

/** Proposed integer-grid materials, kept separate from the approved pixel pack. */
export function controllerPixelConcepts() {
  return {
    X1: uiSvg(
      32,
      32,
      '<path fill="#b8c89b" d="M0 0h32v32H0Z"/><path fill="#a9bb8c" d="M2 5h2v1H2Zm1 1h2v1H3Zm15 10h3v1h-3Zm6 9h2v1h-2ZM8 26h2v1H8Z"/><path fill="#c9d7b0" d="M10 9h1v1h-1Zm17 4h1v1h-1Zm-12 8h1v1h-1Z"/>',
      true,
    ),
    X2: uiSvg(
      32,
      32,
      '<path fill="#202e48" d="M0 0h32v32H0Z"/><path fill="#25344d" d="M0 3h32v1H0Zm0 8h32v1H0Zm0 8h32v1H0Zm0 8h32v1H0Z"/><path fill="#324962" d="M4 8h2v1H4Zm17 16h2v1h-2Z"/><path fill="#426176" d="M13 15h1v1h-1Zm15 13h1v1h-1Z"/>',
      true,
    ),
    X3: uiSvg(
      32,
      32,
      '<path fill="#326452" d="M0 0h32v32H0Z"/><path fill="#3b6d59" d="M3 5h1v1H3Zm1 1h1v1H4Zm1-1h1v1H5Zm13 9h1v1h-1Zm1 1h1v1h-1Zm1-1h1v1h-1ZM8 27h1v1H8Zm1 1h1v1H9Z"/><path fill="#497964" d="M23 4h2v1h-2Zm-11 13h1v1h-1Zm15 10h1v1h-1Z"/>',
      true,
    ),
  };
}
