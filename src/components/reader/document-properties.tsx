"use client";
import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
import {
  parseRepositoryOrigin,
  repositoryFileURL,
} from "@/lib/repositories/types";
import { markdownModel } from "@/lib/markdown-model";
import type { ReaderDocument } from "@/lib/types";
export default function DocumentProperties({
  document,
  onEdit,
  onClose,
}: {
  document: ReaderDocument;
  onEdit: () => void;
  onClose: () => void;
}) {
  const model = markdownModel(document.content);
  const origin = parseRepositoryOrigin(document.repositorySource);
  const fields = Object.entries(model.frontmatter.metadata);
  return (
    <Modal title="Document properties" onClose={onClose}>
      <p className="dialog-description">
        Declared frontmatter is shown as written. Edit source to change it.
        Browser-local tags are managed separately.
      </p>
      {origin && (
        <section className="repository-origin">
          <h3>GitHub source</h3>
          <p>
            {origin.owner}/{origin.name} · {origin.ref.kind} {origin.ref.name}
          </p>
          <p>Commit {origin.commit}</p>
          <a
            href={repositoryFileURL(origin)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View original file on GitHub
          </a>
          <p>
            This is an editable local copy. Browser edits do not change GitHub.
          </p>
        </section>
      )}
      {model.frontmatter.error && (
        <p role="alert" className="frontmatter-error">
          {model.frontmatter.error}
        </p>
      )}
      <div className="properties-stats">
        {Object.entries(model.statistics).map(([key, value]) => (
          <div key={key}>
            <span>
              {key === "sentences"
                ? "Estimated sentences"
                : key.replace(/([A-Z])/g, " $1")}
            </span>
            <strong>{value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
      <h3 className="properties-label">
        {model.frontmatter.format
          ? `${model.frontmatter.format.toUpperCase()} frontmatter`
          : "No frontmatter declared"}
      </h3>
      <dl className="metadata-fields">
        {fields.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              {typeof value === "object" ? (
                <pre>{JSON.stringify(value, null, 2)}</pre>
              ) : (
                String(value)
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="dialog-buttons">
        <Button onClick={onEdit}>Edit frontmatter in source</Button>
      </div>
    </Modal>
  );
}
