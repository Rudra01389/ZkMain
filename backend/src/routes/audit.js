const express = require("express");
const { validateChain } = require("../services/auditChain");
const { loadAuditChain, listBatches } = require("../services/store");

const router = express.Router();

router.get("/batches", (req, res) => {
  res.json({ batches: listBatches() });
});

router.get("/:batchId", (req, res) => {
  const chain = loadAuditChain(req.params.batchId);
  res.json({ batchId: req.params.batchId, records: chain });
});

router.post("/:batchId/validate", (req, res) => {
  const result = validateChain(req.params.batchId);
  res.json(result);
});

module.exports = router;
