import React from 'react';
import { MessageSquare, Plus, Trash2, X, LogOut, User as UserIcon } from 'lucide-react';
import { ChatSession, User } from '../types';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  user: User | null;
  onLogout: () => void;
}

// Updated with the user provided Unsplash URL
const SHAKIL_AVATAR_URL = "https://images.unsplash.com/photo-1633957897986-70e83293f3ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxyb2JvdCUyMGF2YXRhcnxlbnwwfHx8fDE3NjQ2NTQwMjh8MA&ixlib=rb-4.1.0&q=80&w=1080";

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  isOpen,
  setIsOpen,
  user,
  onLogout
}) => {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-30
        w-72 bg-blue-900 flex flex-col transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        border-r border-blue-800 shadow-2xl
      `}>
        
        {/* Header */}
        <div className="p-4 border-b border-blue-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center overflow-hidden border-2 border-yellow-400 shadow-lg">
                    <img src={SHAKIL_AVATAR_URL} alt="Shakil Logo" className="w-full h-full object-cover" />
                </div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                    Shak<span className="text-yellow-400">Bot</span>
                </h1>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              className="md:hidden text-blue-200 hover:text-white"
            >
              <X size={24} />
            </button>
        </div>

        {/* New Chat Button */}
        <div className="p-4 shrink-0">
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 justify-center bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-red-900/50 group"
          >
            <Plus size={20} className="group-hover:rotate-90 transition-transform" />
            <span>New Conversation</span>
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 scrollbar-thin scrollbar-thumb-blue-700 scrollbar-track-transparent">
          {sessions.length === 0 ? (
            <div className="text-blue-300/60 text-center py-10 text-sm italic px-4">
              "Every hero has a beginning. Start your journey."
            </div>
          ) : (
            sessions.slice().reverse().map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  onSelectSession(session.id);
                  if (window.innerWidth < 768) setIsOpen(false);
                }}
                className={`
                  group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                  ${currentSessionId === session.id 
                    ? 'bg-blue-800 text-yellow-400 border-l-4 border-yellow-400' 
                    : 'text-blue-100 hover:bg-blue-800/50 hover:text-white border-l-4 border-transparent'}
                `}
              >
                <MessageSquare size={18} className={`shrink-0 ${currentSessionId === session.id ? 'text-yellow-400' : 'text-blue-400'}`} />
                
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="truncate text-sm font-medium">
                    {session.title}
                  </div>
                  <div className={`text-[10px] ${currentSessionId === session.id ? 'text-yellow-200/80' : 'text-blue-400/80 group-hover:text-blue-300'}`}>
                    Created: {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <button
                  onClick={(e) => onDeleteSession(session.id, e)}
                  className={`
                    p-1.5 rounded-md text-blue-400 hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0
                  `}
                  title="Delete chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-blue-800 bg-blue-900/80 shrink-0">
          {user ? (
            <div className="flex items-center gap-3 mb-3">
               <div className="w-10 h-10 rounded-full bg-blue-700 overflow-hidden border-2 border-yellow-400 shrink-0">
                  {user.photoUrl ? (
                    <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white">
                      <UserIcon size={20} />
                    </div>
                  )}
               </div>
               <div className="flex-1 min-w-0">
                 <div className="text-white font-semibold text-sm truncate">{user.name}</div>
                 <div className="text-blue-300 text-xs truncate">{user.email}</div>
               </div>
            </div>
          ) : null}
          
          <button 
             onClick={onLogout}
             className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-800/50 hover:bg-red-900/50 text-blue-200 hover:text-red-200 transition-colors text-sm"
          >
             <LogOut size={16} />
             <span>Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );
};