import { GoogleGenAI, Chat, Content, Modality } from "@google/genai";
import { Message, Role } from "../types";

// Initialize the client strictly as per guidelines
// Ensure process.env.API_KEY is available in your environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-2.5-flash';

const BASE_SYSTEM_INSTRUCTION = `
You are Shakil, a highly intelligent, witty, and multilingual AI assistant.
Your persona is inspired by a hero: helpful, confident, moral, and sometimes you use light-hearted heroic metaphors.
You must answer questions accurately and concisely.
You must detect the language the user is speaking and respond in the same language.
If asked about your identity, confirm you are Shakil, the AI assistant of this app.
`.trim();

/**
 * Creates a new chat instance, potentially restoring history.
 * We need to map our app's Message format to the SDK's Content format.
 */
export const createGenAIChat = (historyMessages: Message[] = [], userMemory: string = ''): Chat => {
  // Convert internal message history to Gemini SDK history format
  const history: Content[] = historyMessages.map((msg) => ({
    role: msg.role === Role.USER ? 'user' : 'model',
    parts: [{ text: msg.text }],
  }));

  // Inject memory into system instruction if it exists
  const systemInstruction = userMemory 
    ? `${BASE_SYSTEM_INSTRUCTION}\n\nUser Context (Long-term Memory):\n${userMemory}`
    : BASE_SYSTEM_INSTRUCTION;

  return ai.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: systemInstruction,
    },
    history: history,
  });
};

/**
 * Sends a message and returns a stream of text chunks.
 */
export const sendMessageStream = async (
  chat: Chat,
  userMessage: string
): Promise<AsyncIterable<string>> => {
  
  try {
    const result = await chat.sendMessageStream({ message: userMessage });
    
    // We return an async iterable that yields text chunks
    return {
      [Symbol.asyncIterator]: async function* () {
        for await (const chunk of result) {
          // Access text directly as per SDK guidelines (no .text())
          const text = chunk.text;
          if (text) {
            yield text;
          }
        }
      }
    };
  } catch (error) {
    console.error("Error sending message to Gemini:", error);
    throw error;
  }
};

/**
 * Helper to generate a session title based on the first message
 */
export const generateSessionTitle = async (firstMessage: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Generate a very short, 3-5 word title for a chat that starts with: "${firstMessage}". Return ONLY the title, no quotes.`,
        });
        return response.text?.trim() || "New Conversation";
    } catch (e) {
        return "New Conversation";
    }
}

/**
 * Refines the user's long-term memory based on the latest interaction.
 */
export const refineUserMemory = async (currentMemory: string, userMessage: string, aiResponse: string): Promise<string> => {
    try {
        const prompt = `
        You are a Memory Manager for an AI assistant.
        
        Current User Memory:
        "${currentMemory || "No memory yet."}"
        
        Latest Interaction:
        User: "${userMessage}"
        AI: "${aiResponse}"
        
        Task:
        Update the Current User Memory with any new, permanent personal facts found in the Latest Interaction (e.g., name, hobbies, profession, location, preferences).
        - If the user explicitly states their name, override any old name.
        - Keep the memory concise and bullet-pointed.
        - Do not store temporary conversation details (like "user asked for a joke").
        - If no new personal info is found, return the "Current User Memory" exactly as is.
        - Do not output anything else besides the updated memory text.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text?.trim() || currentMemory;
    } catch (e) {
        console.error("Failed to refine memory", e);
        return currentMemory;
    }
};

// --- Text to Speech (TTS) Functionality ---

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContext;
};

/**
 * Generates speech from text using gemini-2.5-flash-preview-tts
 * Returns an AudioBuffer ready for playback.
 */
export const generateSpeech = async (text: string): Promise<AudioBuffer> => {
    // Generate audio content
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    // Changed from Kore (female) to Fenrir (male)
                    prebuiltVoiceConfig: { voiceName: 'Fenrir' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("No audio generated from Gemini.");
    }

    // Decode Base64 to Binary
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode PCM (Signed 16-bit Little Endian) -> Float32
    // Gemini TTS uses 24kHz sample rate by default
    const dataInt16 = new Int16Array(bytes.buffer);
    const ctx = getAudioContext();
    const frameCount = dataInt16.length;
    const audioBuffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
        // Normalize 16-bit integer to float range [-1.0, 1.0]
        channelData[i] = dataInt16[i] / 32768.0;
    }

    return audioBuffer;
};

/**
 * Plays an AudioBuffer using the shared AudioContext.
 * Returns the source node so it can be stopped.
 */
export const playAudioBuffer = async (buffer: AudioBuffer): Promise<AudioBufferSourceNode> => {
    const ctx = getAudioContext();
    
    // Ensure context is running (needed for some browsers' autoplay policy)
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    return source;
};