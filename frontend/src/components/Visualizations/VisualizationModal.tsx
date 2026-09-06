import React, { useState, useEffect } from "react";
import { GraphNode, NodeVisualization, DifficultyLevel } from "../../types";
import { VisualizationsTab } from "../Inspector/VisualizationsTab";
import { fetchNodeVisualizations } from "../../services/api";

interface VisualizationModalProps {
  node: GraphNode | null;
  difficulty: DifficultyLevel;
  isOpen: boolean;
  onClose: () => void;
  visualizations?: NodeVisualization[];
  onVisualizationAdded?: (vis: NodeVisualization) => void;
  onVisualizationUpdated?: (vis: NodeVisualization) => void;
  onVisualizationDeleted?: (visId: string) => void;
  onInsertIntoNote?: (snippet: string) => void;
}

export const VisualizationModal: React.FC<VisualizationModalProps> = ({
  node,
  difficulty,
  isOpen,
  onClose,
  visualizations: propVisualizations,
  onVisualizationAdded,
  onVisualizationUpdated,
  onVisualizationDeleted,
  onInsertIntoNote,
}) => {
  const [localVis, setLocalVis] = useState<NodeVisualization[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !node) return;
    if (propVisualizations && propVisualizations.length > 0) {
      setLocalVis(propVisualizations.filter((v) => v.node_id === node.id));
    } else {
      setIsLoading(true);
      fetchNodeVisualizations(node.id)
        .then((items) => setLocalVis(items))
        .catch((err) => console.error("Failed to load node visualizations:", err))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, node, propVisualizations]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !node) return null;

  const currentList = (propVisualizations && propVisualizations.filter((v) => v.node_id === node.id)) || localVis;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "var(--bg-overlay, rgba(10, 10, 12, 0.75))",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "24px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "1200px",
          maxWidth: "96vw",
          height: "92vh",
          backgroundColor: "var(--bg-panel, #1c1c1f)",
          border: "1px solid var(--border-active, #3e3e4a)",
          borderRadius: "12px",
          boxShadow: "var(--shadow-popover, 0 16px 40px rgba(0, 0, 0, 0.75))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-subtle, #2b2b32)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "var(--bg-panel-secondary, #19191b)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple, #8b7bf5)" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <div>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text-primary, #ededec)" }}>
                {node.title} — Simulations & Visualizations
              </h2>
              <span style={{ fontSize: "11px", color: "var(--text-muted, #64646c)", fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.04em" }}>
                INTERACTIVE SIMULATIONS & VISUAL MODELS
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="obsidian-btn-subtle"
            style={{ padding: "6px" }}
            title="Close (Esc)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, minHeight: 0, padding: "16px 20px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted, #64646c)" }}>
              Loading visualizations...
            </div>
          ) : (
            <VisualizationsTab
              node={node}
              visualizations={currentList}
              difficulty={difficulty}
              isModal={true}
              onVisualizationAdded={(vis) => {
                setLocalVis((prev) => [...prev, vis]);
                if (onVisualizationAdded) onVisualizationAdded(vis);
              }}
              onVisualizationUpdated={(vis) => {
                setLocalVis((prev) => prev.map((v) => (v.id === vis.id ? vis : v)));
                if (onVisualizationUpdated) onVisualizationUpdated(vis);
              }}
              onVisualizationDeleted={(visId) => {
                setLocalVis((prev) => prev.filter((v) => v.id !== visId));
                if (onVisualizationDeleted) onVisualizationDeleted(visId);
              }}
              onInsertIntoNote={onInsertIntoNote}
            />
          )}
        </div>
      </div>
    </div>
  );
};
