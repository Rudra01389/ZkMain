const { spawn } = require("child_process");
const path = require("path");
const { VENV_PYTHON, ML_CIRCUIT_DIR } = require("./paths");

/**
 * Runs one of the ml/circuit/*.py CLI scripts, which each accept a single
 * JSON argv payload and print a single JSON object as their last stdout
 * line. Non-JSON lines (e.g. ezkl's own log output) are ignored.
 */
function runPythonScript(scriptName, payload, { timeoutMs = 120000, cwd = ML_CIRCUIT_DIR } = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(cwd, scriptName);
    const child = spawn(VENV_PYTHON, [scriptPath, JSON.stringify(payload)], {
      cwd,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${scriptName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const lines = stdout.trim().split("\n").filter(Boolean);
      const jsonLine = [...lines].reverse().find((l) => l.trim().startsWith("{"));

      if (!jsonLine) {
        reject(
          new Error(
            `${scriptName} exited ${code} with no JSON output.\nstdout: ${stdout}\nstderr: ${stderr}`
          )
        );
        return;
      }

      try {
        const parsed = JSON.parse(jsonLine);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`${scriptName} produced invalid JSON: ${jsonLine}\nstderr: ${stderr}`));
      }
    });
  });
}

module.exports = { runPythonScript };
