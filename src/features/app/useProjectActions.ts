import { useRef } from 'react';
import { deserializeScore } from '../../domain/score/factories';
import type { Score } from '../../domain/score/types';
import {
  createAbcNotationBlob,
  getAbcNotationFileName,
  importScoreFromAbc,
} from '../../domain/score/abcNotation';
import {
  createProjectJsonBlob,
  loadProjectFromStorage,
  saveProjectToStorage,
} from '../persistence/projectStorage';

interface LoadedScoreOptions {
  closePalette?: boolean;
}

interface UseProjectActionsOptions {
  onScoreLoaded: (
    score: Score,
    message: string,
    options?: LoadedScoreOptions,
  ) => void;
  score: Score;
  setEditorMessage: (message: string) => void;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function getDownloadBaseName(score: Score) {
  return (
    score.title
      .trim()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'sheetlab-score'
  );
}

export function useProjectActions({
  onScoreLoaded,
  score,
  setEditorMessage,
}: UseProjectActionsOptions) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importAbcInputRef = useRef<HTMLInputElement | null>(null);

  function handleSaveProject() {
    saveProjectToStorage(score);
    setEditorMessage('Project saved locally');
  }

  function handleLoadProject() {
    const storedScore = loadProjectFromStorage();

    if (!storedScore) {
      setEditorMessage('No saved project found');
      return;
    }

    onScoreLoaded(storedScore, 'Saved project loaded');
  }

  async function handleImportProjectFile(fileList: FileList | null) {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    try {
      const importedScore = deserializeScore(await file.text());

      onScoreLoaded(importedScore, `JSON imported: ${file.name}`, {
        closePalette: true,
      });
    } catch {
      setEditorMessage('Invalid JSON project file');
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  }

  async function handleImportAbcFile(fileList: FileList | null) {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    try {
      const { score: importedScore, warnings } = importScoreFromAbc(
        await file.text(),
      );

      onScoreLoaded(
        importedScore,
        warnings.length > 0
          ? `ABC imported: ${warnings.length} warning${
              warnings.length === 1 ? '' : 's'
            }`
          : `ABC imported: ${file.name}`,
        {
          closePalette: true,
        },
      );
    } catch {
      setEditorMessage('Invalid ABC notation file');
    } finally {
      if (importAbcInputRef.current) {
        importAbcInputRef.current.value = '';
      }
    }
  }

  function handleDownloadProject() {
    const fileName = `${getDownloadBaseName(score)}.json`;

    downloadBlob(
      createProjectJsonBlob(score),
      fileName,
    );
    setEditorMessage(`JSON downloaded: ${fileName}`);
  }

  function handleDownloadAbc() {
    const fileName = getAbcNotationFileName(score);

    downloadBlob(createAbcNotationBlob(score), fileName);
    setEditorMessage(`ABC downloaded: ${fileName}`);
  }

  async function handleExportPdf() {
    setEditorMessage('Exporting PDF...');

    try {
      const response = await fetch('/api/export-pdf', {
        body: JSON.stringify(score),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('PDF export failed');
      }

      const fileName = `${getDownloadBaseName(score)}.pdf`;

      downloadBlob(await response.blob(), fileName);
      setEditorMessage(`PDF downloaded: ${fileName}`);
    } catch {
      setEditorMessage('PDF export failed; review validation status');
    }
  }

  return {
    handleDownloadAbc,
    handleDownloadProject,
    handleExportPdf,
    handleImportAbcFile,
    handleImportProjectFile,
    handleLoadProject,
    handleSaveProject,
    importAbcInputRef,
    importInputRef,
  };
}
