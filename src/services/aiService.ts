/* eslint-disable @typescript-eslint/no-explicit-any */
import { Product, GreenhouseStatus, UserProfile } from "../types";
import { GoogleGenAI } from "@google/genai";

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  recipeData?: any;
}

// Initialize AI on the client as per skill guidelines
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function* getAIChatResponse(
  prompt: string, 
  history: ChatMessage[],
  context: {
    products: Product[];
    greenhouse?: GreenhouseStatus;
    profile: UserProfile;
  }
) {
  const dietInfo = Object.entries(context.profile.dietaryProfile)
    .filter(([_, value]) => value === true)
    .map(([key]) => key)
    .join(', ') || 'Keine speziellen Einschränkungen';

  const systemInstruction = `
    Du bist der KI-Assistent des „Food-Connect-Markts“. Dein Name ist "Acker-Assistent".
    Nutzer: ${context.profile.name}
    Ernährungsprofil: ${dietInfo}
    Aktuelles Klima: ${context.greenhouse ? `Temp ${context.greenhouse.temperature}°C, Luftf. ${context.greenhouse.humidity}%` : 'Daten werden geladen'}.
    
    DEINE AUFGABEN:
    1. Hilfe beim Finden von Produkten.
    2. Fragen zum Markt, Café und Gewächshaus beantworten.
    3. Nachhaltigkeit & Hydroponik erklären.

    VERHALTENSREGELN:
    - Kurze bis mittellange Antworten in Reintext (KEIN Markdown wie ** Fett).
    - Antworte immer auf Deutsch.
    
    VERFÜGBARE PRODUKTE:
    ${context.products.slice(0, 30).map(p => `- ${p.name} (${p.brand}): ${p.price}€`).join('\n')}

    LISTEN-FORMAT (ganz am Ende):
    [DATA:{"type": "shopping_list", "name": "Name", "items": [{"id": "id", "name": "Name", "amount": "1"}]}]
  `;

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [
        ...history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        { role: 'user', parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  } catch (error) {
    console.error("AI Error:", error);
    yield "Entschuldigung, der KI-Dienst ist gerade nicht erreichbar.";
  }
}

export async function getAIImageSearch(prompt: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} } as any]
      }
    });

    const text = response.text || "";
    const groundingUrl = (response as any).candidates?.[0]?.groundingMetadata?.groundingChunks?.[0]?.web?.uri;
    
    return { text, groundingUrl };
  } catch (err) {
    console.error("AI image search error:", err);
    return null;
  }
}
