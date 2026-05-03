# MCP Task Manager - Guia de Desenvolvimento

## 📋 Visão Geral

Este projeto demonstra um servidor MCP completo usando o framework mcp-use, incluindo:

- **Server** - Backend com ferramentas
- **Widgets** - Frontend React customizado
- **Type Safety** - TypeScript + Zod
- **Inspector** - Ferramenta de debug integrada

## 🏗️ Arquitetura

### Camada de Servidor (`src/index.ts`)

O servidor implementa 5 ferramentas principais:

1. **create_task** - Input com validação, output com confirmação
2. **list_tasks** - Input com filtros, output com widget React
3. **update_task** - Input com campos opcionais, output com confirmação
4. **delete_task** - Input com ID, output com status
5. **get_statistics** - Sem input, output com dashboard widget

### Camada de Widgets

Dois widgets React demonstram diferentes padrões:

**TaskListWidget** (`resources/task-widget/widget.tsx`)
- Props tipadas com Zod
- Responsivo (dark/light mode)
- Renderização de lista com ícones e cores
- Indicadores visuais de status

**StatisticsWidget** (`resources/statistics-widget/widget.tsx`)
- Cards com cores codificadas
- Breakdown por prioridade
- Alerta de tarefas atrasadas
- Layout grid responsivo

## 🔄 Data Flow

```
Usuário → MCP Client (Claude/ChatGPT)
         ↓
    Prompt Processing
         ↓
    Server Tool Call
         ↓
    src/index.ts (validação + lógica)
         ↓
    Retorna text() ou widget()
         ↓
    widget() → React Component
    ↓
    resources/*/widget.tsx
    ↓
    Renderização Visual
    ↓
    Exibição para Usuário
```

## 💾 State Management

Atualmente usa `Map` em memória:

```typescript
const tasks: Map<string, Task> = new Map();
```

### Para Persistência Real

**Opção 1: SQLite (recomendado para dev)**
```typescript
import Database from "better-sqlite3";
const db = new Database("tasks.db");
```

**Opção 2: PostgreSQL (produção)**
```typescript
import { Pool } from "pg";
const pool = new Pool();
```

**Opção 3: Firebase**
```typescript
import { initializeApp } from "firebase/app";
```

## 🎨 Padrões de Widget

### Hook useWidget

```typescript
const { props, isPending, theme } = useWidget<PropsType>();
```

- `props` - Dados passados do servidor
- `isPending` - Loading state durante processamento
- `theme` - 'light' ou 'dark' do cliente

### WidgetMetadata

```typescript
export const widgetMetadata: WidgetMetadata = {
  description: "...",
  props: z.object({...})
};
```

Requerido para auto-discovery e type safety.

### Styling Best Practices

1. Detectar tema: `const isDark = theme === "dark"`
2. Usar cores CSS variáveis quando possível
3. Manter design responsivo
4. Testar em Claude + ChatGPT

## 🧪 Desenvolvimento Local

### 1. Setup
```bash
npm install
npm run build
```

### 2. Rodar Servidor
```bash
npm run dev
```

Servidor estará em `http://localhost:3000`

### 3. Testar no Inspector
```bash
npm run inspector
```

Ou abra `http://localhost:3000/inspector` no browser

### 4. Fazer Mudanças

**Servidor:**
```bash
# Editar src/index.ts
# Servidor reloada automaticamente com --dev
```

**Widgets:**
```bash
# Editar resources/*/widget.tsx
# Reloader detecta mudanças em Vite
```

## 🔍 Debugging

### Log no servidor
```typescript
console.log("Debug info:", variable);
```

### Ver requests no Inspector
- Abra http://localhost:3000/inspector
- Veja toda comunicação MCP
- Teste ferramentas interativamente

### Types VS Zod

```typescript
// ✅ Bom - Runtime validation
schema: z.object({
  title: z.string(),
  priority: z.enum(["low", "medium", "high"])
})

// ❌ Ruim - Apenas type, sem validação
type TaskInput = {
  title: string;
  priority: "low" | "medium" | "high";
}
```

## 📦 Extensões Possíveis

### Adicionar Nova Ferramenta

```typescript
server.tool(
  {
    name: "search_tasks",
    description: "Search tasks by keyword",
    schema: z.object({
      query: z.string(),
    }),
  },
  async ({ query }) => {
    const results = Array.from(tasks.values()).filter(t =>
      t.title.toLowerCase().includes(query.toLowerCase())
    );
    return widget({
      props: { tasks: results },
      message: `Found ${results.length} tasks`
    });
  }
);
```

### Adicionar Novo Widget

```
1. mkdir resources/search-widget
2. Criar resources/search-widget/widget.tsx
3. Referenciar em tool com widget: "search-widget"
```

### Integração com APIs Externas

```typescript
import fetch from "node-fetch";

const response = await fetch("https://api.example.com/...");
const data = await response.json();
return text(JSON.stringify(data));
```

## 🚀 Deployment

### Manufact Cloud
```bash
npm install -g @mcp-use/cli
mcp-use login
mcp-use deploy
```

### Vercel
```bash
vercel --prod
```

### Railway
```bash
railway up
```

### Docker
```bash
docker build -t mcp-task-manager .
docker push your-registry/mcp-task-manager
```

## 📚 Recursos

- [mcp-use TypeScript Docs](https://mcp-use.com/docs/typescript/)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [React useWidget Hook](https://mcp-use.com/docs/typescript/server/ui-widgets)
- [Zod Documentation](https://zod.dev/)

## ✅ Checklist para Novos Projetos MCP

- [ ] Setup base com mcp-use
- [ ] Definir tools com Zod schemas
- [ ] Implementar lógica das tools
- [ ] Criar widgets React
- [ ] Testar no Inspector
- [ ] Adicionar documentação
- [ ] Preparar para deploy
- [ ] Publicar repositório

---

**Desenvolvido com padrões modernos de MCP e mcp-use**
