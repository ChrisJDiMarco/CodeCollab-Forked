const fs = require("fs/promises");
const path = require("path");

/**
 * Manages the .codebuddy/ directory inside project repos.
 * All shared data (conversations, agents, tasks, members) is stored as
 * plain JSON files in the repo so it syncs for free via git push/pull.
 */
function createSharedStateService() {
  const SHARED_DIR = ".codebuddy";

  const SUBDIRS = [
    "conversations",
    "agents",
    "tasks",
    "members",
    "versions",
    "docs",
    "plans",
  ];

  async function ensureSharedDir(repoPath) {
    const baseDir = path.join(repoPath, SHARED_DIR);
    await fs.mkdir(baseDir, { recursive: true });

    for (const sub of SUBDIRS) {
      await fs.mkdir(path.join(baseDir, sub), { recursive: true });
    }

    // Create .gitkeep files so empty dirs are tracked
    for (const sub of SUBDIRS) {
      const keepFile = path.join(baseDir, sub, ".gitkeep");
      try {
        await fs.access(keepFile);
      } catch {
        await fs.writeFile(keepFile, "", "utf-8");
      }
    }

    // Create README for the shared directory
    const readmePath = path.join(baseDir, "README.md");
    try {
      await fs.access(readmePath);
    } catch {
      await fs.writeFile(
        readmePath,
        [
          "# .codebuddy — Shared Workspace State",
          "",
          "This directory is managed by CodeBuddy. It stores shared project state",
          "so collaborators can see each other's conversations, agents, tasks, and more.",
          "",
          "Everything syncs for free through Git — no cloud services needed.",
          "",
          "## Structure",
          "- `conversations/` — Chat history (PM chat, Freestyle sessions, task threads)",
          "- `agents/` — Agent configurations and system prompts",
          "- `tasks/` — Task board state and action items",
          "- `members/` — Team member profiles and preferences",
          "- `versions/` — Version snapshots and checkpoints",
          "- `docs/` — Auto-generated documentation",
          "",
          "**Do not edit these files by hand** — CodeBuddy manages them automatically.",
        ].join("\n"),
        "utf-8"
      );
    }

    return { initialized: true, path: baseDir };
  }

  async function isInitialized(repoPath) {
    try {
      const baseDir = path.join(repoPath, SHARED_DIR);
      const stat = await fs.stat(baseDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Resolve a path that should live inside `<repoPath>/<SHARED_DIR>/` and
   * refuse anything that escapes the directory (e.g. via `..`, absolute
   * paths, or symlink-style tricks). This is critical because some callers
   * accept peer-supplied IDs (snapshot IDs, conversation IDs) and use them
   * to derive filenames; without this guard a malicious peer could write
   * outside the shared directory.
   */
  function resolveSharedPath(repoPath, relativePath) {
    if (typeof relativePath !== "string" || relativePath.length === 0) {
      throw new Error("Shared path must be a non-empty string.");
    }
    if (relativePath.length > 512) {
      throw new Error("Shared path is too long.");
    }
    // Reject NUL bytes (which can break path checks on some filesystems).
    if (relativePath.includes("\0")) {
      throw new Error("Shared path contains NUL byte.");
    }
    const baseDir = path.resolve(repoPath, SHARED_DIR);
    const candidate = path.resolve(baseDir, relativePath);
    // Containment check — must be the base dir or a descendant of it.
    const rel = path.relative(baseDir, candidate);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Shared path escapes the .codebuddy directory.");
    }
    return candidate;
  }

  async function readSharedFile(repoPath, relativePath) {
    let filePath;
    try { filePath = resolveSharedPath(repoPath, relativePath); }
    catch { return { exists: false, content: null }; }
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return { exists: true, content };
    } catch {
      return { exists: false, content: null };
    }
  }

  async function writeSharedFile(repoPath, relativePath, content) {
    const filePath = resolveSharedPath(repoPath, relativePath);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    return { path: filePath };
  }

  async function listSharedDir(repoPath, relativePath) {
    let dirPath;
    try { dirPath = resolveSharedPath(repoPath, relativePath); }
    catch { return []; }
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((e) => e.name !== ".gitkeep")
        .map((e) => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          type: e.isDirectory() ? "directory" : "file",
        }));
    } catch {
      return [];
    }
  }

  async function saveConversation(repoPath, conversationId, messages, metadata) {
    const data = {
      id: conversationId,
      updatedAt: new Date().toISOString(),
      ...metadata,
      messages,
    };
    await writeSharedFile(
      repoPath,
      `conversations/${conversationId}.json`,
      JSON.stringify(data, null, 2)
    );
    return data;
  }

  async function loadConversation(repoPath, conversationId) {
    const result = await readSharedFile(repoPath, `conversations/${conversationId}.json`);
    if (!result.exists || !result.content) return null;
    try {
      return JSON.parse(result.content);
    } catch {
      return null;
    }
  }

  async function listConversations(repoPath) {
    const entries = await listSharedDir(repoPath, "conversations");
    const conversations = [];
    for (const entry of entries) {
      if (entry.type === "file" && entry.name.endsWith(".json")) {
        try {
          const content = await fs.readFile(entry.path, "utf-8");
          const data = JSON.parse(content);
          conversations.push({
            id: data.id,
            title: data.title || data.id,
            updatedAt: data.updatedAt,
            messageCount: data.messages?.length ?? 0,
            type: data.type || "chat",
          });
        } catch { /* skip corrupted files */ }
      }
    }
    return conversations.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async function saveMember(repoPath, memberProfile) {
    const data = {
      ...memberProfile,
      updatedAt: new Date().toISOString(),
    };
    await writeSharedFile(
      repoPath,
      `members/${memberProfile.id || memberProfile.name}.json`,
      JSON.stringify(data, null, 2)
    );
    return data;
  }

  async function listMembers(repoPath) {
    const entries = await listSharedDir(repoPath, "members");
    const members = [];
    for (const entry of entries) {
      if (entry.type === "file" && entry.name.endsWith(".json")) {
        try {
          const content = await fs.readFile(entry.path, "utf-8");
          members.push(JSON.parse(content));
        } catch { /* skip */ }
      }
    }
    return members;
  }

  // ─── Plans v2 (flat, executable plans) ──────────────────────────────────

  function sanitizePlanId(planId) {
    if (typeof planId !== "string" || !planId) {
      throw new Error("Plan id must be a non-empty string.");
    }
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(planId)) {
      throw new Error("Plan id contains invalid characters.");
    }
    return planId;
  }

  async function savePlanV2(repoPath, plan) {
    const id = sanitizePlanId(plan?.id);
    const payload = JSON.stringify(plan, null, 2);
    await writeSharedFile(repoPath, `plans/${id}.json`, payload);
    return plan;
  }

  async function loadPlanV2(repoPath, planId) {
    const id = sanitizePlanId(planId);
    const result = await readSharedFile(repoPath, `plans/${id}.json`);
    if (!result.exists || !result.content) return null;
    try { return JSON.parse(result.content); }
    catch { return null; }
  }

  async function deletePlanV2(repoPath, planId) {
    const id = sanitizePlanId(planId);
    let filePath;
    try { filePath = resolveSharedPath(repoPath, `plans/${id}.json`); }
    catch { return { deleted: false }; }
    try {
      await fs.unlink(filePath);
      return { deleted: true };
    } catch {
      return { deleted: false };
    }
  }

  async function listPlansV2(repoPath) {
    const entries = await listSharedDir(repoPath, "plans");
    const plans = [];
    for (const entry of entries) {
      if (entry.type === "file" && entry.name.endsWith(".json")) {
        try {
          const content = await fs.readFile(entry.path, "utf-8");
          plans.push(JSON.parse(content));
        } catch { /* skip corrupted */ }
      }
    }
    return plans;
  }

  async function readActivePlanId(repoPath) {
    const result = await readSharedFile(repoPath, "active-plan.json");
    if (!result.exists || !result.content) return null;
    try {
      const data = JSON.parse(result.content);
      return typeof data?.activePlanId === "string" ? data.activePlanId : null;
    } catch {
      return null;
    }
  }

  async function writeActivePlanId(repoPath, activePlanId) {
    const data = { activePlanId: activePlanId ?? null, updatedAt: new Date().toISOString() };
    await writeSharedFile(repoPath, "active-plan.json", JSON.stringify(data, null, 2));
    return data;
  }

  return {
    ensureSharedDir,
    isInitialized,
    readSharedFile,
    writeSharedFile,
    listSharedDir,
    saveConversation,
    loadConversation,
    listConversations,
    saveMember,
    listMembers,
    savePlanV2,
    loadPlanV2,
    deletePlanV2,
    listPlansV2,
    readActivePlanId,
    writeActivePlanId,
  };
}

module.exports = { createSharedStateService };
