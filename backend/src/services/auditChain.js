const { sha256OfObject } = require("./crypto");
const { loadAuditChain, saveAuditChain } = require("./store");

const GENESIS = "GENESIS";

/**
 * Tamper-evident hash-linked audit structure (see docs/ARCHITECTURE.md).
 * Each batch is its own hash chain: record[i].prevHash must equal
 * record[i-1].recordHash, and record[i].recordHash must equal the SHA-256
 * of record[i]'s own content. Editing any field in any stored record (the
 * realistic "an operator with file/DB access edits one row" threat model)
 * breaks that record's self-hash, which validateChain() detects.
 *
 * This is a hash chain, NOT the zero-knowledge proof layer. It proves the
 * evaluation *record* wasn't altered after being written to the audit
 * log; it says nothing on its own about whether the score was computed
 * correctly — that guarantee comes from the ZK proof (see zkVerify.js).
 */
function fieldsForHash(record) {
  const { recordHash, ...rest } = record;
  return rest;
}

function appendRecord(batchId, fields) {
  const chain = loadAuditChain(batchId);
  const prevHash = chain.length > 0 ? chain[chain.length - 1].recordHash : GENESIS;
  const record = {
    index: chain.length,
    batchId,
    prevHash,
    ...fields,
  };
  record.recordHash = sha256OfObject(fieldsForHash(record));
  chain.push(record);
  saveAuditChain(batchId, chain);
  return record;
}

function validateChain(batchId) {
  const chain = loadAuditChain(batchId);
  const results = [];
  let intact = true;
  let firstBrokenIndex = null;
  let reason = null;

  let expectedPrev = GENESIS;
  for (const record of chain) {
    const recomputed = sha256OfObject(fieldsForHash(record));
    const selfHashValid = recomputed === record.recordHash;
    const linkValid = record.prevHash === expectedPrev;
    const ok = selfHashValid && linkValid;

    if (!ok && intact) {
      intact = false;
      firstBrokenIndex = record.index;
      reason = !selfHashValid
        ? "record content does not match its stored hash (record was edited after being written)"
        : "prevHash does not match the previous record's hash (chain link broken / record inserted, deleted, or reordered)";
    }

    results.push({ index: record.index, evaluationId: record.evaluationId, selfHashValid, linkValid, ok });
    expectedPrev = record.recordHash; // continue walking with the value the chain actually stores
  }

  return {
    batchId,
    length: chain.length,
    intact,
    firstBrokenIndex,
    reason,
    records: results,
    batchRootHash: chain.length > 0 ? chain[chain.length - 1].recordHash : null,
  };
}

module.exports = { appendRecord, validateChain, GENESIS };
