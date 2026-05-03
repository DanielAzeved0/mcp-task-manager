# MCP Task Manager - Exemplos de Uso

## 1️⃣ Criar Tarefas

### Exemplo 1: Tarefa Simples
```
Criar uma tarefa "Estudar TypeScript"
```

**Resposta:**
```
Task created successfully!
ID: 1714724800000
Title: Estudar TypeScript
```

### Exemplo 2: Tarefa Completa
```
Criar uma tarefa "Implementar autenticação OAuth" com descrição "Adicionar login via Google e GitHub" com prioridade alta e vencimento em 2026-05-15
```

**Retorna:**
```
Task created successfully!
ID: 1714724800001
Title: Implementar autenticação OAuth
```

## 2️⃣ Listar Tarefas

### Todas as tarefas
```
Listar todas as tarefas
```

**Retorna:** Widget interativo com todas as tarefas

### Filtrar por status
```
Mostrar apenas tarefas pendentes
```

**Retorna:** Widget com apenas tarefas não completadas

### Filtrar por prioridade
```
Listar tarefas de alta prioridade
```

**Retorna:** Widget com tarefas filtradas por prioridade alta

### Combinado
```
Mostrar tarefas pendentes de alta prioridade
```

## 3️⃣ Atualizar Tarefas

### Marcar como completa
```
Marcar tarefa 1714724800000 como concluída
```

### Mudar prioridade
```
Mudar prioridade da tarefa 1714724800001 para média
```

### Atualizar descrição
```
Atualizar tarefa 1714724800002 com nova descrição "Versão 2.0 com melhorias"
```

## 4️⃣ Deletar Tarefas

```
Deletar tarefa 1714724800000
```

## 5️⃣ Ver Estatísticas

```
Mostrar estatísticas de tarefas
```

**Retorna:** Dashboard com:
- Total: 12 tarefas
- Concluídas: 5
- Pendentes: 7
- Taxa: 41.7%
- Por prioridade: 3 altas, 5 médias, 4 baixas
- Atrasadas: 1

## 🔄 Workflow Completo

1. **Criar backlog**
   ```
   Criar as seguintes tarefas:
   - "Pesquisar frameworks" (prioridade: média)
   - "Protótipo inicial" (prioridade: alta, vencimento: 2026-05-10)
   - "Testes" (prioridade: média, vencimento: 2026-05-15)
   ```

2. **Visualizar progresso**
   ```
   Mostrar estatísticas de tarefas
   ```

3. **Completar tarefas**
   ```
   Marcar "Pesquisar frameworks" como completa
   Marcar "Protótipo inicial" como completa
   ```

4. **Verificar status**
   ```
   Listar tarefas pendentes
   ```

5. **Análise final**
   ```
   Mostrar estatísticas atualizadas
   ```

## 🎯 Casos de Uso Reais

### Personal Todo List
```
Crio meu dia:
- "Revisar PRs" (alta)
- "Escrever documentação" (média)
- "Team meeting" (alta)

Vejo o que tenho:
Mostrar estatísticas

Durante o dia:
Marcar tarefas como concluídas conforme progresso

Noite:
Listar tarefas pendentes para amanhã
```

### Project Management
```
Sprint Planning:
- "Feature A: Backend" (alta, 2026-05-10)
- "Feature A: Frontend" (alta, 2026-05-12)
- "Feature B: API" (média, 2026-05-15)
- "Tests" (média, 2026-05-17)

Acompanhamento:
Listar tarefas de alta prioridade pendentes

Daily Standup:
Mostrar estatísticas
```

### Learning Path
```
Criar currículo:
- "TypeScript Basics" (média)
- "Advanced Types" (alta, vencimento: semana que vem)
- "MCP Framework" (alta, vencimento: 2 semanas)
- "Deploy to Production" (média, vencimento: 3 semanas)

Review semanal:
Listar tarefas completadas essa semana
Tarefas para próxima semana
```

## 💡 Dicas

1. **Use IDs do output anterior** para atualizar/deletar
2. **Datas em ISO**: "2026-05-15T14:30:00Z"
3. **Filtros são cumulativos**: priority=high E filter=pending
4. **Widgets atualizam em tempo real** durante a conversa
5. **Prioridades são case-insensitive**: "High" = "high" = "HIGH"

## 🚀 Próximos Passos

- Integração com calendário
- Lembretes automáticos
- Colaboração em tempo real
- Sync com outras plataformas (Notion, Todoist)
- AI-powered task prioritization

---

**Divirta-se gerenciando tarefas com estilo! 🎉**
