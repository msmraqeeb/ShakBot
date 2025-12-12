import React, { useEffect, useState } from 'react';
import { User, ChatSession } from '../types';
import { getAllUsers, getUserSessions } from '../services/adminService';
import { LogOut, Users, MessageSquare, Search, ChevronRight, Database } from 'lucide-react';
import { MessageBubble } from './MessageBubble';

interface AdminPanelProps {
  onLogout: () => void;
  currentUser: User;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onLogout, currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userSessions, setUserSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Load users on mount
  useEffect(() => {
    const allUsers = getAllUsers();
    setUsers(allUsers);
  }, []);

  // Load sessions when a user is selected
  useEffect(() => {
    if (selectedUser) {
      const sessions = getUserSessions(selectedUser.id);
      setUserSessions(sessions.reverse()); // Show newest first
      // Reset selected session when user changes
      setSelectedSession(null);
    } else {
      setUserSessions([]);
      setSelectedSession(null);
    }
  }, [selectedUser]);

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      
      {/* Sidebar: User List */}
      <div className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-4">
             <h1 className="text-xl font-bold text-red-500 flex items-center gap-2">
                <Database size={20} />
                Admin Panel
             </h1>
             <button onClick={onLogout} className="text-slate-400 hover:text-white" title="Logout">
                <LogOut size={18} />
             </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
           {filteredUsers.length === 0 ? (
             <div className="p-4 text-center text-slate-500 text-sm">No users found.</div>
           ) : (
             filteredUsers.map(user => (
               <div 
                 key={user.id}
                 onClick={() => setSelectedUser(user)}
                 className={`
                    p-4 border-b border-slate-800/50 cursor-pointer transition-colors flex items-center gap-3
                    ${selectedUser?.id === user.id ? 'bg-red-900/20 border-l-4 border-l-red-500' : 'hover:bg-slate-900 border-l-4 border-l-transparent'}
                 `}
               >
                 <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                    <Users size={18} className="text-slate-400" />
                 </div>
                 <div className="min-w-0">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-xs text-slate-500 truncate">{user.email}</div>
                 </div>
                 <ChevronRight size={16} className={`ml-auto ${selectedUser?.id === user.id ? 'text-red-500' : 'text-slate-600'}`} />
               </div>
             ))
           )}
        </div>
        <div className="p-3 bg-slate-950 text-xs text-slate-600 text-center border-t border-slate-800">
          Logged in as {currentUser.email}
        </div>
      </div>

      {/* Middle: Session List */}
      <div className={`w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 ${!selectedUser ? 'opacity-50 pointer-events-none' : ''}`}>
         <div className="p-4 border-b border-slate-800 bg-slate-900">
            <h2 className="font-semibold text-slate-300 flex items-center gap-2">
               <MessageSquare size={18} />
               {selectedUser ? 'User Chats' : 'Select a User'}
            </h2>
         </div>
         <div className="flex-1 overflow-y-auto">
            {selectedUser && userSessions.length === 0 && (
                <div className="p-8 text-center text-slate-500 text-sm">This user has no chat history.</div>
            )}
            {userSessions.map(session => (
                <div 
                    key={session.id}
                    onClick={() => setSelectedSession(session)}
                    className={`
                        p-4 cursor-pointer border-b border-slate-800/50 hover:bg-slate-800/50 transition-all
                        ${selectedSession?.id === session.id ? 'bg-blue-900/20' : ''}
                    `}
                >
                    <div className="font-medium text-sm text-slate-200 mb-1 line-clamp-2">{session.title}</div>
                    <div className="text-xs text-slate-500">
                        {new Date(session.createdAt).toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                        {session.messages.length} messages
                    </div>
                </div>
            ))}
         </div>
      </div>

      {/* Right: Chat View */}
      <div className="flex-1 bg-slate-950 flex flex-col overflow-hidden relative">
         {!selectedSession ? (
             <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                 <Database size={48} className="mb-4 opacity-20" />
                 <p>Select a chat session to view details.</p>
             </div>
         ) : (
             <>
                <div className="h-14 border-b border-slate-800 flex items-center px-6 bg-slate-900/50 backdrop-blur-md">
                   <div>
                       <h3 className="font-bold text-white">{selectedSession.title}</h3>
                       <span className="text-xs text-slate-400">{selectedSession.id}</span>
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                   <div className="max-w-3xl mx-auto">
                       {selectedSession.messages.map(msg => (
                           <MessageBubble key={msg.id} message={msg} />
                       ))}
                   </div>
                </div>
             </>
         )}
      </div>
    </div>
  );
};
