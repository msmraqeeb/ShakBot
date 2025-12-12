import { User, ChatSession } from '../types';

const USERS_STORAGE_KEY = 'shakbot_users';

/**
 * Reads all users from local storage.
 */
export const getAllUsers = (): User[] => {
    try {
        const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
        if (!usersJson) return [];
        const users = JSON.parse(usersJson);
        // Return users without passwords
        return users.map((u: any) => {
            const { password, ...rest } = u;
            return rest as User;
        });
    } catch (e) {
        return [];
    }
};

/**
 * Reads chat sessions for a specific user ID.
 */
export const getUserSessions = (userId: string): ChatSession[] => {
    try {
        const sessionsJson = localStorage.getItem(`shakbot_sessions_${userId}`);
        if (!sessionsJson) return [];
        return JSON.parse(sessionsJson) as ChatSession[];
    } catch (e) {
        return [];
    }
};
