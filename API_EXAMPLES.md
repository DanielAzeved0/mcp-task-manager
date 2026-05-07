# Exemplos de Uso da API

## Estrutura de Resposta

A API agora retorna informações detalhadas sobre qual backend de IA foi usado:

```json
{
  "prompt_spec": {
    "task_instruction": "Create a function that adds two numbers",
    "input_fields": {
      "a": { "type": "number", "description": "First number" },
      "b": { "type": "number", "description": "Second number" }
    },
    "output_fields": {
      "result": { "type": "number", "description": "Sum of the two numbers" }
    }
  },
  "quality_score": 9.5,
  "validation": {
    "is_valid": true,
    "issues": [],
    "fixes_applied": []
  },
  "iterations": 1,
  "performance": {
    "execution_time_ms": 1250,
    "tokens_used": 150,
    "model_used": "llama3.2"
  },
  "ai_backend": {
    "provider": "ollama",
    "model": "llama3.2",
    "fallback_used": false
  },
  "fallback": {
    "used_fallback": false,
    "fallback_type": "none"
  },
  "cache": {
    "hit": false,
    "cache_key": "user123::null::crie uma função para somar dois números::"
  },
  "versioning": {
    "version_id": "uuid-123",
    "previous_version_id": null,
    "created_at": "2024-01-15T10:30:00.000Z"
  },
  "ranking": {
    "score": 9.5,
    "position": 1
  },
  "learning": {
    "feedback_score": null,
    "historical_average_score": 8.7,
    "improvement_trend": "stable",
    "recommendations": [
      "The prompt spec is valid and ready for use.",
      "Collect feedback after execution."
    ]
  },
  "governance": {
    "rate_limited": false,
    "quota_remaining": 9,
    "request_allowed": true
  },
  "audit": {
    "request_id": "uuid-123",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "user_id": "user123",
    "team_id": null
  },
  "status": "success"
}
```

## Cenários de Backend

### 1. Ollama (Local)
```json
{
  "ai_backend": {
    "provider": "ollama",
    "model": "llama3.2",
    "fallback_used": false
  },
  "fallback": {
    "used_fallback": false,
    "fallback_type": "none"
  }
}
```

### 2. Gemini (Remoto)
```json
{
  "ai_backend": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "fallback_used": false
  },
  "fallback": {
    "used_fallback": false,
    "fallback_type": "none"
  }
}
```

### 3. Fallback Mock (Quando falha)
```json
{
  "ai_backend": {
    "provider": "mock",
    "model": "mock",
    "fallback_used": true
  },
  "fallback": {
    "used_fallback": true,
    "fallback_type": "mock"
  }
}
```

## Estratégia de Seleção

A API usa a seguinte lógica para escolher o backend:

1. **preferred_backend: "ollama"** → Usa Ollama se disponível
2. **preferred_backend: "gemini"** → Usa Gemini se disponível
3. **preferred_backend: "auto"** (padrão) → Usa Llama para prompts simples e Gemini para prompts complexos
4. **Fallback** → Gera uma especificação local determinística se nenhum backend estiver disponível

## Monitoramento

Para monitorar qual backend está sendo usado, observe:

- **Terminal**: Logs mostram "🟡 MOCK MODE ATIVO" quando necessário
- **Resposta**: Campo `ai_backend.provider` indica qual foi usado
- **Performance**: Campo `model_used` mostra o modelo específico
