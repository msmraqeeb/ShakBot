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
          className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-30
        w-[85vw] md:w-72 bg-slate-950/80 backdrop-blur-xl flex flex-col transition-transform duration-300 ease-in-out h-dvh
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        border-r border-white/10 shadow-2xl
      `}>
        
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 h-16 md:h-auto">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-red-600 flex items-center justify-center overflow-hidden border-2 border-yellow-400 shadow-lg">
                    <img src={SHAKIL_AVATAR_URL} alt="Shakil Logo" className="w-full h-full object-cover" />
                </div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                    Shak<span className="text-yellow-400">Bot</span>
                </h1>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              className="md:hidden text-slate-400 hover:text-white p-2"
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
            className="w-full flex items-center gap-2 justify-center bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-red-900/50 group touch-manipulation border border-white/10"
          >
            <Plus size={20} className="group-hover:rotate-90 transition-transform" />
            <span>New Conversation</span>
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {sessions.length === 0 ? (
            <div className="text-slate-500/60 text-center py-10 text-sm italic px-4">
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
                  group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors active:scale-[0.98]
                  ${currentSessionId === session.id 
                    ? 'bg-blue-900/50 text-yellow-400 border-l-4 border-yellow-400' 
                    : 'text-slate-300 hover:bg-white/5 hover:text-white border-l-4 border-transparent'}
                `}
              >
                <MessageSquare size={18} className={`shrink-0 ${currentSessionId === session.id ? 'text-yellow-400' : 'text-slate-500'}`} />
                
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="truncate text-sm font-medium">
                    {session.title}
                  </div>
                  <div className={`text-[10px] ${currentSessionId === session.id ? 'text-yellow-200/60' : 'text-slate-500 group-hover:text-slate-400'}`}>
                    {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <button
                  onClick={(e) => onDeleteSession(session.id, e)}
                  className={`
                    p-2 rounded-md text-slate-500 hover:bg-red-500/20 hover:text-red-400 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all shrink-0
                  `}
                  title="Delete chat"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-white/10 bg-slate-900/40 shrink-0 pb-safe">
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
                 <div className="text-slate-400 text-xs truncate">{user.email}</div>
               </div>
            </div>
          ) : null}
          
          <button 
             onClick={onLogout}
             className="w-full flex items-center justify-center gap-2 py-3 md:py-2 rounded-lg bg-white/5 hover:bg-red-900/50 text-slate-300 hover:text-red-200 transition-colors text-sm border border-white/5"
          >
             <LogOut size={16} />
             <span>Sign Out</span>
          </button>
          
          <div className="mt-4 text-center">
            <p className="text-[10px] text-slate-500">
                Proudly presented by: <a href="https://shakilmahmud.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">Shakil Mahmud</a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};