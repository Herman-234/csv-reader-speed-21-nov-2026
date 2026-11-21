// Fast drop-in replacement for csv-reader 1.0.0 (make.fun's reference CSV reader).
// run(input) returns exactly what csv-reader 1.0.0 returns for {text, header}:
// {columns, rows, errors}. Same broken-row policy, same error codes, same order.
//
// How it is faster: the reference builds every field one character at a time.
// This scanner jumps with indexOf/slice instead:
//  - an unquoted field is one slice up to the nearest comma, LF or CR;
//  - a quoted field jumps quote to quote, slicing the spans between them;
//  - only spans that actually contain a line break are walked character by character.
// No state is kept between calls: every run(input) starts from scratch.

// How a field ended.
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1; // a U+FEFF at the very start is dropped

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Scratch shared by the field readers: what the last field read was, how it ended,
  // and how many characters the unquoted reader kept (for the quote_junk check).
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;
  // Newlines counted inside the quoted span currently being read.
  let segNl = 0;

  // Reads unquoted characters onto `value` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Sets fValue/fEnded/fAdded.
  // Only two indexOf scans per field; the CR check runs on the small span
  // itself, never on the rest of the file.
  function readUnquoted(value) {
    let added = 0;
    let v = value;
    for (;;) {
      const iC = text.indexOf(',', pos);
      const iN = text.indexOf('\n', pos);
      let m = len;
      let k = END;
      if (iC !== -1 && iC < m) { m = iC; k = COMMA; }
      if (iN !== -1 && iN < m) { m = iN; k = LINE_BREAK; }
      let end = m;
      if (k === LINE_BREAK && m > pos && text.charCodeAt(m - 1) === 13) end = m - 1; // CRLF
      const span = text.slice(pos, end);
      const r = span.indexOf('\r');
      if (r !== -1) {
        v += span.slice(0, r);
        added += r;
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos = pos + r + 1;
        continue;
      }
      v += span;
      added += span.length;
      if (k === COMMA) {
        pos = m + 1;
        fValue = v; fEnded = COMMA; fAdded = added;
        return;
      }
      if (k === LINE_BREAK) {
        pos = m + 1;
        line += 1;
        fValue = v; fEnded = LINE_BREAK; fAdded = added;
        return;
      }
      pos = len;
      fValue = v; fEnded = END; fAdded = added;
      return;
    }
  }

  // The span [a, b) inside a quoted field: CRLF and lone CR each read as one LF.
  // Sets segNl to how many line breaks it holds. Fast path when it holds none.
  function segmentValue(a, b) {
    const s = text.slice(a, b);
    if (s.indexOf('\n') === -1 && s.indexOf('\r') === -1) {
      segNl = 0;
      return s;
    }
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const cc = s.charCodeAt(i);
      if (cc === 13) {
        n++;
        if (i + 1 < s.length && s.charCodeAt(i + 1) === 10) i++;
      } else if (cc === 10) {
        n++;
      }
    }
    segNl = n;
    return s.indexOf('\r') === -1 ? s : s.replace(/\r\n?/g, '\n');
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue/fEnded/fAdded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let nl = 0; // line breaks inside the quotes, counted only once the field closes
    let segStart = pos + 1;
    let p = segStart;
    let q = -1;
    let closed = false;
    for (;;) {
      q = text.indexOf('"', p);
      if (q === -1) break;
      if (q + 1 < len && text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one quote inside the field.
        value += segmentValue(segStart, q);
        nl += segNl;
        value += '"';
        p = q + 2;
        segStart = q + 2;
        continue;
      }
      value += segmentValue(segStart, q);
      nl += segNl;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it
      // is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"');
      return;
    }
    line += nl;
    pos = q + 1;
    if (pos >= len) { fValue = value; fEnded = END; fAdded = 0; return; }
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; fValue = value; fEnded = COMMA; fAdded = 0; return; }
    if (c === 10) { pos += 1; line += 1; fValue = value; fEnded = LINE_BREAK; fAdded = 0; return; }
    if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value; fEnded = LINE_BREAK; fAdded = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    readUnquoted(value);
    if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    let ended;
    do {
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        readQuoted();
      } else {
        lastQuoted = false;
        readUnquoted('');
      }
      fields.push(fValue);
      ended = fEnded;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
