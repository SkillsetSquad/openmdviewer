"use client";
import { useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "./modal";
import { storage } from "@/lib/storage";
import type { LocalWorkspace } from "@/lib/types";
export function WorkspaceManager({
  workspaces,
  current,
  onChanged,
  onSwitch,
  onClose,
}: {
  workspaces: LocalWorkspace[];
  current: string;
  onChanged: () => Promise<void>;
  onSwitch: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("📁");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Your local workspaces" onClose={onClose}>
      <p className="dialog-description">
        Keep projects separate. Each workspace has its own documents, images,
        tags, and trash. Everything stays in this browser.
      </p>
      {editing === null ? (
        <>
          <div className="workspace-list">
            {workspaces.map((w) => (
              <div key={w.id}>
                <button
                  onClick={async () => {
                    if (await onSwitch(w.id)) onClose();
                  }}
                >
                  <span>{w.icon}</span>
                  <span>
                    <strong>{w.name}</strong>
                    <small>{w.description || "Local workspace"}</small>
                  </span>
                  {w.id === current && <small>Current</small>}
                </button>
                <button
                  aria-label={`Edit ${w.name} workspace`}
                  onClick={() => {
                    setEditing(w.id);
                    setName(w.name);
                    setDescription(w.description);
                    setIcon(w.icon);
                  }}
                >
                  <Settings2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <Button
            className="create-workspace"
            onClick={() => {
              setEditing("new");
              setName("");
              setDescription("");
              setIcon("📁");
            }}
          >
            <Plus size={15} />
            New workspace
          </Button>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              let created: LocalWorkspace | undefined;
              if (editing === "new")
                created = await storage.createWorkspace(
                  name,
                  description,
                  icon,
                );
              else
                await storage.renameWorkspace(editing, name, description, icon);
              await onChanged();
              if (created) {
                if (await onSwitch(created.id)) onClose();
              } else setEditing(null);
            } catch {
              setError(
                "Could not save this workspace. Please export a backup if browser storage is full.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="form-label">
            Workspace name
            <input
              autoFocus
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="form-label">
            Description
            <input
              maxLength={240}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="form-label">
            Icon
            <input
              maxLength={8}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="dialog-buttons">
            <Button
              variant="outline"
              type="button"
              onClick={() => setEditing(null)}
            >
              Back
            </Button>
            <Button disabled={busy} type="submit">
              {editing === "new" ? "Create workspace" : "Save workspace"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
