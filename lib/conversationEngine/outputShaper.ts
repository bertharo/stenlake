/**
 * Output Shaping
 * 
 * Post-processes responses to enforce natural, concise, coach-like output.
 */

import { UserIntent } from "./intentClassifier";

/**
 * Shape output for natural conversation
 */
export function shapeOutput(response: string, intent: UserIntent): string {
  let shaped = response.trim();

  // Remove common AI artifacts
  shaped = removeAIArtifacts(shaped);
  
  // Enforce concise structure
  shaped = enforceConciseStructure(shaped, intent);
  
  // Fix repetitive preambles
  shaped = removeRepetitivePreambles(shaped);
  
  // Ensure natural coach cadence
  shaped = ensureCoachCadence(shaped);

  return shaped;
}

/**
 * Remove AI artifacts
 */
function removeAIArtifacts(text: string): string {
  // Remove "as an AI" phrases
  text = text.replace(/\bas an (AI|artificial intelligence|assistant)\b/gi, "");
  text = text.replace(/\b(I'm|I am) an (AI|artificial intelligence|assistant)\b/gi, "");
  
  // Remove "I understand" preambles
  text = text.replace(/^(I understand|I see|I hear|I get it).*?\./i, "");
  
  // Remove excessive "let me" phrases
  text = text.replace(/\b(Let me|I'll|I will) (help|assist|guide|explain)/gi, "");
  
  // Remove customer support phrases
  text = text.replace(/\b(Please let me know|Feel free to|Don't hesitate to)\b/gi, "");
  
  return text.trim();
}

/**
 * Enforce concise paragraph structure
 */
function enforceConciseStructure(text: string, intent: UserIntent): string {
  // Split into paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  // Limit paragraphs based on intent
  let maxParagraphs = 3;
  if (intent === "general_question" || intent === "greeting") {
    maxParagraphs = 2;
  } else if (intent === "performance_analysis" || intent === "training_plan") {
    maxParagraphs = 4;
  }
  
  // Trim to max paragraphs
  if (paragraphs.length > maxParagraphs) {
    paragraphs.splice(maxParagraphs);
  }
  
  // Ensure each paragraph is under 150 words
  const trimmed = paragraphs.map(p => trimParagraph(p));
  
  return trimmed.join("\n\n").trim();
}

/**
 * Trim paragraph to reasonable length
 */
function trimParagraph(paragraph: string): string {
  const words = paragraph.split(/\s+/);
  if (words.length <= 100) {
    return paragraph;
  }
  
  // Take first 100 words and add ellipsis if needed
  return words.slice(0, 100).join(" ") + "...";
}

/**
 * Remove repetitive preambles
 */
function removeRepetitivePreambles(text: string): string {
  // Remove repeated greetings
  text = text.replace(/(Hi|Hey|Hello)[,.]?\s*/gi, "");
  
  // Remove "Based on" repeated starts
  const lines = text.split(/\n/);
  let seenStarts = new Set<string>();
  const filtered = lines.filter(line => {
    const lower = line.toLowerCase().trim();
    if (lower.startsWith("based on") || lower.startsWith("according to")) {
      if (seenStarts.has("based")) {
        return false;
      }
      seenStarts.add("based");
    }
    return true;
  });
  
  return filtered.join("\n").trim();
}

/**
 * Ensure coach cadence (short, clear sentences)
 */
function ensureCoachCadence(text: string): string {
  // Break up very long sentences (over 25 words)
  const sentences = text.split(/([.!?]+\s+)/);
  const reshaped: string[] = [];
  
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    const punctuation = sentences[i + 1] || "";
    
    if (!sentence) continue;
    
    const words = sentence.trim().split(/\s+/);
    
    if (words.length > 25) {
      // Split long sentence at commas or conjunctions
      const parts = sentence.split(/(,|;|\s+(and|but|or|so)\s+)/i);
      reshaped.push(parts.join(""));
    } else {
      reshaped.push(sentence + punctuation);
    }
  }
  
  return reshaped.join(" ").trim();
}
