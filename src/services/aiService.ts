/* eslint-disable @typescript-eslint/no-explicit-any */
import { Product, GreenhouseStatus, UserProfile } from "../types";

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  recipeData?: any;
}

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
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, history, systemInstruction })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("AI Proxy Error details:", errorData);
      throw new Error(`Fehler beim Abrufen der KI-Antwort (Status: ${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value);
    }
  } catch (error) {
    console.error("AI Proxy Error:", error);
    yield "Entschuldigung, der KI-Dienst ist gerade nicht erreichbar.";
  }
}

export async function getAIImageSearch(prompt: string) {
  try {
    const response = await fetch('/api/ai/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("AI Search Proxy Error details:", errorData);
      throw new Error("AI search failed");
    }
    return await response.json();
  } catch (err) {
    console.error("AI image search proxy error:", err);
    return null;
  }
}
