export enum Role {
  USER = 'user',
  MODEL = 'model'
}

export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  isAdmin?: boolean;
}

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: number;
  imageUrl?: string; // Base64 data URI for images (uploaded or generated)
  isError?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

export interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isLoading: boolean;
}