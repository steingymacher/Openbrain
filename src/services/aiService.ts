import { Product, GreenhouseStatus, UserProfile } from "../types";
import { GoogleGenAI } from "@google/genai";

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  recipeData?: any;
}

// Lazy initialization of AI
let aiInstance: GoogleGenAI | null = null;
function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set.");
      return null;
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
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
  // Construct a professional system instruction
  const dietInfo = Object.entries(context.profile.dietaryProfile)
    .filter(([_, value]) => value === true)
    .map(([key]) => key)
    .join(', ') || 'Keine speziellen Einschränkungen';

  const systemInstruction = `
    Du bist der KI-Assistent des „Food-Connect-Markts“, eines modernen, nachhaltigen und sozialen Supermarkt-Konzepts mit integriertem Café und Gewächshaus. Deine Aufgabe ist es, Kunden freundlich, einfach und effizient zu helfen.
    Dein Name ist "Acker-Assistent".
    
    NUTZERKONTEXT:
    - Nutzer: ${context.profile.name}
    - Ernährungsprofil: ${dietInfo} (WICHTIG: Erwähne niemals "JSON" oder technische Formatierungen!)
    - Aktuelles Gewächshaus-Klima: ${context.greenhouse ? `Temperatur ${context.greenhouse.temperature}°C, Luftfeuchtigkeit ${context.greenhouse.humidity}%` : 'Daten werden geladen'}.
    
    DEIN CHARAKTER:
    - freundlich, modern, verständlich, lösungsorientiert, nachhaltig denkend, inklusiv und barrierefrei.
    - Technik soll unterstützen, aber nie den menschlichen Kontakt ersetzen.
    - Antworte immer auf Deutsch.

    DER FOOD-CONNECT-MARKT (Wissen):
    - Fokus: Gemeinschaft, Nachhaltigkeit, einfache Orientierung.
    - Barrierefreiheit: Rollstuhlgerecht, Riffelungen für Blinde, breite Gänge.
    - Ladenlayout (Achteckige Form).
    - Farben-Zonen: Obst&Gemüse (grün), Backwaren (gelb), Kühl (blau), Snacks (rot), Getränke (grau).

    DEINE AUFGABEN:
    1. Hilfe beim Finden von Produkten.
    2. Fragen zum Markt, Café und Gewächshaus beantworten.
    3. Nachhaltigkeit & Hydroponik erklären.
    4. Barrierefreie Unterstützung anbieten.

    VERHALTENSREGELN:
    - Kurze bis mittellange Antworten.
    - Einfache Sprache, positiv und modern.
    - WICHTIG: Nutze KEINERLEI Markdown-Formatierung wie Sternchen (**) für Fettschrift. Antworte in sauberem Reintext.
    
    VERFÜGBARE PRODUKTE:
    ${context.products.slice(0, 30).map(p => `- ${p.name} (${p.brand}): ${p.price}€`).join('\n')}

    LISTEN-FORMAT:
    [DATA:{"type": "shopping_list", "name": "Name", "items": [{"id": "id", "name": "Name", "amount": "1"}]}]
    Warenkorb speichern: [DATA:{"type": "save_current_cart"}]
  `;

  const ai = getAI();
  if (!ai) {
    yield "Entschuldigung, die KI ist momentant nicht konfiguriert.";
    return;
  }

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview", // Correct model from skill
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
      const text = chunk.text;
      if (text) yield text;
    }
  } catch (err: any) {
    console.error("AI stream error:", err);
    yield "Fehler bei der Kommunikation mit der KI.";
  }
}

export async function getAIImageSearch(prompt: string) {
  const ai = getAI();
  if (!ai) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Correct model from skill
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} } as any]
      }
    });

    const text = response.text || "";
    // Note: groundingMetadata structure might vary, but this is a common pattern
    const groundingUrl = (response as any).candidates?.[0]?.groundingMetadata?.groundingChunks?.[0]?.web?.uri;
    
    return { text, groundingUrl };
  } catch (err) {
    console.error("AI image search error:", err);
    return null;
  }
}
