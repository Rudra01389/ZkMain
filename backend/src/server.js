const express = require("express");
const cors = require("cors");

const evaluateRoute = require("./routes/evaluate");
const verifyRoute = require("./routes/verify");
const auditRoute = require("./routes/audit");
const modelRoute = require("./routes/model");
const tamperRoute = require("./routes/tamper");
const { ensureDirs } = require("./services/store");

const app = express();
const PORT = process.env.PORT || 4000;

ensureDirs();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/evaluate", evaluateRoute);
app.use("/api/verify", verifyRoute);
app.use("/api/audit", auditRoute);
app.use("/api/model", modelRoute);
app.use("/api/tamper", tamperRoute);

app.use((req, res) => res.status(404).json({ error: "not found" }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

app.listen(PORT, () => {
  console.log(`ZK evaluation backend listening on http://localhost:${PORT}`);
});
