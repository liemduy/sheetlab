import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import {
  DEFAULT_CANVAS_ZOOM,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from '../editor/EditorToolbar';

function clampCanvasZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

export function useCanvasZoom(
  notationViewportRef: RefObject<HTMLDivElement | null>,
) {
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM);

  function handleCanvasZoomChange(value: string) {
    const nextZoom = Number(value);

    if (!Number.isNaN(nextZoom)) {
      setCanvasZoom(clampCanvasZoom(nextZoom));
    }
  }

  function zoomCanvasByWheelDelta(deltaY: number) {
    setCanvasZoom((currentZoom) =>
      clampCanvasZoom(currentZoom + (deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)),
    );
  }

  useEffect(() => {
    const viewport = notationViewportRef.current;

    if (!viewport) {
      return;
    }

    function handleNativeWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      zoomCanvasByWheelDelta(event.deltaY);
    }

    viewport.addEventListener('wheel', handleNativeWheel, { passive: false });

    return () => viewport.removeEventListener('wheel', handleNativeWheel);
  }, [notationViewportRef]);

  return {
    canvasZoom,
    handleCanvasZoomChange,
  };
}
