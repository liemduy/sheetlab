import PDFDocument from 'pdfkit';

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const NOTE_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const TOP_LINE_BY_CLEF = {
  treble: { step: 'F', octave: 5 },
  bass: { step: 'A', octave: 3 },
};
const STAFF_LINE_SPACING = 8;
const STAFF_GAP = 92;
const NOTEHEAD_RX = 5.4;
const NOTEHEAD_RY = 3.7;
const STEM_LENGTH = 28;
const LEDGER_HALF_WIDTH = 10;
const STAFF_DYNAMIC_PADDING = 22;

function getPageSize(score) {
  return PAGE_SIZES[score.pageSize] ?? PAGE_SIZES.a4;
}

function pitchValue(pitch) {
  return pitch.octave * NOTE_STEPS.length + NOTE_STEPS.indexOf(pitch.step);
}

function getPitchY(pitch, clef, staffTop) {
  return (
    staffTop -
    (pitchValue(pitch) - pitchValue(TOP_LINE_BY_CLEF[clef])) *
      (STAFF_LINE_SPACING / 2)
  );
}

function getLedgerLineYs(y, staffTop) {
  const staffBottom = staffTop + STAFF_LINE_SPACING * 4;
  const ys = [];

  for (let lineY = staffTop - STAFF_LINE_SPACING; lineY >= y - 0.01; lineY -= STAFF_LINE_SPACING) {
    ys.push(lineY);
  }

  for (let lineY = staffBottom + STAFF_LINE_SPACING; lineY <= y + 0.01; lineY += STAFF_LINE_SPACING) {
    ys.push(lineY);
  }

  return ys;
}

function getEventPitches(event) {
  if (event.kind === 'note') {
    return [event.pitch];
  }

  if (event.kind === 'chord') {
    return event.pitches;
  }

  return [];
}

function getEventDots(event) {
  return event.dots ?? 0;
}

function getAccidentalSymbol(accidental) {
  if (accidental === 'sharp') {
    return '#';
  }

  if (accidental === 'flat') {
    return 'b';
  }

  if (accidental === 'natural') {
    return '\u266e';
  }

  return '';
}

function getStaffPitchBounds(score, staffIndex) {
  const staff = score.parts[0]?.staves[staffIndex];
  const eventPitches =
    staff?.measures.flatMap((measure) =>
      measure.voices.flatMap((voice) =>
        voice.events.flatMap((event) => getEventPitches(event)),
      ),
    ) ?? [];

  if (!staff || eventPitches.length === 0) {
    return {
      maxY: STAFF_LINE_SPACING * 4,
      minY: 0,
    };
  }

  const pitchYs = eventPitches.map((pitch) =>
    getPitchY(pitch, staff.clef, 0),
  );

  return {
    maxY: Math.max(STAFF_LINE_SPACING * 4, ...pitchYs),
    minY: Math.min(0, ...pitchYs),
  };
}

function getStaffGap(score) {
  if (score.type !== 'grand') {
    return STAFF_GAP;
  }

  const trebleBounds = getStaffPitchBounds(score, 0);
  const bassBounds = getStaffPitchBounds(score, 1);
  const extraGap =
    Math.max(0, trebleBounds.maxY - STAFF_LINE_SPACING * 4) +
    Math.max(0, -bassBounds.minY);

  return extraGap === 0 ? STAFF_GAP : STAFF_GAP + extraGap + STAFF_DYNAMIC_PADDING;
}

function getMeasureCount(score) {
  return Math.max(
    1,
    ...score.parts.flatMap((part) =>
      part.staves.map((staff) => staff.measures.length),
    ),
  );
}

function createLayout(score) {
  const [pageWidth, pageHeight] = getPageSize(score);
  const staffLeft = 62;
  const staffRight = pageWidth - 62;

  return {
    measureCount: getMeasureCount(score),
    pageHeight,
    pageWidth,
    staffLeft,
    staffRight,
    staffGap: getStaffGap(score),
    staffWidth: staffRight - staffLeft,
    systemTop: 218,
    timeSignature: score.timeSignature,
  };
}

function getEventDrawing(event, staff, staffIndex, measureIndex, layout) {
  const measureWidth = layout.staffWidth / layout.measureCount;
  const contentLeft = layout.staffLeft + measureIndex * measureWidth + 52;
  const contentWidth = measureWidth - 66;
  const x =
    contentLeft +
    (event.beat / layout.timeSignature.beats) * Math.max(1, contentWidth);
  const staffTop = layout.systemTop + staffIndex * layout.staffGap;
  const eventPitches = getEventPitches(event);
  const primaryPitch = eventPitches[0];
  const y = primaryPitch
    ? getPitchY(primaryPitch, staff.clef, staffTop)
    : staffTop + STAFF_LINE_SPACING * 2;
  const ledgerYs = eventPitches.flatMap((pitch) =>
    getLedgerLineYs(getPitchY(pitch, staff.clef, staffTop), staffTop),
  );
  const middleLineY = staffTop + STAFF_LINE_SPACING * 2;
  const stemDirection = y <= middleLineY ? 'down' : 'up';
  const stem =
    eventPitches.length > 0 && event.duration !== 'whole'
      ? {
          direction: stemDirection,
          endY: stemDirection === 'up' ? y - STEM_LENGTH : y + STEM_LENGTH,
          x: stemDirection === 'up' ? x + NOTEHEAD_RX : x - NOTEHEAD_RX,
        }
      : null;
  const bounds = {
    maxX: x + NOTEHEAD_RX,
    maxY: y + NOTEHEAD_RY,
    minX: x - NOTEHEAD_RX,
    minY: y - NOTEHEAD_RY,
  };

  for (const pitch of eventPitches) {
    const pitchY = getPitchY(pitch, staff.clef, staffTop);

    bounds.minX = Math.min(bounds.minX, x - NOTEHEAD_RX);
    bounds.maxX = Math.max(bounds.maxX, x + NOTEHEAD_RX);
    bounds.minY = Math.min(bounds.minY, pitchY - NOTEHEAD_RY);
    bounds.maxY = Math.max(bounds.maxY, pitchY + NOTEHEAD_RY);
  }

  for (const ledgerY of ledgerYs) {
    bounds.minX = Math.min(bounds.minX, x - LEDGER_HALF_WIDTH);
    bounds.maxX = Math.max(bounds.maxX, x + LEDGER_HALF_WIDTH);
    bounds.minY = Math.min(bounds.minY, ledgerY);
    bounds.maxY = Math.max(bounds.maxY, ledgerY);
  }

  if (stem) {
    bounds.minX = Math.min(bounds.minX, stem.x);
    bounds.maxX = Math.max(bounds.maxX, stem.x);
    bounds.minY = Math.min(bounds.minY, y, stem.endY);
    bounds.maxY = Math.max(bounds.maxY, y, stem.endY);
  }

  return {
    bounds,
    ledgerYs,
    staffId: staff.id,
    staffIndex,
    staffTop,
    stem,
    x,
    y,
  };
}

export function createScorePdfLayout(score) {
  const layout = createLayout(score);
  const staves = score.parts[0]?.staves ?? [];

  return {
    events: staves.flatMap((staff, staffIndex) =>
      staff.measures.flatMap((measure) =>
        measure.voices[0]?.events.map((event) => ({
          ...getEventDrawing(event, staff, staffIndex, measure.index, layout),
          event,
          measureIndex: measure.index,
        })) ?? [],
      ),
    ),
    layout,
    pageSize: [layout.pageWidth, layout.pageHeight],
    staves: staves.map((staff, staffIndex) => ({
      bottom:
        layout.systemTop + staffIndex * layout.staffGap + STAFF_LINE_SPACING * 4,
      clef: staff.clef,
      id: staff.id,
      top: layout.systemTop + staffIndex * layout.staffGap,
    })),
  };
}

function drawStaff(doc, staff, staffIndex, layout) {
  const staffTop = layout.systemTop + staffIndex * layout.staffGap;
  const measureWidth = layout.staffWidth / layout.measureCount;

  doc.lineWidth(0.55).strokeColor('#111111');

  for (let lineIndex = 0; lineIndex < 5; lineIndex += 1) {
    const y = staffTop + lineIndex * STAFF_LINE_SPACING;
    doc.moveTo(layout.staffLeft, y).lineTo(layout.staffRight, y).stroke();
  }

  for (let barIndex = 0; barIndex <= layout.measureCount; barIndex += 1) {
    const x = layout.staffLeft + barIndex * measureWidth;
    doc
      .moveTo(x, staffTop)
      .lineTo(x, staffTop + STAFF_LINE_SPACING * 4)
      .stroke();
  }

  doc
    .font('Times-Roman')
    .fontSize(staff.clef === 'treble' ? 24 : 18)
    .text(staff.clef === 'treble' ? 'G' : 'F', layout.staffLeft + 8, staffTop - 8);

  doc
    .font('Times-Bold')
    .fontSize(14)
    .text(
      `${layout.timeSignature.beats}\n${layout.timeSignature.beatUnit}`,
      layout.staffLeft + 31,
      staffTop - 2,
      { lineGap: -4 },
    );
}

function drawGrandConnectors(doc, layout, staffCount) {
  if (staffCount < 2) {
    return;
  }

  const top = layout.systemTop;
  const bottom =
    layout.systemTop + (staffCount - 1) * layout.staffGap + STAFF_LINE_SPACING * 4;

  doc
    .lineWidth(1)
    .moveTo(layout.staffLeft, top)
    .lineTo(layout.staffLeft, bottom)
    .stroke();
  doc
    .font('Times-Roman')
    .fontSize(56)
    .text('{', layout.staffLeft - 23, top + 7, { height: bottom - top });
}

function drawNote(doc, event, staff, staffIndex, measureIndex, layout) {
  const { ledgerYs, staffTop, stem, x, y } = getEventDrawing(
    event,
    staff,
    staffIndex,
    measureIndex,
    layout,
  );

  if (event.kind === 'rest') {
    doc.rect(x - 5, y - 3, 10, 4).fill('#111111');
    if (getEventDots(event) > 0) {
      doc.circle(x + 9, y - 1, 1.35).fill('#111111');
    }
    return;
  }

  doc.lineWidth(0.7).strokeColor('#111111').fillColor('#111111');

  getEventPitches(event).forEach((pitch) => {
    const pitchY = getPitchY(pitch, staff.clef, staffTop);
    const accidental = getAccidentalSymbol(pitch.accidental);

    for (const ledgerY of getLedgerLineYs(pitchY, staffTop)) {
      doc
        .moveTo(x - LEDGER_HALF_WIDTH, ledgerY)
        .lineTo(x + LEDGER_HALF_WIDTH, ledgerY)
        .stroke();
    }

    if (accidental) {
      doc
        .font('Times-Roman')
        .fontSize(10)
        .fillColor('#111111')
        .text(accidental, x - 15, pitchY - 5, { width: 8, align: 'center' });
    }

    if (event.duration === 'whole' || event.duration === 'half') {
      doc.save().ellipse(x, pitchY, NOTEHEAD_RX, NOTEHEAD_RY).stroke().restore();
    } else {
      doc.ellipse(x, pitchY, NOTEHEAD_RX, NOTEHEAD_RY).fill('#111111');
    }

    if (getEventDots(event) > 0) {
      doc.circle(x + NOTEHEAD_RX + 5, pitchY, 1.35).fill('#111111');
    }
  });

  if (event.duration !== 'whole' && stem) {
    doc.moveTo(stem.x, y).lineTo(stem.x, stem.endY).stroke();
  }
}

function drawScore(doc, score) {
  const staves = score.parts[0]?.staves ?? [];
  const layout = createLayout(score);

  doc.font('Times-Bold').fontSize(26).text(score.title || 'Untitled', 0, 56, {
    align: 'center',
  });
  doc
    .font('Times-Italic')
    .fontSize(11)
    .text(`Moderato \u2669 = ${score.tempo}`, layout.staffLeft, 106)
    .text(score.composer || 'Composer', layout.staffRight - 96, 106, {
      align: 'right',
      width: 96,
    });

  staves.forEach((staff, staffIndex) => drawStaff(doc, staff, staffIndex, layout));
  drawGrandConnectors(doc, layout, staves.length);

  staves.forEach((staff, staffIndex) => {
    staff.measures.forEach((measure) => {
      measure.voices[0]?.events.forEach((event) =>
        drawNote(doc, event, staff, staffIndex, measure.index, layout),
      );
    });
  });
}

export function createScorePdf(score) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: true,
      margin: 0,
      size: getPageSize(score),
    });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawScore(doc, score);
    doc.end();
  });
}
