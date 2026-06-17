import { useRef, useState } from 'react';
import { deserializeScore } from '../../domain/score/factories';
import type { Score } from '../../domain/score/types';
import {
  createAbcNotationBlob,
  getAbcNotationFileName,
  importScoreFromAbc,
} from '../../domain/score/abcNotation';
import {
  analyzeMidiFile,
  analyzeMusicXml,
  extractMusicXmlFromMxl,
  importScoreFromMidi,
  importScoreFromMusicXml,
} from '../../domain/score/externalScoreImport';
import {
  createProjectJsonBlob,
  loadAutosaveFromStorage,
  loadProjectFromLibrary,
  loadProjectLibrary,
  loadProjectFromStorage,
  type SavedProjectRecord,
  saveProjectToStorage,
} from '../persistence/projectStorage';
import {
  createMusicXmlBlob,
  getMusicXmlFileName,
} from '../../domain/score/musicXmlExport';

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
  const importExternalScoreInputRef = useRef<HTMLInputElement | null>(null);
  const [projectLibrary, setProjectLibrary] = useState<SavedProjectRecord[]>(
    () => loadProjectLibrary(),
  );

  function refreshProjectLibrary() {
    setProjectLibrary(loadProjectLibrary());
  }

  function handleSaveProject() {
    saveProjectToStorage(score);
    refreshProjectLibrary();
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

  function handleLoadProjectFromLibrary(projectId: string) {
    const storedScore = loadProjectFromLibrary(projectId);

    if (!storedScore) {
      setEditorMessage('Library project not found');
      refreshProjectLibrary();
      return;
    }

    onScoreLoaded(storedScore, 'Library project loaded');
  }

  function handleLoadAutosave() {
    const storedScore = loadAutosaveFromStorage();

    if (!storedScore) {
      setEditorMessage('No autosave found');
      return;
    }

    onScoreLoaded(storedScore, 'Autosave restored');
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
      refreshProjectLibrary();
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
      refreshProjectLibrary();
    } catch {
      setEditorMessage('Invalid ABC notation file');
    } finally {
      if (importAbcInputRef.current) {
        importAbcInputRef.current.value = '';
      }
    }
  }

  async function handleImportExternalScoreFile(fileList: FileList | null) {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();

    try {
      const isMidiFile =
        lowerName.endsWith('.mid') || lowerName.endsWith('.midi');
      const isMxlFile = lowerName.endsWith('.mxl');
      const midiBuffer = isMidiFile ? await file.arrayBuffer() : null;
      const midiAnalysis = midiBuffer
        ? analyzeMidiFile(midiBuffer, file.name)
        : null;
      const musicXmlText = isMxlFile
        ? await extractMusicXmlFromMxl(await file.arrayBuffer())
        : isMidiFile
          ? null
          : await file.text();
      const musicXmlAnalysis = musicXmlText
        ? analyzeMusicXml(musicXmlText, file.name)
        : null;
      const result = midiBuffer
        ? importScoreFromMidi(midiBuffer, file.name)
        : importScoreFromMusicXml(musicXmlText ?? '');
      const midiSummary = midiAnalysis
        ? `: ${midiAnalysis.noteCount} notes, ${midiAnalysis.measureEstimate} bars, ${midiAnalysis.pedalEventCount} pedal events, ${midiAnalysis.splitMode} split`
        : '';
      const musicXmlSummary = musicXmlAnalysis
        ? `: ${musicXmlAnalysis.measureCount} bars, ${musicXmlAnalysis.noteCount} notes, ${musicXmlAnalysis.staffCount} staves, ${musicXmlAnalysis.lyricCount} lyrics, ${musicXmlAnalysis.pedalCount} pedal marks`
        : '';
      const importSummary = midiSummary || musicXmlSummary;

      onScoreLoaded(
        result.score,
        result.warnings.length > 0
          ? `Imported ${file.name}${importSummary}: ${result.warnings.length} warning${
              result.warnings.length === 1 ? '' : 's'
            }`
          : `Imported ${file.name}${importSummary}`,
        {
          closePalette: true,
        },
      );
      refreshProjectLibrary();
    } catch {
      setEditorMessage('Invalid MusicXML, MXL, or MIDI file');
    } finally {
      if (importExternalScoreInputRef.current) {
        importExternalScoreInputRef.current.value = '';
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

  function handleDownloadMusicXml() {
    const fileName = getMusicXmlFileName(score);

    downloadBlob(createMusicXmlBlob(score), fileName);
    setEditorMessage(`MusicXML downloaded: ${fileName}`);
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
    handleDownloadMusicXml,
    handleDownloadProject,
    handleExportPdf,
    handleImportAbcFile,
    handleImportExternalScoreFile,
    handleImportProjectFile,
    handleLoadAutosave,
    handleLoadProject,
    handleLoadProjectFromLibrary,
    handleSaveProject,
    importAbcInputRef,
    importExternalScoreInputRef,
    importInputRef,
    projectLibrary,
  };
}
