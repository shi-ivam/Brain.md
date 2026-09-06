import React, { useState, useRef, useEffect } from "react";

interface HtmlSimulationViewerProps {
  code: string;
  title: string;
  description?: string;
  explanation?: string;
  onSaveCode?: (newCode: string) => Promise<void> | void;
  onDelete?: () => void;
  onExpand?: () => void;
  isModal?: boolean;
}

export const HtmlSimulationViewer: React.FC<HtmlSimulationViewerProps> = ({
  code,
  title,
  description,
  explanation,
  onSaveCode,
  onDelete,
  onExpand,
  isModal = false,
}) => {
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editorCode, setEditorCode] = useState<string>(code);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setEditorCode(code);
  }, [code]);

  const handleRestart = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleSave = async () => {
    if (!onSaveCode) return;
    setIsSaving(true);
    try {
      await onSaveCode(editorCode);
      setSaveToast("Simulation saved");
      setTimeout(() => setSaveToast(null), 2000);
      setIsEditing(false);
      setIframeKey((prev) => prev + 1);
    } catch (err) {
      console.error("Failed to save simulation code:", err);
      setSaveToast("Failed to save");
      setTimeout(() => setSaveToast(null), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy simulation code:", err);
    }
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "simulation"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        flex: 1,
        height: "100%",
        minHeight: isModal ? 0 : "460px",
        backgroundColor: "var(--bg-card, #222226)",
        border: "1px solid var(--border-subtle, #2b2b32)",
        borderRadius: "6px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Top Controls Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-subtle, #2b2b32)",
          backgroundColor: "var(--bg-panel, #1c1c1f)",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono, monospace)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "2px 7px",
              borderRadius: "4px",
              backgroundColor: "rgba(139, 123, 245, 0.12)",
              color: "var(--accent-purple, #8b7bf5)",
              border: "1px solid rgba(139, 123, 245, 0.25)",
              flexShrink: 0,
            }}
          >
            SIMULATION
          </span>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-primary, #ededec)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={title}
          >
            {title}
          </span>
        </div>

        {/* Minimalist Action Buttons (Zero Emojis) */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {/* Restart */}
          <button
            onClick={handleRestart}
            className="obsidian-btn"
            style={{ fontSize: "12px", padding: "4px 8px", display: "flex", alignItems: "center", gap: "5px" }}
            title="Restart animation"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>Restart</span>
          </button>

          {/* Toggle Code */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`obsidian-btn ${isEditing ? "obsidian-btn-primary" : ""}`}
            style={{ fontSize: "12px", padding: "4px 8px", display: "flex", alignItems: "center", gap: "5px" }}
            title="Inspect / edit HTML code"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>{isEditing ? "View Sim" : "Source"}</span>
          </button>

          {/* Copy HTML */}
          <button
            onClick={handleCopy}
            className="obsidian-btn"
            style={{ fontSize: "12px", padding: "4px 8px", display: "flex", alignItems: "center", gap: "5px" }}
            title="Copy code to clipboard"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>

          {/* Export Standalone HTML */}
          <button
            onClick={handleDownloadHtml}
            className="obsidian-btn"
            style={{ fontSize: "12px", padding: "4px 8px", display: "flex", alignItems: "center", gap: "5px" }}
            title="Download standalone HTML file"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export</span>
          </button>

          {/* Expand Fullscreen */}
          {!isModal && onExpand && (
            <button
              onClick={onExpand}
              className="obsidian-btn"
              style={{ fontSize: "12px", padding: "4px 8px", display: "flex", alignItems: "center", gap: "5px" }}
              title="Expand simulation fullscreen"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              <span>Expand</span>
            </button>
          )}

          {/* Delete */}
          {onDelete && (
            <button
              onClick={onDelete}
              className="obsidian-btn-subtle"
              style={{ fontSize: "12px", padding: "4px 6px", color: "#f87171" }}
              title="Delete visualization"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        style={{
          flex: 1,
          position: "relative",
          minHeight: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {isEditing ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              height: "100%",
              padding: "12px",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "12px", fontFamily: "var(--font-mono, monospace)", color: "var(--text-muted, #64646c)" }}>
                HTML5 / JS SOURCE EDITOR
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setEditorCode(code)}
                  className="obsidian-btn"
                  style={{ fontSize: "12px", padding: "4px 10px" }}
                >
                  Reset
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="obsidian-btn obsidian-btn-primary"
                  style={{ fontSize: "12px", padding: "4px 12px" }}
                >
                  {isSaving ? "Saving..." : "Apply & Save"}
                </button>
              </div>
            </div>
            <textarea
              value={editorCode}
              onChange={(e) => setEditorCode(e.target.value)}
              style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                height: "100%",
                backgroundColor: "var(--bg-input, #1f1f23)",
                color: "#e2e8f0",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "12px",
                lineHeight: "1.5",
                padding: "12px",
                border: "1px solid var(--border-subtle, #2b2b32)",
                borderRadius: "4px",
                resize: "none",
                outline: "none",
              }}
              spellCheck={false}
            />
          </div>
        ) : (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            srcDoc={code}
            sandbox="allow-scripts"
            title={title}
            style={{
              width: "100%",
              height: "100%",
              flex: 1,
              minHeight: 0,
              border: "none",
              backgroundColor: "var(--bg-primary, #161618)",
              display: "block",
            }}
          />
        )}
      </div>

      {/* Notification Toast */}
      {saveToast && (
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            backgroundColor: "rgba(16, 185, 129, 0.9)",
            color: "#fff",
            padding: "6px 14px",
            borderRadius: "4px",
            fontSize: "12px",
            fontFamily: "var(--font-sans, sans-serif)",
            fontWeight: 500,
            zIndex: 100,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
          }}
        >
          {saveToast}
        </div>
      )}

      {/* Pedagogical Explanation Footer (if available) */}
      {(description || explanation) && (
        <div
          style={{
            flexShrink: 0,
            padding: "10px 14px",
            borderTop: "1px solid var(--border-subtle, #2b2b32)",
            backgroundColor: "var(--bg-panel-secondary, #19191b)",
            fontSize: "12.5px",
            lineHeight: "1.5",
            color: "var(--text-secondary, #9c9ca3)",
          }}
        >
          {description && (
            <p style={{ margin: 0, fontWeight: 400, color: "var(--text-primary, #ededec)" }}>
              {description}
            </p>
          )}
          {explanation && (
            <p style={{ margin: description ? "6px 0 0 0" : 0, fontSize: "12px", color: "var(--text-muted, #64646c)" }}>
              {explanation}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
