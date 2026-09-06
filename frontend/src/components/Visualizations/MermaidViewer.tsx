import React, { useEffect, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "var(--font-sans, sans-serif)",
  themeVariables: {
    darkMode: true,
    background: "#18181b",
    primaryColor: "#6366f1",
    primaryTextColor: "#ededec",
    primaryBorderColor: "#818cf8",
    lineColor: "#9c9ca3",
    secondaryColor: "#a855f7",
    tertiaryColor: "#14b8a6",
    nodeBorder: "#6366f1",
    clusterBkg: "#222226",
    clusterBorder: "#3e3e4a",
    titleColor: "#ededec",
    edgeLabelBackground: "#222226",
    actorBkg: "#222226",
    actorBorder: "#6366f1",
    actorTextColor: "#ededec",
    signalColor: "#9c9ca3",
    signalTextColor: "#ededec",
    labelBoxBkgColor: "#222226",
    labelBoxBorderColor: "#818cf8",
    labelTextColor: "#ededec",
    loopTextColor: "#ededec",
    noteBorderColor: "#a855f7",
    noteBkgColor: "#18181b",
    noteTextColor: "#ededec",
  },
});

interface MermaidViewerProps {
  code: string;
  title?: string;
  onSaveCode?: (newCode: string) => Promise<void> | void;
  onInsertIntoNote?: (snippet: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({
  code,
  title,
  onSaveCode,
  onInsertIntoNote,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [copied, setCopied] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editableCode, setEditableCode] = useState<string>(code);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    setEditableCode(code);
  }, [code]);

  const renderDiagram = useCallback(async (chartCode: string) => {
    if (!chartCode || !chartCode.trim()) {
      setSvgHtml("");
      setError("No diagram markup provided.");
      return;
    }

    try {
      setError(null);
      const uniqueId = `mermaid-vis-${Math.random().toString(36).substring(2, 9)}`;
      const { svg } = await mermaid.render(uniqueId, chartCode);
      setSvgHtml(svg);
    } catch (err: any) {
      console.warn("Mermaid render warning:", err);
      // Clean up any mermaid-generated error elements left in the DOM
      const dangling = document.querySelectorAll(`[id^="d${"mermaid"}"]`);
      dangling.forEach((el) => el.remove());
      setError(err?.message || "Invalid Mermaid syntax. Click Edit to adjust.");
    }
  }, []);

  useEffect(() => {
    renderDiagram(code);
  }, [code, renderDiagram]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.2, 3.0));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.2, 0.4));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Primary click only
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(editableCode || code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const handleDownloadSvg = () => {
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = (title || "visualization").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    link.href = url;
    link.download = `${safeName}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = () => {
    if (!svgHtml) return;
    const img = new Image();
    const svgBlob = new Blob([svgHtml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Scale up for high DPI clarity
      const scale = 2;
      canvas.width = img.width * scale || 1200 * scale;
      canvas.height = img.height * scale || 800 * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#18181b";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        const safeName = (title || "visualization").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
        link.href = pngUrl;
        link.download = `${safeName}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleInsert = () => {
    if (onInsertIntoNote) {
      const snippet = `\`\`\`mermaid\n${(editableCode || code).trim()}\n\`\`\``;
      onInsertIntoNote(snippet);
    }
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      await renderDiagram(editableCode);
      if (onSaveCode) {
        await onSaveCode(editableCode);
      }
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save visualization:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const viewerContent = (
    <div
      className={`mermaid-viewer-root ${className || ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: isFullscreen ? "100vh" : "100%",
        flex: 1,
        minHeight: 0,
        width: "100%",
        backgroundColor: "var(--bg-panel-secondary, #19191b)",
        border: isFullscreen ? "none" : "1px solid var(--border-subtle, #2b2b32)",
        borderRadius: isFullscreen ? "0" : "8px",
        overflow: "hidden",
        position: isFullscreen ? "fixed" : "relative",
        top: isFullscreen ? 0 : "auto",
        left: isFullscreen ? 0 : "auto",
        zIndex: isFullscreen ? 1200 : "auto",
        ...style,
      }}
    >
      {/* Viewer Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          backgroundColor: "var(--bg-panel, #1c1c1f)",
          borderBottom: "1px solid var(--border-subtle, #2b2b32)",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {title && (
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-primary, #ededec)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "260px",
              }}
              title={title}
            >
              {title}
            </span>
          )}
          <span
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--accent-cyan, #38bdf8)",
              backgroundColor: "rgba(56, 189, 248, 0.12)",
              padding: "2px 6px",
              borderRadius: "4px",
              border: "1px solid rgba(56, 189, 248, 0.25)",
            }}
          >
            MERMAID
          </span>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {/* Zoom controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              backgroundColor: "var(--bg-card, #222226)",
              borderRadius: "5px",
              padding: "2px",
              marginRight: "4px",
            }}
          >
            <button
              onClick={handleZoomOut}
              className="obsidian-btn-subtle"
              style={{ padding: "4px", width: "24px", height: "24px", justifyContent: "center" }}
              title="Zoom Out"
            >
              -
            </button>
            <button
              onClick={handleResetView}
              className="obsidian-btn-subtle"
              style={{
                padding: "2px 6px",
                fontSize: "11px",
                fontFamily: "var(--font-mono, monospace)",
                height: "24px",
              }}
              title="Reset View"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              className="obsidian-btn-subtle"
              style={{ padding: "4px", width: "24px", height: "24px", justifyContent: "center" }}
              title="Zoom In"
            >
              +
            </button>
          </div>

          {/* Edit Code Button */}
          {onSaveCode && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="obsidian-btn-subtle"
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                color: isEditing ? "var(--accent-purple, #8b7bf5)" : "var(--text-secondary, #9c9ca3)",
                backgroundColor: isEditing ? "rgba(139, 123, 245, 0.12)" : "transparent",
              }}
              title={isEditing ? "Close Editor" : "Edit Diagram Code"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              {isEditing ? "Viewing" : "Edit"}
            </button>
          )}

          {/* Insert Into Note Button */}
          {onInsertIntoNote && (
            <button
              onClick={handleInsert}
              className="obsidian-btn-subtle"
              style={{ padding: "4px 8px", fontSize: "12px", color: "var(--tag-note-text, #6ee7b7)" }}
              title="Insert Diagram into Study Note"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              Insert
            </button>
          )}

          {/* Copy Code Button */}
          <button
            onClick={handleCopyCode}
            className="obsidian-btn-subtle"
            style={{ padding: "4px 8px", fontSize: "12px" }}
            title="Copy Mermaid Code"
          >
            {copied ? (
              <span style={{ color: "var(--success-green, #10b981)" }}>✓ Copied</span>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </>
            )}
          </button>

          {/* Download SVG */}
          <button
            onClick={handleDownloadSvg}
            className="obsidian-btn-subtle"
            style={{ padding: "4px 6px" }}
            title="Download SVG"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            SVG
          </button>

          {/* Download PNG */}
          <button
            onClick={handleDownloadPng}
            className="obsidian-btn-subtle"
            style={{ padding: "4px 6px" }}
            title="Download PNG"
          >
            PNG
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="obsidian-btn-subtle"
            style={{ padding: "4px" }}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", position: "relative", overflow: "hidden" }}>
        {/* Interactive Diagram Canvas */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            flex: 1,
            height: "100%",
            overflow: "hidden",
            position: "relative",
            cursor: isDragging ? "grabbing" : "grab",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--bg-canvas, #161618)",
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.05) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        >
          {error ? (
            <div
              style={{
                maxWidth: "460px",
                padding: "16px 20px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid var(--error-red-border, rgba(239, 68, 68, 0.35))",
                borderRadius: "8px",
                color: "var(--text-primary, #ededec)",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f87171", fontWeight: 600, marginBottom: "6px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Mermaid Syntax Error
              </div>
              <p style={{ fontSize: "12.5px", color: "var(--text-secondary, #9c9ca3)", margin: "0 0 12px 0", lineHeight: 1.4 }}>
                {error}
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setIsEditing(true)}
                  className="obsidian-btn"
                  style={{ fontSize: "12px", padding: "4px 10px" }}
                >
                  Edit Diagram Code
                </button>
                <button
                  onClick={() => renderDiagram(editableCode || code)}
                  className="obsidian-btn-subtle"
                  style={{ fontSize: "12px", padding: "4px 10px" }}
                >
                  Retry Render
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isDragging ? "none" : "transform 0.1s ease-out",
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
              }}
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          )}

          {/* Quick Help Hint */}
          <div
            style={{
              position: "absolute",
              bottom: "8px",
              left: "12px",
              fontSize: "11px",
              color: "var(--text-muted, #64646c)",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            Drag to pan • Use + / - to zoom
          </div>
        </div>

        {/* Live Edit Side Panel */}
        {isEditing && (
          <div
            style={{
              width: "360px",
              maxWidth: "45%",
              borderLeft: "1px solid var(--border-subtle, #2b2b32)",
              backgroundColor: "var(--bg-panel, #1c1c1f)",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              zIndex: 10,
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border-subtle, #2b2b32)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary, #ededec)" }}>
                Mermaid Code Editor
              </span>
              <button
                onClick={() => setIsEditing(false)}
                className="obsidian-btn-subtle"
                style={{ padding: "2px" }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, padding: "10px", display: "flex", flexDirection: "column" }}>
              <textarea
                value={editableCode}
                onChange={(e) => {
                  setEditableCode(e.target.value);
                  renderDiagram(e.target.value);
                }}
                spellCheck={false}
                style={{
                  flex: 1,
                  width: "100%",
                  backgroundColor: "var(--bg-input, #1f1f23)",
                  border: "1px solid var(--border-subtle, #2b2b32)",
                  borderRadius: "6px",
                  padding: "10px",
                  color: "var(--text-primary, #ededec)",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "12.5px",
                  lineHeight: 1.45,
                  resize: "none",
                  outline: "none",
                }}
                placeholder="flowchart TD\n  A[Start] --> B[Finish]"
              />
            </div>

            <div
              style={{
                padding: "10px 14px",
                borderTop: "1px solid var(--border-subtle, #2b2b32)",
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
              }}
            >
              <button
                onClick={() => {
                  setEditableCode(code);
                  renderDiagram(code);
                  setIsEditing(false);
                }}
                className="obsidian-btn-subtle"
                style={{ fontSize: "12.5px" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="obsidian-btn-primary"
                style={{ fontSize: "12.5px" }}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return viewerContent;
};
