import { supabase } from './supabaseClient';
import { User, ChatSession, Role } from '../types';

/**
 * Reads all users from Supabase.
 */
export const getAllUsers = async (): Promise<User[]> => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Admin: Error fetching users", error);
        return [];
    }

    return data.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        photoUrl: u.photo_url,
        isAdmin: u.is_admin
    }));
};

/**
 * Reads chat sessions for a specific user ID from Supabase.
 */
export const getUserSessions = async (userId: string): Promise<ChatSession[]> => {
    // 1. Fetch Sessions
    const { data: sessions, error: sessError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (sessError || !sessions) return [];

    // 2. Fetch Messages for these sessions
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) return [];

    const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .in('session_id', sessionIds)
        .order('timestamp', { ascending: true });

    if (msgError) return [];

    // 3. Assemble
    return sessions.map(s => {
        const sessionMsgs = messages
            .filter(m => m.session_id === s.id)
            .map(m => ({
                id: m.id,
                role: m.role as Role,
                text: m.text,
                timestamp: parseInt(m.timestamp),
                imageUrl: m.image_url,
                isError: m.is_error
            }));

        return {
            id: s.id,
            title: s.title || 'Untitled Chat',
            messages: sessionMsgs,
            createdAt: new Date(s.created_at).getTime()
        };
    });
};
