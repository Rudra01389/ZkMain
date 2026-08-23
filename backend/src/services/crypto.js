const crypto = require("crypto");

/** Deterministic JSON stringify (sorted keys) so hashing is order-independent. */
function canonicalStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(value[k])).join(",") + "}";
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function sha256OfObject(obj) {
  return sha256Hex(canonicalStringify(obj));
}

module.exports = { canonicalStringify, sha256Hex, sha256OfObject };
