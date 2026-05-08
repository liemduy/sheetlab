import { createEmptyScore, deserializeScore } from '../../domain/score/factories';
import {
  DEFAULT_EDITOR_TOOL_STATE,
} from '../editor/editorState';
import {
  SHEETLAB_PDF_EXPORT_SCORE_KEY,
} from '../persistence/projectStorage';

export function isPdfExportMode() {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('pdf-export')
  );
}

export function loadInitialScoreForApp() {
  if (isPdfExportMode()) {
    try {
      const serializedExportScore = window.sessionStorage.getItem(
        SHEETLAB_PDF_EXPORT_SCORE_KEY,
      );

      if (serializedExportScore) {
        return deserializeScore(serializedExportScore);
      }
    } catch {
      // Fall through to the default score if the export payload is invalid.
    }
  }

  return createEmptyScore(DEFAULT_EDITOR_TOOL_STATE.scoreType, {
    tempo: DEFAULT_EDITOR_TOOL_STATE.tempo,
  });
}
