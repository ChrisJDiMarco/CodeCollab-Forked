const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createToolingService } = require("../electron/services/tooling-service");
const platform = require("../electron/services/platform");

function createFakePython3(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const python3Path = path.join(binDir, "python3");
  fs.writeFileSync(python3Path, "#!/bin/sh\necho 'Python 3.13.1'\n", "utf8");
  fs.chmodSync(python3Path, 0o755);
  return python3Path;
}

function createFakeBrewThatInstallsNode(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const brewPath = path.join(binDir, "brew");
  fs.writeFileSync(
    brewPath,
    `#!/bin/sh
DIR=\${0%/*}
if [ "$1" = "--version" ]; then
  echo "Homebrew 4.0.0"
  exit 0
fi
if [ "$1" = "install" ] && [ "$2" = "node" ]; then
  {
    printf '%s\\n' '#!/bin/sh'
    printf '%s\\n' "echo 'v22.22.2'"
  } > "$DIR/node"
  /bin/chmod +x "$DIR/node"
  echo "installed node"
  exit 0
fi
echo "unexpected brew args: $*" >&2
exit 1
`,
    "utf8",
  );
  fs.chmodSync(brewPath, 0o755);
}

function createFakeGhWithCopilot(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const ghPath = path.join(binDir, "gh");
  fs.writeFileSync(
    ghPath,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "gh version 2.88.1"
  exit 0
fi
if [ "$1" = "copilot" ] && [ "$2" = "--help" ]; then
  echo "Runs the GitHub Copilot CLI."
  exit 0
fi
echo "unexpected gh args: $*" >&2
exit 1
`,
    "utf8",
  );
  fs.chmodSync(ghPath, 0o755);
}

function createService({ processService = {}, settings = { cliTools: {}, featureFlags: {} } } = {}) {
  return createToolingService({
    processService,
    settingsService: {
      readSettings: async () => settings,
    },
  });
}

test("tool status detects Python when only python3 is available", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codecollab-python3-only-"));
  const oldPath = process.env.PATH;
  createFakePython3(path.join(root, "bin"));
  process.env.PATH = path.join(root, "bin");

  try {
    const service = createService();
    const statuses = await service.getToolStatus();
    const python = statuses.find((status) => status.id === "python");

    assert.equal(python.available, true);
    assert.equal(python.command, "python3");
    assert.match(python.detail, /Python 3\.13\.1/);
  } finally {
    process.env.PATH = oldPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Python install succeeds immediately when python3 is already installed", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codecollab-python3-install-"));
  const oldPath = process.env.PATH;
  createFakePython3(path.join(root, "bin"));
  process.env.PATH = path.join(root, "bin");

  try {
    const service = createService();
    const result = await service.installPython();

    assert.equal(result.success, true);
    assert.match(result.detail, /Python 3\.13\.1/);
    assert.equal(result.log.some((entry) => entry.includes("Checking python3 --version")), true);
  } finally {
    process.env.PATH = oldPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Node install uses Homebrew on macOS when node is missing", { skip: process.platform !== "darwin" }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codecollab-brew-node-"));
  const binDir = path.join(root, "bin");
  const oldPath = process.env.PATH;
  const originalKnownLocations = platform.getKnownCommandLocations;
  createFakeBrewThatInstallsNode(binDir);
  process.env.PATH = binDir;
  platform.getKnownCommandLocations = (command) => (command === "node" ? [path.join(binDir, "node")] : []);

  try {
    const service = createService();
    const result = await service.installNodeJs();

    assert.equal(result.success, true);
    assert.match(result.detail, /v22\.22\.2/);
    assert.equal(result.log.some((entry) => entry.includes("Trying Homebrew install (node)")), true);
  } finally {
    platform.getKnownCommandLocations = originalKnownLocations;
    process.env.PATH = oldPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("tool status detects Copilot when gh copilot is available", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codecollab-gh-copilot-"));
  const oldPath = process.env.PATH;
  createFakeGhWithCopilot(path.join(root, "bin"));
  process.env.PATH = path.join(root, "bin");

  try {
    const service = createService();
    const statuses = await service.getToolStatus();
    const copilot = statuses.find((status) => status.id === "githubCopilotCli");

    assert.equal(copilot.available, true);
    assert.equal(copilot.command, "gh copilot");
    assert.match(copilot.detail, /via gh/);
  } finally {
    process.env.PATH = oldPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("generic Copilot prompt runs through gh copilot when that is the ready invocation", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codecollab-run-gh-copilot-"));
  const oldPath = process.env.PATH;
  let captured = null;
  createFakeGhWithCopilot(path.join(root, "bin"));
  process.env.PATH = path.join(root, "bin");

  try {
    const service = createService({
      settings: { cliTools: {}, featureFlags: { githubCopilotCli: true } },
      processService: {
        runProgram: async (file, args, cwd, options) => {
          captured = { file, args, cwd, options };
          return { processId: "process-1", stdout: "ok", stderr: "", exitCode: 0 };
        },
      },
    });

    const result = await service.runGenericPrompt({ prompt: "hello", cwd: root, model: "auto", timeoutMs: 120000 });

    assert.equal(result.processId, "process-1");
    assert.equal(captured.file, "gh");
    assert.deepEqual(captured.args, ["copilot", "-p", "hello"]);
    assert.equal(captured.cwd, root);
    assert.equal(captured.options.timeoutMs, 120000);
  } finally {
    process.env.PATH = oldPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("generic Copilot prompt fails before spawning when Copilot is not ready", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codecollab-run-missing-copilot-"));
  const oldPath = process.env.PATH;
  const originalKnownLocations = platform.getKnownCommandLocations;
  process.env.PATH = root;
  platform.getKnownCommandLocations = () => [];

  try {
    const service = createService({
      settings: { cliTools: {}, featureFlags: { githubCopilotCli: true } },
      processService: {
        runProgram: async () => {
          throw new Error("runProgram should not be called");
        },
      },
    });

    await assert.rejects(
      () => service.runGenericPrompt({ prompt: "hello", cwd: root, model: "auto" }),
      /GitHub Copilot CLI is not ready/,
    );
  } finally {
    platform.getKnownCommandLocations = originalKnownLocations;
    process.env.PATH = oldPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
