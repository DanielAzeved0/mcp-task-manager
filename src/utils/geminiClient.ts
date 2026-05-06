import { GoogleGenerativeAI } from "@google/generative-ai";
import { Ollama } from "ollama";

const geminiApiKey = process.env.GEMINI_API_KEY;
const useOllama = process.env.USE_OLLAMA !== "false";
const ollamaHost = process.env.OLLAMA_HOST;

export const geminiClient = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
export const ollamaClient = useOllama ? new Ollama(ollamaHost ? { address: ollamaHost } : undefined) : null;
