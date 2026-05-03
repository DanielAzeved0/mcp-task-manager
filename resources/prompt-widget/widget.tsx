import { useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import React, { useState } from "react";

const propsSchema = z.object({
  apiEndpoint: z.string().optional(),
  defaultBackend: z.enum(["auto", "ollama", "openai"]).optional(),
  defaultStrictMode: z.boolean().optional(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Frontend interface for converting natural language prompts to structured Prompt Specifications",
  props: propsSchema,
};

interface ApiResponse {
  prompt_spec: any;
  status: string;
  ai_backend: {
    provider: string;
    model: string;
    fallback_used: boolean;
  };
  performance: {
    execution_time_ms: number;
    tokens_used: number;
    model_used: string;
  };
  json_validation?: {
    is_valid: boolean;
    attempts: number;
    auto_fixed: boolean;
  };
}

const PromptWidget: React.FC = () => {
  const { props, isPending, theme } = useWidget<z.infer<typeof propsSchema>>();
  const isDark = theme === "dark";

  const [prompt, setPrompt] = useState("");
  const [preferredBackend, setPreferredBackend] = useState<"auto" | "ollama" | "openai">(
    props?.defaultBackend || "auto"
  );
  const [strictMode, setStrictMode] = useState(props?.defaultStrictMode || false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiEndpoint = props?.apiEndpoint || "http://localhost:3000/prompt-to-spec";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate that prompt is not empty
    if (!prompt.trim()) {
      setError("Please enter a prompt before submitting.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          preferred_backend: preferredBackend,
          strict_mode: strictMode,
          user_id: "user_001",
          team_id: "team_001",
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data: ApiResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "#10b981";
      case "improved":
        return "#f59e0b";
      case "failed":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  if (isPending) {
    return (
      <div style={{
        padding: 20,
        textAlign: "center",
        color: isDark ? "#9ca3af" : "#6b7280"
      }}>
        Loading Prompt Widget...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      background: isDark ? "#111827" : "#f9fafb",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 800,
        background: isDark ? "#1f2937" : "#ffffff",
        borderRadius: 12,
        padding: 32,
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
      }}>
        <h1 style={{
          margin: "0 0 24px 0",
          color: isDark ? "#ffffff" : "#1f2937",
          fontSize: 28,
          fontWeight: 700,
          textAlign: "center",
        }}>
          Prompt Specification Generator
        </h1>

        <p style={{
          margin: "0 0 32px 0",
          color: isDark ? "#9ca3af" : "#6b7280",
          fontSize: 16,
          textAlign: "center",
          lineHeight: 1.5,
        }}>
          Convert natural language prompts into structured Prompt Specifications using AI
        </p>

<form onSubmit={handleSubmit} style={{ marginBottom: 40 }}>
          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: "block",
              marginBottom: 12,
              fontWeight: 600,
              fontSize: 16,
              color: isDark ? "#ffffff" : "#374151",
            }}>
              Enter your prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want the AI to do..."
              style={{
                width: "100%",
                minHeight: 120,
                padding: 16,
                border: `2px solid ${isDark ? "#374151" : "#d1d5db"}`,
                borderRadius: 8,
                background: isDark ? "#374151" : "#ffffff",
                color: isDark ? "#ffffff" : "#1f2937",
                fontSize: 16,
                resize: "vertical",
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
              onBlur={(e) => e.target.style.borderColor = isDark ? "#374151" : "#d1d5db"}
            />
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 16,
            marginBottom: 32,
            alignItems: "end",
          }}>
            <div>
              <label style={{
                display: "block",
                marginBottom: 8,
                fontWeight: 600,
                fontSize: 14,
                color: isDark ? "#ffffff" : "#374151",
              }}>
                AI Backend
              </label>
              <select
                value={preferredBackend}
                onChange={(e) => setPreferredBackend(e.target.value as "auto" | "ollama" | "openai")}
                style={{
                  width: "100%",
                  padding: 12,
                  border: `2px solid ${isDark ? "#374151" : "#d1d5db"}`,
                  borderRadius: 8,
                  background: isDark ? "#374151" : "#ffffff",
                  color: isDark ? "#ffffff" : "#1f2937",
                  fontSize: 14,
                  outline: "none",
                }}
              >
                <option value="auto">Auto (Recommended)</option>
                <option value="ollama">Ollama (Local)</option>
                <option value="openai">OpenAI (Cloud)</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{
                fontWeight: 600,
                fontSize: 14,
                color: isDark ? "#ffffff" : "#374151",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <input
                  type="checkbox"
                  checked={strictMode}
                  onChange={(e) => setStrictMode(e.target.checked)}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: "#3b82f6",
                  }}
                />
                Strict Mode
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: "12px 24px",
                background: isLoading ? "#6b7280" : "#3b82f6",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: isLoading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 140,
                justifyContent: "center",
              }}
            >
              {isLoading ? (
                <>
                  <div style={{
                    width: 16,
                    height: 16,
                    border: "2px solid #ffffff",
                    borderTop: "2px solid transparent",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }} />
                  Processing...
                </>
              ) : (
                "Generate Spec"
              )}
            </button>
          </div>
        </form>

        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>

        {error && (
          <div style={{
            padding: 20,
            background: "#fef2f2",
            border: "2px solid #ef4444",
            borderRadius: 8,
            color: "#dc2626",
            marginBottom: 24,
            textAlign: "center",
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}>
              <h2 style={{
                margin: 0,
                color: isDark ? "#ffffff" : "#1f2937",
                fontSize: 20,
                fontWeight: 600,
              }}>
                Response
              </h2>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{
                  padding: "4px 12px",
                  background: getStatusColor(result.status),
                  color: "#ffffff",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}>
                  {result.status}
                </span>
              </div>
            </div>

            <div style={{
              background: isDark ? "#111827" : "#f8fafc",
              border: `2px solid ${isDark ? "#374151" : "#e2e8f0"}`,
              borderRadius: 8,
              padding: 24,
              marginBottom: 16,
            }}>
              <pre style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.5,
                color: isDark ? "#e5e7eb" : "#1f2937",
                overflow: "auto",
                fontFamily: "Monaco, 'Bitstream Vera Sans Mono', 'Lucida Console', Terminal, monospace",
              }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
            }}>
              <div style={{
                padding: 16,
                background: isDark ? "#374151" : "#ffffff",
                border: `2px solid ${isDark ? "#4b5563" : "#e5e7eb"}`,
                borderRadius: 8,
              }}>
                <h3 style={{
                  margin: "0 0 8px 0",
                  fontSize: 14,
                  fontWeight: 600,
                  color: isDark ? "#9ca3af" : "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}>
                  AI Backend
                </h3>
                <p style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 500,
                  color: isDark ? "#ffffff" : "#1f2937",
                }}>
                  {result.ai_backend.provider} ({result.ai_backend.model})
                  {result.ai_backend.fallback_used && (
                    <span style={{ color: "#f59e0b", marginLeft: 8 }}>
                      ⚠️ Fallback
                    </span>
                  )}
                </p>
              </div>

              <div style={{
                padding: 16,
                background: isDark ? "#374151" : "#ffffff",
                border: `2px solid ${isDark ? "#4b5563" : "#e5e7eb"}`,
                borderRadius: 8,
              }}>
                <h3 style={{
                  margin: "0 0 8px 0",
                  fontSize: 14,
                  fontWeight: 600,
                  color: isDark ? "#9ca3af" : "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}>
                  Performance
                </h3>
                <p style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 500,
                  color: isDark ? "#ffffff" : "#1f2937",
                }}>
                  {result.performance.execution_time_ms}ms • {result.performance.tokens_used} tokens
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptWidget;