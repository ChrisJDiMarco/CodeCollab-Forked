const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createFileWatcherService } = require("../electron/services/file-watcher-service");

const PROJECT_ID = "project-test-123";

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

function createGitFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codecollab-file-watcher-"));
  const repoPath = path.join(root, "repo");
  const remotePath = path.join(root, "remote.git");

  fs.mkdirSync(repoPath);
  git(root, ["init", "--bare", remotePath]);
  git(repoPath, ["init"]);
  git(repoPath, ["config", "user.name", "CodeCollab Test"]);
  git(repoPath, ["config", "user.email", "codecollab-test@local.invalid"]);

  fs.writeFileSync(path.join(repoPath, "README.md"), "hello\n", "utf8");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "initial"]);
  git(repoPath, ["branch", "-M", "main"]);
  git(repoPath, ["remote", "add", "origin", remotePath]);
  git(repoPath, ["push", "-u", "origin", "main"]);
  git(repoPath, ["checkout", "-b", "codebuddy-build"]);
  git(repoPath, ["push", "-u", "origin", "codebuddy-build"]);

  return {
    repoPath,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function createService(broadcasts, events, activityEvents) {
  return createFileWatcherService({
    p2pService: {
      broadcastStateChange: (...args) => broadcasts.push(args),
    },
    gitQueueService: {
      enqueue: async (_repo, _label, fn) => fn(),
      getDepth: () => 0,
    },
    sendEvent: (event, payload) => events.push({ event, payload }),
    activityService: {
      addEvent: (event) => activityEvents.push(event),
    },
  });
}

test("file watcher broadcasts git sync events with the active project id", async () => {
  const fixture = createGitFixture();
  const broadcasts = [];
  const events = [];
  const activityEvents = [];
  const service = createService(broadcasts, events, activityEvents);

  try {
    const started = await service.startWatching(fixture.repoPath, PROJECT_ID);
    assert.equal(started.watching, true);
    assert.equal(started.projectId, PROJECT_ID);

    fs.appendFileSync(path.join(fixture.repoPath, "README.md"), "auto sync change\n", "utf8");
    await service.doAutoSync();

    fs.appendFileSync(path.join(fixture.repoPath, "README.md"), "push main change\n", "utf8");
    const pushResult = await service.pushToMain(fixture.repoPath, PROJECT_ID);
    assert.equal(pushResult.success, true, pushResult.message);
  } finally {
    await service.stopWatching().catch(() => {});
    fixture.cleanup();
  }

  assert.deepEqual(
    broadcasts.map(([projectId, category, id, data]) => ({
      projectId,
      category,
      id,
      branch: data.branch,
    })),
    [
      { projectId: PROJECT_ID, category: "new-commits", id: "codebuddy-build", branch: "codebuddy-build" },
      { projectId: PROJECT_ID, category: "new-commits", id: "codebuddy-build", branch: "codebuddy-build" },
      { projectId: PROJECT_ID, category: "main-updated", id: "main", branch: "main" },
    ],
  );
  assert.equal(events.some((entry) => entry.event === "fileWatcher:syncComplete" && entry.payload.success), true);
  assert.equal(events.some((entry) => entry.event === "fileWatcher:syncStart" && entry.payload.projectId === PROJECT_ID), true);
  assert.equal(activityEvents.some((entry) => entry.type === "sync" && entry.title === "Workspace synced"), true);
});
