
import { GoogleGenAI, Type } from "@google/genai";

// Always initialize the client with an object containing the apiKey from process.env.
// Creating a helper to get a fresh instance ensures we always have the latest key if it changes.
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Uses Gemini 3 Pro to intelligently find the best matching SOR item for a given tender item.
 * Complex reasoning tasks like semantic matching are best handled by the Pro model.
 */
export async function findBestMatchingItem(targetItemName: string, targetScope: string, dbItems: { id: string; name: string }[]): Promise<string | null> {
  if (dbItems.length === 0) return null;
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `I have a tender item: "${targetItemName}" with scope: "${targetScope}".
      From the database list below, find the ID of the best matching item.
      Return null if no reasonable match is found.
      
      Database Items:
      ${dbItems.map(item => `- ${item.name} (ID: ${item.id})`).join('\n')}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { 
            matchedId: { 
              type: Type.STRING,
              description: "The ID of the matched item, or null if no match exists."
            } 
          },
          required: ["matchedId"]
        },
      },
    });
    // The text property returns the generated string output directly.
    const result = JSON.parse(response.text || '{}');
    return result.matchedId || null;
  } catch (error) {
    console.error("Match error:", error);
    return null;
  }
}

/**
 * Extracts structured tender item data from unstructured bulk text using Gemini 3 Flash.
 * Flash is ideal for basic extraction and parsing tasks.
 */
export async function parseBulkItems(text: string): Promise<any[]> {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Extract a list of tender items from this text: "${text}". 
      Include name, quantity, requestedScope, and any provided estimatedRate.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              requestedScope: { type: Type.STRING },
              estimatedRate: { type: Type.NUMBER }
            },
            required: ["name", "quantity", "requestedScope"]
          }
        }
      }
    });
    return JSON.parse(response.text || '[]');
  } catch (e) {
    console.error("Parse bulk items error:", e);
    return [];
  }
}

/**
 * Parses unstructured text to extract Schedule of Rates (SOR) items.
 * Uses Gemini 3 Flash for efficient extraction.
 */
export async function parseRatesFromText(text: string): Promise<any[]> {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Extract Schedule of Rates (SOR) items (name, unit, rate, scopeOfWork, source) from this text: "${text}".`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              unit: { type: Type.STRING },
              rate: { type: Type.NUMBER },
              scopeOfWork: { type: Type.STRING },
              source: { type: Type.STRING },
            },
            required: ["name", "unit", "rate", "scopeOfWork", "source"]
          },
        },
      },
    });
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Parse rates error:", error);
    return [];
  }
}

// Export a consolidated object for compatibility with environments preferring an object-based service.
export const geminiService = {
  findBestMatchingItem,
  parseBulkItems,
  parseRatesFromText
};
