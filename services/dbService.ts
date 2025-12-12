import { supabase } from './supabaseClient';
import { ChatSession, Message, Role } from '../types';

const logError = (context: string, error: any) => {
    console.error(`${context}:`, JSON.stringify(error, null, 2));
};

// --- Sessions ---

export const fetchUserSessions = async (userId: string): Promise<ChatSession[]> => {
    // 1. Get Sessions
    const { data: sessionsData, error: sessionsError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (sessionsError) {
        logError("fetchUserSessions (sessions)", sessionsError);
        return [];
    }
    if (!sessionsData) return [];

    // 2. Get Messages for these sessions
    const sessionIds = sessionsData.map(s => s.id);
    if (sessionIds.length === 0) return [];

    const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .in('session_id', sessionIds)
        .order('timestamp', { ascending: true });

    if (messagesError) {
        logError("fetchUserSessions (messages)", messagesError);
        return [];
    }

    // 3. Map to ChatSession structure
    return sessionsData.map(s => {
        const sessionMessages = messagesData
            ?.filter(m => m.session_id === s.id)
            .map(m => ({
                id: m.id,
                role: m.role as Role,
                text: m.text,
                timestamp: parseInt(m.timestamp), // BigInt comes as string/number
                imageUrl: m.image_url,
                isError: m.is_error
            })) || [];

        return {
            id: s.id,
            title: s.title || 'New Conversation',
            messages: sessionMessages,
            createdAt: new Date(s.created_at).getTime()
        };
    });
};

export const createSession = async (userId: string, sessionId: string, title: string) => {
    const { error } = await supabase
        .from('chat_sessions')
        .insert({
            id: sessionId,
            user_id: userId,
            title: title
        });
    if (error) logError("createSession", error);
};

export const updateSessionTitle = async (sessionId: string, title: string) => {
    const { error } = await supabase
        .from('chat_sessions')
        .update({ title })
        .eq('id', sessionId);
    if (error) logError("updateSessionTitle", error);
};

export const deleteSession = async (sessionId: string) => {
    // Messages delete via cascade in SQL usually, but explicitly just deleting session here
    const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);
    if (error) throw error;
};

// --- Messages ---

export const saveMessage = async (sessionId: string, message: Message) => {
    const { error } = await supabase
        .from('messages')
        .insert({
            id: message.id,
            session_id: sessionId,
            role: message.role,
            text: message.text,
            image_url: message.imageUrl,
            timestamp: message.timestamp, // Ensure SQL is bigint
            is_error: message.isError || false
        });
    if (error) logError("saveMessage", error);
};

// --- Memory ---

export const fetchUserMemory = async (userId: string): Promise<string> => {
    const { data, error } = await supabase
        .from('user_memories')
        .select('memory_text')
        .eq('user_id', userId)
        .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is 'Row not found'
        logError("fetchUserMemory", error);
    }
    
    return data?.memory_text || '';
};

export const saveUserMemory = async (userId: string, memoryText: string) => {
    const { error } = await supabase
        .from('user_memories')
        .upsert({
            user_id: userId,
            memory_text: memoryText
        });
    if (error) logError("saveUserMemory", error);
};