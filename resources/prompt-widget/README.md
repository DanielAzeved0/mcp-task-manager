# Prompt Generator Widget 🤖

Um widget React interativo para converter prompts em linguagem natural em Especificações de Prompt estruturadas usando a API MCP.

## 📋 Características

- **Interface Intuitiva**: Formulário simples com entrada de texto para prompts
- **Seleção de Backend**: Escolha entre Auto, Llama/Ollama (local) ou Gemini (nuvem)
- **Modo Estrito**: Toggle para validação rigorosa de JSON com correção automática
- **Resultados Detalhados**: Exibe resposta completa da API, status, backend usado e métricas de performance
- **Validação JSON**: Mostra tentativas de correção automática quando ativado
- **Layout Centrado**: Design limpo e responsivo com tema claro/escuro
- **Spinner de Loading**: Indicador visual durante processamento
- **Tratamento de Erros**: Mensagens claras para falhas na API

## 🎯 Campos de Entrada

### `user_prompt`
- **Tipo**: `string`
- **Descrição**: Texto onde o usuário escreve o prompt a ser convertido
- **Obrigatório**: Sim (validado antes do envio)

### `preferred_backend`
- **Tipo**: `string`
- **Opções**: `"auto"`, `"llama"`, `"ollama"`, `"gemini"`
- **Padrão**: `"auto"`
- **Descrição**: Seleciona o backend de IA preferido

### `strict_mode`
- **Tipo**: `boolean`
- **Padrão**: `false`
- **Descrição**: Ativa validação rigorosa de JSON com correção automática

## 📤 Campos de Saída

### `prompt_spec`
- **Tipo**: `object`
- **Descrição**: Especificação de Prompt estruturada retornada pela API

### `status`
- **Tipo**: `string`
- **Descrição**: Status da requisição (`success`, `fallback`, `error`)

### `ai_backend`
- **Tipo**: `object`
- **Descrição**: Informações sobre o backend usado (`provider`, `model`, `fallback_used`)

### `performance`
- **Tipo**: `object`
- **Descrição**: Métricas de execução (`execution_time_ms`, `tokens_used`, `model_used`)

## 🚀 Como Usar

### 1. Instalação
```bash
npm install
```

### 2. Configuração da IA
Configure um dos backends suportados:

**Gemini:**
```bash
# Adicione GEMINI_API_KEY ao .env
```

**Ollama (Local):**
```bash
# Instale Ollama e baixe um modelo
ollama pull llama3.2
# Configure USE_OLLAMA=true no .env
```

### 3. Executar o Servidor
```bash
npm run dev
```

### 4. Usar o Widget
O widget pode ser integrado em aplicações React que suportem MCP:

```tsx
import PromptWidget from './resources/prompt-widget/widget.tsx';

// Usar com props padrão
<PromptWidget />

// Ou com configuração customizada
<PromptWidget
  apiEndpoint="http://localhost:3000/prompt-to-spec"
  defaultBackend="ollama"
  defaultStrictMode={true}
/>
```

## 🔧 Props do Widget

```typescript
interface PromptWidgetProps {
  apiEndpoint?: string;        // URL da API (padrão: localhost:3000)
  defaultBackend?: "auto" | "llama" | "ollama" | "gemini";  // Backend padrão
  defaultStrictMode?: boolean; // Modo estrito padrão
}
```

## 📊 Exemplo de Uso

1. **Digite um prompt**: "Crie uma função que valide emails"
2. **Selecione backend**: Auto (recomendado)
3. **Ative modo estrito**: Para correção automática de JSON
4. **Clique em "Generate Spec"**
5. **Veja o resultado**: Resposta JSON completa com status e métricas

## 🎨 Interface

- **Layout**: Página única centrada com fundo responsivo
- **Header**: Título e descrição explicativa
- **Formulário**:
  - Campo textarea grande para prompt
  - Grid com dropdown de backend e checkbox de modo estrito
  - Botão com spinner durante processamento
- **Resultados**:
  - Badge de status colorido
  - Bloco de código com resposta JSON completa
  - Cards de informações do backend e performance

## 🔒 Segurança

- Validação rigorosa de entrada usando Zod
- Sanitização de dados de saída
- Tratamento de erros graceful
- Fallback automático quando IA indisponível

## 🐛 Troubleshooting

**Erro: "Cannot find package 'react'"**
- Instale as dependências: `npm install react react-dom`

**Erro: "Please enter a prompt before submitting"**
- Digite um prompt válido no campo de texto

**Erro: "No AI client available"**
- Configure GEMINI_API_KEY ou USE_OLLAMA=true

**JSON malformado no modo estrito**
- O sistema tenta corrigir automaticamente até 3 vezes
- Verifique o campo `json_validation` na resposta

## 🔌 API Integration

O widget se conecta automaticamente ao endpoint:
```
POST http://localhost:3000/prompt-to-spec
```

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "prompt": "{{user_prompt}}",
  "preferred_backend": "{{preferred_backend}}",
  "strict_mode": "{{strict_mode}}",
  "user_id": "user_001",
  "team_id": "team_001"
}
```
