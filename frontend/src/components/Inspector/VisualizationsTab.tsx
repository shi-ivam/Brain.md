import React, { useState, useEffect } from "react";
import { GraphNode, NodeVisualization, DifficultyLevel, VisualizationSuggestion } from "../../types";
import { HtmlSimulationViewer } from "../Visualizations/HtmlSimulationViewer";
import { MermaidViewer } from "../Visualizations/MermaidViewer";
import { VisualizationModal } from "../Visualizations/VisualizationModal";
import {
  generateNodeVisualizations,
  createNodeVisualization,
  updateNodeVisualization,
  deleteNodeVisualization,
  fetchVisualizationSuggestions,
} from "../../services/api";

interface VisualizationsTabProps {
  node: GraphNode;
  visualizations: NodeVisualization[];
  difficulty: DifficultyLevel;
  isModal?: boolean;
  onVisualizationAdded?: (vis: NodeVisualization) => void;
  onVisualizationUpdated?: (vis: NodeVisualization) => void;
  onVisualizationDeleted?: (visId: string) => void;
  onInsertIntoNote?: (snippet: string) => void;
}

export const VisualizationsTab: React.FC<VisualizationsTabProps> = ({
  node,
  visualizations,
  difficulty,
  isModal = false,
  onVisualizationAdded,
  onVisualizationUpdated,
  onVisualizationDeleted,
  onInsertIntoNote,
}) => {
  const [selectedVisId, setSelectedVisId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [generationStep, setGenerationStep] = useState<string>("");
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState<boolean>(false);

  // Dynamic Personalized Suggestions
  const [suggestions, setSuggestions] = useState<VisualizationSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);

  // Load suggestions when node changes
  useEffect(() => {
    let active = true;
    setLoadingSuggestions(true);
    fetchVisualizationSuggestions(node.id)
      .then((items) => {
        if (active) setSuggestions(items);
      })
      .catch((err) => {
        console.error("Failed to load visualization suggestions:", err);
      })
      .finally(() => {
        if (active) setLoadingSuggestions(false);
      });
    return () => {
      active = false;
    };
  }, [node.id]);

  // Default selection to first visualization if available
  useEffect(() => {
    if (visualizations.length > 0) {
      if (!selectedVisId || !visualizations.some((v) => v.id === selectedVisId)) {
        setSelectedVisId(visualizations[0].id);
      }
    } else {
      setSelectedVisId(null);
    }
  }, [visualizations, selectedVisId]);

  const activeVis = visualizations.find((v) => v.id === selectedVisId) || visualizations[0] || null;

  const handleGenerate = async (visType: string = "simulation", promptText?: string) => {
    setIsGenerating(true);
    setErrorToast(null);
    setGenerationStep("Analyzing physical laws and mathematical principles...");

    const stepTimer1 = setTimeout(() => {
      setGenerationStep("Synthesizing interactive HTML5 Canvas simulation...");
    }, 1500);

    const stepTimer2 = setTimeout(() => {
      setGenerationStep("Injecting Obsidian design tokens and dynamic controls...");
    }, 3200);

    try {
      const results = await generateNodeVisualizations(node.id, {
        visualization_type: visType,
        custom_prompt: promptText || customPrompt || undefined,
        difficulty: difficulty || node.difficulty || "intermediate",
        force_refresh: true,
      });

      if (results && results.length > 0) {
        if (onVisualizationAdded) {
          results.forEach((v) => onVisualizationAdded(v));
        }
        setSelectedVisId(results[0].id);
        setShowAddForm(false);
        setCustomPrompt("");
        setSuccessToast("Simulation generated successfully");
        setTimeout(() => setSuccessToast(null), 2500);
      }
    } catch (err: any) {
      console.error("Failed to generate visualization simulation:", err);
      setErrorToast(err?.message || "Failed to generate visualization. Please try again.");
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsGenerating(false);
      setGenerationStep("");
    }
  };

  const handleCreateCustom = async () => {
    try {
      const defaultTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${node.title} Custom Simulation</title>
<style>
  :root {
    --bg-primary: #161618;
    --bg-card: #222226;
    --border-subtle: #2b2b32;
    --text-primary: #ededec;
    --accent: #8b7bf5;
    --font-sans: -apple-system, BlinkMacSystemFont, sans-serif;
  }
  body { background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); margin: 0; padding: 20px; text-align: center; }
  canvas { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px; margin-top: 15px; }
</style>
</head>
<body>
  <h2>${node.title} Custom Simulation</h2>
  <canvas id="canvas" width="500" height="300"></canvas>
  <script>
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    let angle = 0;
    function draw() {
      ctx.fillStyle = "#161618";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#8b7bf5";
      ctx.beginPath();
      ctx.arc(canvas.width/2 + Math.cos(angle)*80, canvas.height/2 + Math.sin(angle)*80, 16, 0, Math.PI*2);
      ctx.fill();
      angle += 0.04;
      requestAnimationFrame(draw);
    }
    draw();
  </script>
</body>
</html>`;

      const newVis = await createNodeVisualization(node.id, {
        title: `${node.title}: Custom Simulation`,
        visualization_type: "simulation",
        format: "html",
        code: defaultTemplate,
        description: "Custom user-authored interactive HTML5 simulation",
        explanation: "Handcrafted simulation environment with canvas animation loop.",
      });
      if (onVisualizationAdded) onVisualizationAdded(newVis);
      setSelectedVisId(newVis.id);
      setShowAddForm(false);
    } catch (err: any) {
      console.error("Failed to create custom simulation:", err);
      setErrorToast(err?.message || "Failed to create visualization");
    }
  };

  const handleSaveCode = async (newCode: string) => {
    if (!activeVis) return;
    try {
      const updated = await updateNodeVisualization(activeVis.id, {
        code: newCode,
      });
      if (onVisualizationUpdated) onVisualizationUpdated(updated);
    } catch (err: any) {
      console.error("Failed to update visualization code:", err);
    }
  };

  const handleDeleteActive = async () => {
    if (!activeVis) return;
    if (!window.confirm(`Delete visualization "${activeVis.title}"?`)) return;
    try {
      await deleteNodeVisualization(activeVis.id);
      if (onVisualizationDeleted) onVisualizationDeleted(activeVis.id);
      const remaining = visualizations.filter((v) => v.id !== activeVis.id);
      if (remaining.length > 0) {
        setSelectedVisId(remaining[0].id);
      } else {
        setSelectedVisId(null);
      }
    } catch (err: any) {
      console.error("Failed to delete visualization:", err);
    }
  };

  const handleInsertIntoNote = () => {
    if (!onInsertIntoNote || !activeVis) return;
    const isHtml = activeVis.format === "html" || activeVis.code.includes("<!DOCTYPE html>");
    const snippet = isHtml
      ? `

### Interactive Simulation: ${activeVis.title}

*${activeVis.description || "Interactive dynamics visualizer"}*

\`\`\`html
${activeVis.code}
\`\`\`
`
      : `

### Visualization: ${activeVis.title}

\`\`\`mermaid
${activeVis.code}
\`\`\`
`;
    onInsertIntoNote(snippet);
    setSuccessToast("Inserted into Study Note");
    setTimeout(() => setSuccessToast(null), 2000);
  };

  const isHtmlVis = (vis: NodeVisualization | null) => {
    if (!vis) return false;
    return vis.format === "html" || vis.code.includes("<!DOCTYPE html>") || vis.code.includes("<canvas");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        flex: 1,
        gap: "10px",
        overflowY: isModal && !showAddForm ? "hidden" : "auto",
        paddingRight: isModal ? "0" : "6px",
        position: "relative",
      }}
    >
      {/* Toast Notifications */}
      {errorToast && (
        <div
          style={{
            padding: "8px 12px",
            backgroundColor: "var(--error-red-subtle, rgba(239, 68, 68, 0.15))",
            border: "1px solid var(--error-red-border, rgba(239, 68, 68, 0.35))",
            color: "#f87171",
            borderRadius: "6px",
            fontSize: "12.5px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{errorToast}</span>
          <button
            onClick={() => setErrorToast(null)}
            className="obsidian-btn-subtle"
            style={{ padding: "2px", color: "#f87171" }}
          >
            ✕
          </button>
        </div>
      )}

      {successToast && (
        <div
          style={{
            padding: "8px 12px",
            backgroundColor: "rgba(16, 185, 129, 0.12)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            color: "#34d399",
            borderRadius: "6px",
            fontSize: "12.5px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{successToast}</span>
          <button
            onClick={() => setSuccessToast(null)}
            className="obsidian-btn-subtle"
            style={{ padding: "2px", color: "#34d399" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header & Visualizations Selector Tabs */}
      {visualizations.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
            paddingBottom: "8px",
            borderBottom: "1px solid var(--border-subtle, #2b2b32)",
            flexShrink: 0,
          }}
        >
          {/* Pills for each saved visualization */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {visualizations.map((v) => {
              const isSelected = activeVis?.id === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedVisId(v.id);
                    setShowAddForm(false);
                  }}
                  style={{
                    padding: "4px 11px",
                    borderRadius: "14px",
                    fontSize: "12px",
                    fontFamily: "var(--font-sans, sans-serif)",
                    fontWeight: isSelected ? 600 : 400,
                    cursor: "pointer",
                    border: isSelected
                      ? "1px solid var(--accent-purple, #8b7bf5)"
                      : "1px solid var(--border-subtle, #2b2b32)",
                    backgroundColor: isSelected
                      ? "rgba(139, 123, 245, 0.18)"
                      : "var(--bg-input, #1f1f23)",
                    color: isSelected
                      ? "var(--text-primary, #ededec)"
                      : "var(--text-secondary, #9c9ca3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>{v.title}</span>
                </button>
              );
            })}

            {/* + New Simulation Button */}
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="obsidian-btn"
              style={{
                fontSize: "12px",
                padding: "3px 9px",
                borderRadius: "14px",
                color: showAddForm ? "var(--accent-purple, #8b7bf5)" : "var(--text-muted, #64646c)",
              }}
              title="Add or generate another simulation"
            >
              + New
            </button>
          </div>

          {/* Quick Actions for active simulation */}
          {activeVis && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {onInsertIntoNote && (
                <button
                  onClick={handleInsertIntoNote}
                  className="obsidian-btn"
                  style={{ fontSize: "11.5px", padding: "4px 10px" }}
                  title="Insert this simulation into the study note"
                >
                  Insert into Note
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Generation Bar / Suggestion Card (Shown when empty or when user clicks + New) */}
      {(visualizations.length === 0 || showAddForm) && (
        <div
          style={{
            backgroundColor: "var(--bg-card, #222226)",
            border: "1px solid var(--border-subtle, #2b2b32)",
            borderRadius: "8px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "14.5px", fontWeight: 600, color: "var(--text-primary, #ededec)" }}>
              {visualizations.length === 0
                ? "Generate Interactive Simulation"
                : "Add New Simulation"}
            </h3>
            <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-secondary, #9c9ca3)", lineHeight: 1.45 }}>
              Generate fully functional, animated HTML5 canvas simulations with moving parts, dynamic parameters, and Obsidian design tokens for <strong>{node.title}</strong>.
            </p>
          </div>

          {/* Node-Personalized Suggestions (Strictly Zero Emojis) */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono, monospace)", color: "var(--text-muted, #64646c)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                PERSONALIZED SIMULATION TOPICS:
              </span>
              {loadingSuggestions && (
                <span style={{ fontSize: "11px", color: "var(--accent-cyan, #38bdf8)", fontFamily: "var(--font-mono, monospace)" }}>
                  Analyzing node context...
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {suggestions.map((sug) => (
                <div
                  key={sug.id}
                  onClick={() => !isGenerating && handleGenerate(sug.category, sug.prompt)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    backgroundColor: "var(--bg-input, #1f1f23)",
                    border: "1px solid var(--border-subtle, #2b2b32)",
                    cursor: isGenerating ? "not-allowed" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent-purple, #8b7bf5)";
                    e.currentTarget.style.backgroundColor = "rgba(139, 123, 245, 0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-subtle, #2b2b32)";
                    e.currentTarget.style.backgroundColor = "var(--bg-input, #1f1f23)";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary, #ededec)" }}>
                      {sug.title}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        fontFamily: "var(--font-mono, monospace)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        backgroundColor: "rgba(56, 189, 248, 0.1)",
                        color: "var(--accent-cyan, #38bdf8)",
                        border: "1px solid rgba(56, 189, 248, 0.25)",
                      }}
                    >
                      {sug.category.replace("_", " ")}
                    </span>
                  </div>
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted, #64646c)", lineHeight: 1.4 }}>
                    {sug.description}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Simulation Focus Prompt */}
          <div>
            <label style={{ display: "block", fontSize: "11px", fontFamily: "var(--font-mono, monospace)", color: "var(--text-muted, #64646c)", marginBottom: "5px" }}>
              OR CUSTOM SIMULATION SPECIFICATION:
            </label>
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. Simulate 3D rotation of state vector on Bloch sphere with phase angle sliders..."
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "4px",
                backgroundColor: "var(--bg-input, #1f1f23)",
                border: "1px solid var(--border-subtle, #2b2b32)",
                color: "var(--text-primary, #ededec)",
                fontSize: "13px",
                fontFamily: "var(--font-sans, sans-serif)",
                outline: "none",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isGenerating && customPrompt.trim()) {
                  handleGenerate("simulation", customPrompt.trim());
                }
              }}
            />
          </div>

          {/* Generation Progress Status */}
          {isGenerating && (
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: "rgba(139, 123, 245, 0.08)",
                border: "1px solid rgba(139, 123, 245, 0.2)",
                borderRadius: "6px",
                fontSize: "12px",
                color: "var(--accent-purple, #8b7bf5)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
              </svg>
              <span>{generationStep || "Compiling simulation code..."}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={handleCreateCustom}
              className="obsidian-btn-subtle"
              style={{ fontSize: "12px", padding: "6px 10px" }}
              title="Create an empty HTML5 simulation template to code by hand"
            >
              Author Custom Simulation
            </button>

            <div style={{ display: "flex", gap: "8px" }}>
              {showAddForm && (
                <button
                  onClick={() => setShowAddForm(false)}
                  className="obsidian-btn-subtle"
                  style={{ fontSize: "12px" }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => handleGenerate("simulation", customPrompt || undefined)}
                disabled={isGenerating}
                className="obsidian-btn-primary"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  padding: "7px 16px",
                }}
              >
                <span>Generate Simulation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Active Visualization Display */}
      {activeVis && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: isModal ? 0 : "440px",
            height: "100%",
            gap: "8px",
          }}
        >
          {isHtmlVis(activeVis) ? (
            <HtmlSimulationViewer
              code={activeVis.code}
              title={activeVis.title}
              description={activeVis.description}
              explanation={activeVis.explanation}
              onSaveCode={handleSaveCode}
              onDelete={handleDeleteActive}
              onExpand={isModal ? undefined : () => setIsFullscreenModalOpen(true)}
              isModal={isModal}
            />
          ) : (
            <MermaidViewer
              code={activeVis.code}
              title={activeVis.title}
              onSaveCode={handleSaveCode}
              onInsertIntoNote={onInsertIntoNote}
              style={{ flex: 1, minHeight: 0, height: "100%" }}
            />
          )}
        </div>
      )}

      {/* Fullscreen Interactive Modal */}
      {isFullscreenModalOpen && activeVis && (
        <VisualizationModal
          node={node}
          difficulty={difficulty}
          isOpen={isFullscreenModalOpen}
          onClose={() => setIsFullscreenModalOpen(false)}
          visualizations={visualizations}
          onVisualizationAdded={onVisualizationAdded}
          onVisualizationUpdated={onVisualizationUpdated}
          onVisualizationDeleted={onVisualizationDeleted}
          onInsertIntoNote={onInsertIntoNote}
        />
      )}
    </div>
  );
};
