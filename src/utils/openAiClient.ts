import OpenAI from "openai";
import { Ollama } from "ollama";

const openAiApiKey = process.env.OPENAI_API_KEY;
const useOllama = process.env.USE_OLLAMA === "true" || !openAiApiKey;
const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";

export const openAiClient = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;
export const ollamaClient = useOllama ? new Ollama() : null;
