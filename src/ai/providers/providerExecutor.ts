import { execSync } from "child_process";
import { geminiClient, ollamaClient } from "../../utils/geminiClient.js";
import { logEvent } from "../../observability/logger.js";

type CompletionMessage = {
  role: "system" | "user";
  content: string;
};

type ProviderGenerationPolicy = {
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
};

export type ProviderExecutionPolicies = {
  llama: ProviderGenerationPolicy;
  gemini: ProviderGenerationPolicy;
};

export function getAvailableOllamaModels(): string[] {
  try {
    const output = execSync("ollama list", { encoding: "utf8", timeout: 3000 });
    const lines = output.trim().split("\n").slice(1);
    return lines.map((line) => line.trim().split(/\s+/)[0]).filter(Boolean);
  } catch (error) {
    logEvent("warn", "ollama_models_unavailable", { reason: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

export function resolveOllamaModel(configuredModel: string): { resolvedModel: string; status: "valid" | "corrected" | "fallback"; availableModels: string[] } {
  const availableModels = getAvailableOllamaModels();

  if (availableModels.length === 0) {
    throw new Error('No Ollama models installed. Please install models using "ollama pull <model>" and ensure Ollama is running.');
  }

  const normalizedConfigured = configuredModel.toLowerCase().trim();

  if (availableModels.includes(configuredModel)) {
    logEvent("debug", "ollama_model_validated", { configuredModel, resolvedModel: configuredModel, status: "valid" });
    return { resolvedModel: configuredModel, status: "valid", availableModels };
  }

  const partialMatch = availableModels.find((model) =>
    model.toLowerCase().startsWith(normalizedConfigured) ||
    model.toLowerCase().includes(normalizedConfigured)
  );
  if (partialMatch) {
    logEvent("debug", "ollama_model_validated", { configuredModel, resolvedModel: partialMatch, status: "corrected" });
    return { resolvedModel: partialMatch, status: "corrected", availableModels };
  }

  if (!configuredModel.includes(":")) {
    const withLatest = `${configuredModel}:latest`;
    if (availableModels.includes(withLatest)) {
      logEvent("debug", "ollama_model_validated", { configuredModel, resolvedModel: withLatest, status: "corrected" });
      return { resolvedModel: withLatest, status: "corrected", availableModels };
    }
  }

  const fallbackModel = availableModels[0];
  logEvent("warn", "ollama_model_fallback", { configuredModel, resolvedModel: fallbackModel, status: "fallback", availableModels });
  return { resolvedModel: fallbackModel, status: "fallback", availableModels };
}

export async function createCompletion(
  messages: CompletionMessage[],
  client: any,
  options: {
    activeGeminiModel: string;
    ollamaModel: string;
    policies: ProviderExecutionPolicies;
    modelOverride?: string;
  }
) {
  if (!client) {
    throw new Error("No AI client available for completion.");
  }

  if (client === ollamaClient) {
    if (!ollamaClient) {
      throw new Error("Ollama client not available.");
    }

    const { resolvedModel } = resolveOllamaModel(options.ollamaModel);
    const prompt = messages.map((msg) => {
      if (msg.role === "system") return `System: ${msg.content}`;
      if (msg.role === "user") return `User: ${msg.content}`;
      return msg.content;
    }).join("\n\n");

    const stream = ollamaClient.generate(resolvedModel, prompt, {
      parameters: {
        temperature: 0.2,
        top_k: 40,
        top_p: 0.9,
        num_predict: options.policies.llama.maxOutputTokens,
      } as any,
    });

    let content = "";
    for await (const chunk of stream) {
      content += chunk;
    }

    if (!content) {
      throw new Error("Ollama returned an empty completion.");
    }

    return {
      content,
      tokens: Math.ceil(content.length / 4),
      model: resolvedModel,
    };
  }

  if (client === geminiClient) {
    if (!geminiClient) {
      throw new Error("Gemini client not available.");
    }

    const selectedModel = options.modelOverride || options.activeGeminiModel;
    const model = geminiClient.getGenerativeModel({
      model: selectedModel,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: options.policies.gemini.maxOutputTokens,
      },
    });

    const prompt = messages.map((msg) => {
      if (msg.role === "system") return `System: ${msg.content}`;
      if (msg.role === "user") return `User: ${msg.content}`;
      return msg.content;
    }).join("\n\n");

    const completion = await model.generateContent(prompt);
    const content = completion.response.text();
    if (!content) {
      throw new Error("Gemini returned an empty completion.");
    }

    return {
      content,
      tokens: Math.ceil(content.length / 4),
      model: selectedModel,
    };
  }

  throw new Error("Unsupported AI client.");
}

export function getProviderExecutionPolicy(backend: string, policies: ProviderExecutionPolicies) {
  return backend === "gemini" ? policies.gemini : policies.llama;
}

export function withCompletionTimeout<T>(promise: Promise<T>, backend: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${backend} completion timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}
