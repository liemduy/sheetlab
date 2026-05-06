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

function getMeasureCount(score) {
  return Math.max(
    1,
    ...score.parts.flatMap((part) =>
      part.staves.map((staff) => staff.measures.length),
    ),
  );
}

function drawStaff(doc, staff, staffIndex, layout) {
  const staffTop = layout.systemTop + staffIndex * STAFF_GAP;
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
    layout.systemTop + (staffCount - 1) * STAFF_GAP + STAFF_LINE_SPACING * 4;

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
  const measureWidth = layout.staffWidth / layout.measureCount;
  const contentLeft = layout.staffLeft + measureIndex * measureWidth + 52;
  const contentWidth = measureWidth - 66;
  const x =
    contentLeft +
    (event.beat / layout.timeSignature.beats) * Math.max(1, contentWidth);
  const staffTop = layout.systemTop + staffIndex * STAFF_GAP;
  const y =
    event.kind === 'note'
      ? getPitchY(event.pitch, staff.clef, staffTop)
      : staffTop + STAFF_LINE_SPACING * 2;

  if (event.kind === 'rest') {
    doc.rect(x - 5, y - 3, 10, 4).fill('#111111');
    return;
  }

  doc.lineWidth(0.7).strokeColor('#111111').fillColor('#111111');

  for (const ledgerY of getLedgerLineYs(y, staffTop)) {
    doc
      .moveTo(x - LEDGER_HALF_WIDTH, ledgerY)
      .lineTo(x + LEDGER_HALF_WIDTH, ledgerY)
      .stroke();
  }

  if (event.duration === 'whole' || event.duration === 'half') {
    doc.save().ellipse(x, y, NOTEHEAD_RX, NOTEHEAD_RY).stroke().restore();
  } else {
    doc.ellipse(x, y, NOTEHEAD_RX, NOTEHEAD_RY).fill('#111111');
  }

  if (event.duration === 'whole') {
    return;
  }

  const middleLineY = staffTop + STAFF_LINE_SPACING * 2;
  const stemDirection = y <= middleLineY ? 'down' : 'up';
  const stemX = stemDirection === 'up' ? x + NOTEHEAD_RX : x - NOTEHEAD_RX;
  const stemEndY = stemDirection === 'up' ? y - STEM_LENGTH : y + STEM_LENGTH;

  doc.moveTo(stemX, y).lineTo(stemX, stemEndY).stroke();
}

function drawScore(doc, score) {
  const [pageWidth] = getPageSize(score);
  const staffLeft = 62;
  const staffRight = pageWidth - 62;
  const staves = score.parts[0]?.staves ?? [];
  const layout = {
    measureCount: getMeasureCount(score),
    staffLeft,
    staffRight,
    staffWidth: staffRight - staffLeft,
    systemTop: 218,
    timeSignature: score.timeSignature,
  };

  doc.font('Times-Bold').fontSize(26).text(score.title || 'Untitled', 0, 56, {
    align: 'center',
  });
  doc
    .font('Times-Italic')
    .fontSize(11)
    .text(`Moderato \u2669 = ${score.tempo}`, staffLeft, 106)
    .text(score.composer || 'Composer', staffRight - 96, 106, {
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
