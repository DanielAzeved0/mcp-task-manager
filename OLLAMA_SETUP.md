# Configuração Ollama

Este projeto usa Ollama como backend local de Llama dentro do roteador hibrido Gemini/Llama.

## 🚀 Usando Ollama (Local e Gratuito)

### 1. Instalar Ollama

Baixe e instale o Ollama do site oficial:
- https://ollama.ai/download

### 2. Baixar um Modelo

Abra o terminal e execute:

```bash
# Para modelos em português/inglês
ollama pull llama3.2

# Ou outros modelos disponíveis
ollama pull mistral
ollama pull codellama
```

### 3. Verificar Modelos Instalados

```bash
ollama list
```

### 4. Configurar o Projeto

Copie o arquivo de exemplo:
```bash
cp .env.example .env
```

Edite o `.env` para usar Ollama:
```env
USE_OLLAMA=true
OLLAMA_MODEL=llama3.2
PORT=3000
```

### 5. Iniciar o Servidor

```bash
npm install
npm run dev
```

### 6. Testar

O servidor irá usar automaticamente o Ollama quando `USE_OLLAMA=true`.

## 🔧 Configurações Avançadas

### Modelos Recomendados

- `llama3.2` - Bom equilíbrio entre velocidade e qualidade
- `mistral` - Excelente para tarefas gerais
- `codellama` - Otimizado para código

### Porta Personalizada do Ollama

Por padrão, Ollama roda na porta 11434. Se você mudou, configure:

```env
OLLAMA_HOST=http://localhost:11434
```

## Comparação: Gemini vs Ollama

| Aspecto | Gemini | Ollama |
|---------|--------|--------|
| Custo | Pago | Gratuito |
| Velocidade | Muito rápida | Depende do hardware |
| Privacidade | Dados enviados | 100% local |
| Setup | API key | Instalar + modelo |
| Offline | Não | Sim |

## 🐛 Troubleshooting

### Erro: "model not found"
```bash
ollama pull llama3.2
```

### Erro: "connection refused"
- Verifique se Ollama está rodando: `ollama serve`
- Verifique a porta: `OLLAMA_HOST=http://localhost:11434`

### Performance Lenta
- Use modelos menores como `llama3.2:1b`
- Feche outras aplicações que usam GPU/CPU
