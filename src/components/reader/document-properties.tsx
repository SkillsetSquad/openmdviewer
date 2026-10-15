"use client";
import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
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
  const fields = Object.entries(model.frontmatter.metadata);
  return (
    <Modal title="Document properties" onClose={onClose}>
      <p className="dialog-description">
        Declared frontmatter is shown as written. Edit source to change it.
        Browser-local tags are managed separately.
      </p>
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
