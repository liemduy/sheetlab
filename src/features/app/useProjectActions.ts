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
    setEditorMessage('Project saved');
  }

  function handleLoadProject() {
    const storedScore = loadProjectFromStorage();

    if (!storedScore) {
      setEditorMessage('No saved project');
      return;
    }

    onScoreLoaded(storedScore, 'Project loaded');
  }

  async function handleImportProjectFile(fileList: FileList | null) {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    try {
      const importedScore = deserializeScore(await file.text());

      onScoreLoaded(importedScore, 'Project imported', {
        closePalette: true,
      });
    } catch {
      setEditorMessage('Invalid JSON project');
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
          ? `ABC imported with ${warnings.length} warning${
              warnings.length === 1 ? '' : 's'
            }`
          : 'ABC imported',
        {
          closePalette: true,
        },
      );
    } catch {
      setEditorMessage('Invalid ABC notation');
    } finally {
      if (importAbcInputRef.current) {
        importAbcInputRef.current.value = '';
      }
    }
  }

  function handleDownloadProject() {
    downloadBlob(
      createProjectJsonBlob(score),
      `${score.title || 'sheetlab-project'}.json`,
    );
    setEditorMessage('JSON downloaded');
  }

  function handleDownloadAbc() {
    downloadBlob(createAbcNotationBlob(score), getAbcNotationFileName(score));
    setEditorMessage('ABC downloaded');
  }

  async function handleExportPdf() {
    setEditorMessage('Exporting PDF');

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

      downloadBlob(await response.blob(), `${getDownloadBaseName(score)}.pdf`);
      setEditorMessage('PDF downloaded');
    } catch {
      setEditorMessage('PDF export failed');
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
