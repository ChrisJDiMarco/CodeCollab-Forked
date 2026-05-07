const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createProjectService } = require("../electron/services/project-service");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GCM_INTERACTIVE: "never",
      GIT_TERMINAL_PROMPT: "0",
    },
    stdio: "pipe",
    windowsHide: true,
  }).trim();
}

function createRepo(root) {
  const repoPath = path.join(root, "repo");
  fs.mkdirSync(repoPath);
  git(repoPath, ["init"]);
  git(repoPath, ["config", "user.name", "CodeCollab Test"]);
  git(repoPath, ["config", "user.email", "codecollab-test@local.invalid"]);
  fs.writeFileSync(path.join(repoPath, "README.md"), "hello\n", "utf8");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "initial"]);
  git(repoPath, ["branch", "-M", "codebuddy-build"]);
  return repoPath;
}

function createFakeCodex(binDir) {
  const codexPath = path.join(binDir, "codex");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    codexPath,
    [
      "#!/usr/bin/env node",
      "process.stdin.resume();",
      "process.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'partial response that must not persist' } }) + '\\n');",
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.chmodSync(codexPath, 0o755);
}

function createFakeCopilot(binDir) {
  const copilotPath = path.join(binDir, "copilot");
  const ghPath = path.join(binDir, "gh");
  fs.mkdirSync(binDir, { recursive: true });
  const script = [
      "#!/usr/bin/env node",
      "process.stdout.write(JSON.stringify({ type: 'tool.execution_start', data: { toolName: 'shell', arguments: { command: 'npm test' } } }) + '\\n');",
      "process.stdin.setEncoding('utf8');",
      "let input = '';",
      "process.stdin.on('data', (chunk) => {",
      "  input += chunk;",
      "  if (input.includes('\\n')) {",
      "    process.stdout.write(JSON.stringify({ type: 'assistant.message', data: { content: `approval:${input.trim()}` } }) + '\\n');",
      "    process.exit(0);",
      "  }",
      "});",
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n");
  fs.writeFileSync(copilotPath, script, "utf8");
  fs.writeFileSync(ghPath, script, "utf8");
  fs.chmodSync(copilotPath, 0o755);
  fs.chmodSync(ghPath, 0o755);
  return ghPath;
}

async function waitUntil(predicate, message, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

test("cancelled solo agent does not emit completion or persist partial output", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codecollab-project-cancel-"));
  const oldPath = process.env.PATH;
  const binDir = path.join(root, "bin");
  createFakeCodex(binDir);
  process.env.PATH = `${binDir}${path.delimiter}${oldPath || ""}`;

  const repoPath = createRepo(root);
  let settings = {
    cliTools: { git: "git" },
    featureFlags: { codexCli: true, claudeCode: false, githubCopilotCli: false },
    projectDefaults: { copilotModel: "default", approvalMode: "auto" },
    projects: [{
      id: "project-cancel",
      name: "Cancel Test",
      description: "A project used to verify agent cancellation.",
      creatorName: "Tester",
      repoPath,
      dashboard: {
        systemPromptMarkdown: "",
        conversation: [],
        taskThreads: [],
        soloSessions: [],
        activity: [],
        artifacts: [],
        plan: null,
      },
    }],
  };

  const events = [];
  const service = createProjectService({
    app: { getPath: (name) => path.join(root, name) },
    settingsService: {
      readSettings: async () => clone(settings),
      atomicUpdate: async (updater) => {
        const next = await updater(clone(settings));
        if (next !== undefined) settings = clone(next);
        return clone(settings);
      },
    },
    toolingService: {
      getModelCatalogs: () => ({
        codex: [{ id: "default", label: "Default" }],
        claude: [],
        copilot: [],
      }),
      installCopilot: async () => ({ success: false }),
    },
    p2pService: {},
    sharedStateService: {
      readSharedFile: async () => ({ exists: false, content: "" }),
      writeSharedFile: async () => undefined,
      saveConversation: async () => undefined,
    },
  });
  service.__setEventSender((event, payload) => events.push({ event, payload }));

  try {
    const runPromise = service.sendSoloMessage({
      projectId: "project-cancel",
      prompt: "Please do a slow thing.",
      model: "default",
    });

    await waitUntil(() => service.getActiveRequest()?.active, "agent did not start");
    service.cancelActiveRequest();

    await assert.rejects(runPromise, (error) => {
      assert.equal(error.code, "AGENT_CANCELLED");
      return true;
    });

    assert.equal(events.some((entry) => entry.event === "project:agentCancelled"), true);
    assert.equal(events.some((entry) => entry.event === "project:agentCompleted"), false);
    assert.deepEqual(settings.projects[0].dashboard.soloSessions, []);
  } finally {
    service.cancelActiveRequest();
    process.env.PATH = oldPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("denying a manual tool approval writes no without cancelling the agent", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codecollab-project-approval-"));
  const oldPath = process.env.PATH;
  const binDir = path.join(root, "bin");
  const fakeGithubCli = createFakeCopilot(binDir);
  process.env.PATH = `${binDir}${path.delimiter}${oldPath || ""}`;

  const repoPath = createRepo(root);
  let settings = {
    cliTools: { git: "git", githubCli: fakeGithubCli },
    featureFlags: { codexCli: false, claudeCode: false, githubCopilotCli: true },
    projectDefaults: { copilotModel: "auto", approvalMode: "manual" },
    projects: [{
      id: "project-approval",
      name: "Approval Test",
      description: "A project used to verify manual tool approval.",
      creatorName: "Tester",
      repoPath,
      dashboard: {
        systemPromptMarkdown: "",
        conversation: [],
        taskThreads: [],
        soloSessions: [],
        activity: [],
        artifacts: [],
        plan: null,
      },
    }],
  };

  const events = [];
  const service = createProjectService({
    app: { getPath: (name) => path.join(root, name) },
    settingsService: {
      readSettings: async () => clone(settings),
      atomicUpdate: async (updater) => {
        const next = await updater(clone(settings));
        if (next !== undefined) settings = clone(next);
        return clone(settings);
      },
    },
    toolingService: {
      getModelCatalogs: () => ({ codex: [], claude: [], copilot: [] }),
      installCopilot: async () => ({ success: false }),
    },
    p2pService: {},
    sharedStateService: {
      readSharedFile: async () => ({ exists: false, content: "" }),
      writeSharedFile: async () => undefined,
      saveConversation: async () => undefined,
    },
  });
  service.__setEventSender((event, payload) => events.push({ event, payload }));

  try {
    const runPromise = service.sendSoloMessage({
      projectId: "project-approval",
      prompt: "Please request a tool.",
      model: "auto",
    });

    await waitUntil(() => service.getPendingApproval()?.toolName === "shell", "approval request did not arrive");
    assert.equal(service.getActiveRequest()?.active, true);

    const denied = service.sendToolApproval(false);
    assert.deepEqual(denied, { success: true });

    const result = await runPromise;
    assert.equal(result.sessionId, settings.projects[0].dashboard.soloSessions[0].id);
    assert.equal(events.some((entry) => entry.event === "project:agentCancelled"), false);
    assert.equal(events.some((entry) => entry.event === "project:agentCompleted"), true);
    assert.equal(service.getPendingApproval(), null);
    assert.equal(settings.projects[0].dashboard.soloSessions[0].messages[1].text, "approval:n");
  } finally {
    service.cancelActiveRequest();
    process.env.PATH = oldPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
