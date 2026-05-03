import { useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import React from "react";

const propsSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      completed: z.boolean(),
      priority: z.enum(["low", "medium", "high"]),
      createdAt: z.coerce.date(),
      dueDate: z.coerce.date().optional(),
    })
  ),
  totalTasks: z.number(),
  completedTasks: z.number(),
  filter: z.string(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Interactive task list widget",
  props: propsSchema,
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "high":
      return "#ef4444";
    case "medium":
      return "#f59e0b";
    case "low":
      return "#10b981";
    default:
      return "#6b7280";
  }
};

const TaskListWidget: React.FC = () => {
  const { props, isPending, theme } = useWidget<z.infer<typeof propsSchema>>();
  const isDark = theme === "dark";

  if (isPending) return <div style={{ padding: 16 }}>Loading tasks...</div>;

  const { tasks, totalTasks, completedTasks, filter } = props;

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
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 24, fontWeight: 600 }}>
          Task Manager
        </h2>
        <p style={{ margin: 0, color: isDark ? "#9ca3af" : "#6b7280", fontSize: 14 }}>
          {completedTasks} of {totalTasks} completed • {filter}
        </p>
      </div>

      {tasks.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            background: isDark ? "#2d2d3d" : "#f3f4f6",
            borderRadius: 8,
            color: isDark ? "#9ca3af" : "#6b7280",
          }}
        >
          <p>No tasks found</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: 16,
                background: isDark ? "#2d2d3d" : "#ffffff",
                border: `1px solid ${isDark ? "#3f3f4f" : "#e5e7eb"}`,
                borderRadius: 8,
                opacity: task.completed ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  background: task.completed ? "#10b981" : "transparent",
                  border: `2px solid ${task.completed ? "#10b981" : "#d1d5db"}`,
                  marginTop: 2,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                    textDecoration: task.completed ? "line-through" : "none",
                  }}
                >
                  {task.title}
                </h3>
                {task.description && (
                  <p
                    style={{
                      margin: "4px 0 0 0",
                      fontSize: 13,
                      color: isDark ? "#9ca3af" : "#6b7280",
                    }}
                  >
                    {task.description}
                  </p>
                )}
                {task.dueDate && (
                  <p
                    style={{
                      margin: "4px 0 0 0",
                      fontSize: 12,
                      color: isDark ? "#6b7280" : "#9ca3af",
                    }}
                  >
                    Due: {new Date(task.dueDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div
                style={{
                  padding: "2px 10px",
                  background: getPriorityColor(task.priority),
                  color: "white",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}
              >
                {task.priority}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskListWidget;
