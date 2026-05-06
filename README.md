# MCP Task Manager 📋

Um servidor MCP totalmente funcional para gerenciamento de tarefas com widgets interativos. Desenvolvido como exemplo dos padrões do [mcp-use](https://github.com/mcp-use/mcp-use).

## 🎯 Características

- **Ferramentas Completas**
  - ✅ Criar, atualizar e deletar tarefas
  - 📊 Listar tarefas com filtros
  - 📈 Estatísticas e overview

- **Widgets Interativos**
  - 📝 Task List Widget com tema escuro/claro
  - 📊 Statistics Dashboard
  - 🤖 Prompt Generator Widget (Novo!)
  - ⚡ Atualizações em tempo real

- **Padrões Modernos**
  - TypeScript com type safety
  - Zod para validação de schema
  - Widgets React customizados
  - Inspector integrado para debug

## 🚀 Quick Start

### Instalação

```bash
cd mcp-task-manager
npm install
```

### Configuração da IA

Este projeto suporta uma arquitetura hibrida com Gemini e Llama local:

#### Opção 1: Gemini (Cloud)
```bash
cp .env.example .env
# Edite .env e adicione sua GEMINI_API_KEY
```

#### Opção 2: Llama via Ollama (Local e Gratuito)
```bash
# 1. Instale Ollama: https://ollama.ai/download
# 2. Baixe um modelo: ollama pull llama3.2
# 3. Configure o .env:
cp .env.example .env
# Edite .env:
USE_OLLAMA=true
OLLAMA_MODEL=llama3.2
```

### Desenvolvimento

```bash
npm run dev
```

O servidor iniciará em `http://localhost:3000`

Acesse o Inspector em: `http://localhost:3000/inspector`

### API Endpoint

**POST /prompt-to-spec**

Parâmetros de entrada:
- `prompt`: Texto do prompt a ser processado
- `context`: Contexto adicional (opcional)
- `strict_mode`: Modo rigoroso para validação (opcional)
- `min_quality_score`: Pontuação mínima aceitável (opcional)
- `use_cache`: Habilitar cache (opcional)
- `preferred_backend`: Backend preferido: "auto", "llama", "ollama", ou "gemini" (opcional)
- `user_id`: ID do usuário (obrigatório)
- `team_id`: ID do time (opcional)

#### Exemplos de Uso

```bash
# Usar Ollama (local)
curl -X POST http://localhost:3000/prompt-to-spec \
-H "Content-Type: application/json" \
-d '{
  "prompt": "crie uma função para somar dois números",
  "preferred_backend": "ollama",
  "user_id": "user123"
}'

# Usar Gemini
curl -X POST http://localhost:3000/prompt-to-spec \
-H "Content-Type: application/json" \
-d '{
  "prompt": "crie uma função para somar dois números",
  "preferred_backend": "gemini",
  "user_id": "user123"
}'

# Auto (escolhe automaticamente)
curl -X POST http://localhost:3000/prompt-to-spec \
-H "Content-Type: application/json" \
-d '{
  "prompt": "crie uma função para somar dois números",
  "preferred_backend": "auto",
  "user_id": "user123"
}'
```

### Build & Deploy

```bash
npm run build
npm start
```

## 🛠️ Ferramentas Disponíveis

### `create_task`
Cria uma nova tarefa com título, descrição e prioridade.

**Parâmetros:**
- `title` (string): Título da tarefa
- `description` (string, opcional): Descrição detalhada
- `priority` (enum): 'low' | 'medium' | 'high'
- `dueDate` (ISO string, opcional): Data de vencimento

**Exemplo:**
```
Criar uma tarefa "Implementar autenticação" com prioridade alta e vencimento em 2026-05-10
```

### `list_tasks`
Lista todas as tarefas com widget interativo.

**Parâmetros:**
- `filter` (enum): 'all' | 'completed' | 'pending'
- `priority` (enum): 'all' | 'low' | 'medium' | 'high'

**Retorna:** Widget interativo com lista visual de tarefas

### `update_task`
Atualiza uma tarefa existente.

**Parâmetros:**
- `taskId` (string): ID da tarefa
- `completed` (boolean, opcional): Marcar como completa
- `priority` (enum, opcional): Nova prioridade
- `title` (string, opcional): Novo título
- `description` (string, opcional): Nova descrição

### `delete_task`
Deleta uma tarefa.

**Parâmetros:**
- `taskId` (string): ID da tarefa a deletar

### `get_statistics`
Retorna estatísticas e overview das tarefas.

**Retorna:** Widget com:
- Total de tarefas
- Tarefas completadas
- Taxa de conclusão
- Breakdown por prioridade
- Tarefas atrasadas

## 🎨 Estrutura do Projeto

```
mcp-task-manager/
├── src/
│   └── index.ts                 # Servidor principal MCP
├── resources/
│   ├── task-widget/
│   │   └── widget.tsx           # Widget de lista de tarefas
│   └── statistics-widget/
│       └── widget.tsx           # Widget de estatísticas
├── package.json
├── tsconfig.json
└── README.md
```

## 📚 Padrões do mcp-use Utilizados

### 1. **Server Setup**
```typescript
const server = new MCPServer({
  name: "task-manager",
  version: "1.0.0",
});
```

### 2. **Tool Definition**
```typescript
server.tool(
  {
    name: "create_task",
    description: "...",
    schema: z.object({...}),
  },
  async (params) => {...}
);
```

### 3. **Text Response**
```typescript
return text("Task created successfully!");
```

### 4. **Widget Response**
```typescript
return widget({
  props: { tasks, totalTasks, completedTasks },
  message: "Showing tasks..."
});
```

### 5. **Auto-discoverable Widgets**
- Widgets em `resources/*/widget.tsx` são automaticamente descobertos
- Cada widget exporta `widgetMetadata` com schema Zod
- Componentes React reutilizam `useWidget()` hook

## 🔧 Configuração

### Mudar porta do servidor
Em `src/index.ts`:
```typescript
server.listen(3000); // Alterar para porta desejada
```

### Adicionar novo widget
1. Criar pasta em `resources/novo-widget/`
2. Criar `widget.tsx` com export de `WidgetMetadata`
3. Referenciar em tool com: `widget: "novo-widget"`

### Persistência de dados
Atualmente usa `Map` em memória. Para persistir:
1. Adicionar banco de dados (SQLite, PostgreSQL, etc)
2. Substituir `tasks` Map por queries

## 🚢 Deploy

### Manufact Cloud (Recomendado)
```bash
npm install -g @mcp-use/cli
mcp-use login
mcp-use deploy
```

### Docker
```bash
docker build -t mcp-task-manager .
docker run -p 3000:3000 mcp-task-manager
```

### Manual
```bash
npm run build
npm start
```

## 🧪 Testando com Inspector

1. Inicie o servidor: `npm run dev`
2. Abra `http://localhost:3000/inspector`
3. Teste as ferramentas interativamente
4. Veja os widgets em tempo real

## 📖 Próximos Passos

- [ ] Adicionar autenticação e usuários
- [ ] Persistência com banco de dados
- [ ] Integração com calendário
- [ ] Notificações e lembretes
- [ ] Colaboração em tempo real
- [ ] Export para CSV/PDF

## 🤝 Contribuindo

Este é um exemplo educacional dos padrões do mcp-use. Sinta-se livre para:
- Adicionar novas ferramentas
- Melhorar widgets
- Adicionar persistência
- Criar más integrações

## 📄 Licença

MIT

## 🔗 Recursos

- [mcp-use Docs](https://mcp-use.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Zod Validation](https://zod.dev)
- [React Documentation](https://react.dev)

---

**Desenvolvido com ❤️ como exemplo dos padrões do mcp-use**
