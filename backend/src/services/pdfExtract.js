const pdfParse = require("pdf-parse");

/** Extracts plain text from an uploaded PDF buffer. */
async function extractText(buffer) {
  const data = await pdfParse(buffer);
  return (data.text || "").trim();
}

module.exports = { extractText };
