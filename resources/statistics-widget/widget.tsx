import { useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import React from "react";

const propsSchema = z.object({
  totalTasks: z.number(),
  completedTasks: z.number(),
  pendingTasks: z.number(),
  completionRate: z.string(),
  byPriority: z.object({
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  overdueTasks: z.number(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Task statistics and overview",
  props: propsSchema,
};

interface StatBoxProps {
  label: string;
  value: number | string;
  color: string;
  isDark: boolean;
}

const StatBox: React.FC<StatBoxProps> = ({ label, value, color, isDark }) => (
  <div
    style={{
      background: isDark ? "#2d2d3d" : "#ffffff",
      border: `2px solid ${color}`,
      borderRadius: 8,
      padding: 16,
      textAlign: "center",
      flex: 1,
    }}
  >
    <div style={{ fontSize: 24, fontWeight: 700, color }}>
      {value}
    </div>
    <div
      style={{
        fontSize: 12,
        color: isDark ? "#9ca3af" : "#6b7280",
        marginTop: 4,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {label}
    </div>
  </div>
);

const StatisticsWidget: React.FC = () => {
  const { props, isPending, theme } = useWidget<z.infer<typeof propsSchema>>();
  const isDark = theme === "dark";

  if (isPending) return <div style={{ padding: 16 }}>Loading statistics...</div>;

  const {
    totalTasks,
    completedTasks,
    pendingTasks,
    completionRate,
    byPriority,
    overdueTasks,
  } = props;

  return (
    <div
      style={{
        background: isDark ? "#1a1a2e" : "#f9fafb",
        borderRadius: 12,
        padding: 24,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: isDark ? "#e5e7eb" : "#111827",
      }}
    >
      <h2 style={{ margin: "0 0 24px 0", fontSize: 24, fontWeight: 600 }}>
        Statistics
      </h2>

      {/* Main stats grid */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatBox
          label="Total"
          value={totalTasks}
          color="#3b82f6"
          isDark={isDark}
        />
        <StatBox
          label="Completed"
          value={completedTasks}
          color="#10b981"
          isDark={isDark}
        />
        <StatBox
          label="Pending"
          value={pendingTasks}
          color="#f59e0b"
          isDark={isDark}
        />
        <StatBox
          label="Completion"
          value={`${completionRate}%`}
          color="#8b5cf6"
          isDark={isDark}
        />
      </div>

      {/* Priority breakdown */}
      <div
        style={{
          background: isDark ? "#2d2d3d" : "#ffffff",
          border: `1px solid ${isDark ? "#3f3f4f" : "#e5e7eb"}`,
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 600 }}>
          Tasks by Priority
        </h3>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>
              {byPriority.high}
            </div>
            <div
              style={{
                fontSize: 12,
                color: isDark ? "#9ca3af" : "#6b7280",
                marginTop: 4,
              }}
            >
              High
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>
              {byPriority.medium}
            </div>
            <div
              style={{
                fontSize: 12,
                color: isDark ? "#9ca3af" : "#6b7280",
                marginTop: 4,
              }}
            >
              Medium
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>
              {byPriority.low}
            </div>
            <div
              style={{
                fontSize: 12,
                color: isDark ? "#9ca3af" : "#6b7280",
                marginTop: 4,
              }}
            >
              Low
            </div>
          </div>
        </div>
      </div>

      {/* Overdue alert */}
      {overdueTasks > 0 && (
        <div
          style={{
            background: isDark ? "#3d2626" : "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: 12,
            color: isDark ? "#fca5a5" : "#dc2626",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          ⚠️ {overdueTasks} overdue task{overdueTasks !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};

export default StatisticsWidget;
