// A correction's text, normalised the same way on the server (the per-image
// corrections route stores it so) and in the browser (the materials panel
// checks the lengths the server will check). Pure: no I/O, no server-only
// import, so client components may use it.

// Every character a reader may take as a line break, as in build-prompt.ts.
const LINE_BREAKS = /[\n\r\v\f\u0085\u2028\u2029]/g;

/**
 * A correction's text as stored: line breaks become spaces, every run of
 * spaces or tabs becomes one space, ends trimmed. Words are never joined.
 */
export function normalizeCorrectionText(text: string): string {
  return text
    .replace(LINE_BREAKS, ' ')
    .replace(/[\t ]+/g, ' ')
    .trim();
}
