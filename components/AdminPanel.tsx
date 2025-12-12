import React, { useEffect, useState } from 'react';
import { User, ChatSession } from '../types';
import { getAllUsers, getUserSessions } from '../services/adminService';
import { LogOut, Users, MessageSquare, Search, ChevronRight, Database, Loader2, FileCode, Copy, Check, AlertTriangle } from 'lucide-react';
import { MessageBubble } from './MessageBubble';

interface AdminPanelProps {
  onLogout: () => void;
  currentUser: User;
}

const SUPABASE_SCHEMA_SQL = `
-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 1. USERS TABLE
create table if not exists public.users (
  id uuid references auth.users not null primary key,
  email text,
  name text,
  photo_url text,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. CHAT SESSIONS TABLE
create table if not exists public.chat_sessions (
  id text primary key, -- UUID string from frontend
  user_id uuid references public.users(id) on delete cascade not null,
  title text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. MESSAGES TABLE
create table if not exists public.messages (
  id text primary key, -- UUID string from frontend
  session_id text references public.chat_sessions(id) on delete cascade not null,
  role text not null, -- 'user' or 'model'
  text text,
  image_url text,
  timestamp bigint,
  is_error boolean default false
);

-- 4. USER MEMORIES TABLE
create table if not exists public.user_memories (
  user_id uuid references public.users(id) on delete cascade primary key,
  memory_text text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- HELPER FUNCTIONS (Prevents Infinite Recursion)

-- Securely check if the current user is an admin without triggering RLS loops
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.users
    where id = auth.uid() and is_admin = true
  );
end;
$$ language plpgsql security definer;

-- ROW LEVEL SECURITY (RLS)

-- Users Table
alter table public.users enable row level security;

drop policy if exists "Users can view their own profile" on public.users;
create policy "Users can view their own profile"
  on public.users for select
  using ( auth.uid() = id );

drop policy if exists "Admins can view all profiles" on public.users;
create policy "Admins can view all profiles"
  on public.users for select
  using ( public.is_admin() ); -- Uses function to avoid recursion

drop policy if exists "Users can update their own profile" on public.users;
create policy "Users can update their own profile"
  on public.users for update
  using ( auth.uid() = id );

drop policy if exists "Admins can update all profiles" on public.users;
create policy "Admins can update all profiles"
  on public.users for update
  using ( public.is_admin() );

-- Fix for "Key is not present in table users" error:
-- Allows users to insert their own profile if the trigger failed or if using fallback logic
drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile"
  on public.users for insert
  with check ( auth.uid() = id );

-- Chat Sessions Table
alter table public.chat_sessions enable row level security;

drop policy if exists "Users can view own sessions" on public.chat_sessions;
create policy "Users can view own sessions"
  on public.chat_sessions for select
  using ( auth.uid() = user_id );

drop policy if exists "Admins can view all sessions" on public.chat_sessions;
create policy "Admins can view all sessions"
  on public.chat_sessions for select
  using ( public.is_admin() );

drop policy if exists "Users can insert own sessions" on public.chat_sessions;
create policy "Users can insert own sessions"
  on public.chat_sessions for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can update own sessions" on public.chat_sessions;
create policy "Users can update own sessions"
  on public.chat_sessions for update
  using ( auth.uid() = user_id );

drop policy if exists "Users can delete own sessions" on public.chat_sessions;
create policy "Users can delete own sessions"
  on public.chat_sessions for delete
  using ( auth.uid() = user_id );

-- Messages Table
alter table public.messages enable row level security;

drop policy if exists "Users can view messages of their sessions" on public.messages;
create policy "Users can view messages of their sessions"
  on public.messages for select
  using (
    exists (
      select 1 from public.chat_sessions
      where id = messages.session_id
      and (user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "Users can insert messages to their sessions" on public.messages;
create policy "Users can insert messages to their sessions"
  on public.messages for insert
  with check (
     exists (
      select 1 from public.chat_sessions
      where id = messages.session_id
      and user_id = auth.uid()
    )
  );

-- User Memories Table
alter table public.user_memories enable row level security;

drop policy if exists "Users can view own memory" on public.user_memories;
create policy "Users can view own memory"
  on public.user_memories for select
  using ( auth.uid() = user_id );

drop policy if exists "Users can upsert own memory" on public.user_memories;
create policy "Users can upsert own memory"
  on public.user_memories for insert
  with check ( auth.uid() = user_id );
  
drop policy if exists "Users can update own memory" on public.user_memories;
create policy "Users can update own memory"
  on public.user_memories for update
  using ( auth.uid() = user_id );

-- TRIGGERS

-- Handle New User Trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name, is_admin)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    -- AUTO-ADMIN CHECK:
    case when new.email = 'msmraqeeb@gmail.com' then true else false end
  )
  on conflict (id) do nothing; -- Prevent error if profile already exists
  return new;
end;
$$ language plpgsql security definer;

-- Trigger execution
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. CRITICAL: FIX ADMIN ACCESS & EMAIL CONFIRMATION
UPDATE auth.users 
SET email_confirmed_at = timezone('utc', now()) 
WHERE email = 'msmraqeeb@gmail.com';

UPDATE public.users 
SET is_admin = true 
WHERE email = 'msmraqeeb@gmail.com';
`;

export const AdminPanel: React.FC<AdminPanelProps> = ({ onLogout, currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userSessions, setUserSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  
  // Setup Mode detects if we are in the 'bypass' state
  const isSetupMode = currentUser.id === 'temp-admin-setup';
  
  // View State: 'users' or 'schema'
  const [currentView, setCurrentView] = useState<'users' | 'schema'>(isSetupMode ? 'schema' : 'users');
  const [isCopied, setIsCopied] = useState(false);

  // Force Schema View if in Setup Mode
  useEffect(() => {
    if (isSetupMode) setCurrentView('schema');
  }, [isSetupMode]);

  // Load users on mount (Only if NOT in setup mode, as we have no RLS access)
  useEffect(() => {
    if (isSetupMode) {
        setIsLoadingUsers(false);
        return;
    }
    const loadUsers = async () => {
        setIsLoadingUsers(true);
        const allUsers = await getAllUsers();
        setUsers(allUsers);
        setIsLoadingUsers(false);
    };
    loadUsers();
  }, [isSetupMode]);

  // Load sessions when a user is selected
  useEffect(() => {
    if (selectedUser) {
      const loadSessions = async () => {
          setIsLoadingSessions(true);
          const sessions = await getUserSessions(selectedUser.id);
          setUserSessions(sessions);
          setIsLoadingSessions(false);
          setSelectedSession(null);
      };
      loadSessions();
    } else {
      setUserSessions([]);
      setSelectedSession(null);
    }
  }, [selectedUser]);

  const filteredUsers = users.filter(u => 
    (u.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
    (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const handleCopySchema = async () => {
      try {
          await navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
          console.error("Failed to copy", err);
      }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      
      {/* Sidebar: Navigation & User List */}
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
          
          {/* View Toggle */}
          <div className="flex gap-2 mb-4">
              <button 
                disabled={isSetupMode}
                onClick={() => { setCurrentView('users'); setSelectedUser(null); }}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${currentView === 'users' ? 'bg-red-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'} ${isSetupMode ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                  Users
              </button>
              <button 
                onClick={() => { setCurrentView('schema'); setSelectedUser(null); }}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${currentView === 'schema' ? 'bg-red-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
              >
                  DB Schema
              </button>
          </div>

          {currentView === 'users' && !isSetupMode && (
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
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
           {isSetupMode ? (
               <div className="p-6 text-center">
                   <AlertTriangle className="mx-auto text-yellow-500 mb-2" size={32} />
                   <h3 className="text-white font-bold mb-2">Setup Mode</h3>
                   <p className="text-slate-400 text-xs mb-4">
                       You are currently in offline setup mode because your email is not confirmed in the DB.
                   </p>
                   <p className="text-slate-400 text-xs">
                       Copy the SQL from the right panel and run it in Supabase to fix your account.
                   </p>
               </div>
           ) : currentView === 'users' ? (
                isLoadingUsers ? (
                    <div className="flex items-center justify-center p-8 text-slate-500">
                        <Loader2 className="animate-spin mr-2" /> Loading...
                    </div>
                ) : filteredUsers.length === 0 ? (
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
                            <div className="font-medium truncate flex items-center gap-2">
                                {user.name} 
                                {user.isAdmin && <span className="text-[10px] bg-red-600 px-1 rounded text-white">ADMIN</span>}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{user.email}</div>
                        </div>
                        <ChevronRight size={16} className={`ml-auto ${selectedUser?.id === user.id ? 'text-red-500' : 'text-slate-600'}`} />
                    </div>
                    ))
                )
           ) : (
                <div className="p-4 text-slate-500 text-sm">
                   <p className="mb-4">Use the schema on the right to configure your Supabase project.</p>
                   <ol className="list-decimal pl-4 space-y-2">
                       <li>Copy the SQL.</li>
                       <li>Go to Supabase Dashboard.</li>
                       <li>Open SQL Editor.</li>
                       <li>Paste & Run.</li>
                   </ol>
                </div>
           )}
        </div>
        <div className="p-3 bg-slate-950 text-xs text-slate-600 text-center border-t border-slate-800">
          Logged in as {currentUser.email}
        </div>
      </div>

      {/* Main Content Area */}
      {currentView === 'schema' ? (
          // SCHEMA VIEW
          <div className="flex-1 bg-slate-900 flex flex-col overflow-hidden">
              <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950">
                   <div className="flex items-center gap-2 text-white font-bold">
                       <FileCode size={20} className="text-yellow-400" />
                       Supabase SQL Schema
                   </div>
                   <button 
                     onClick={handleCopySchema}
                     className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                   >
                       {isCopied ? <Check size={16} /> : <Copy size={16} />}
                       {isCopied ? 'Copied!' : 'Copy SQL'}
                   </button>
              </div>
              <div className="flex-1 overflow-auto p-0 bg-[#1e1e1e]">
                  <pre className="p-6 text-xs md:text-sm font-mono text-green-400 whitespace-pre-wrap leading-relaxed">
                      {SUPABASE_SCHEMA_SQL}
                  </pre>
              </div>
          </div>
      ) : (
          // USER CHATS VIEW
          <>
            {/* Middle: Session List */}
            <div className={`w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 ${!selectedUser ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="p-4 border-b border-slate-800 bg-slate-900">
                    <h2 className="font-semibold text-slate-300 flex items-center gap-2">
                    <MessageSquare size={18} />
                    {selectedUser ? 'User Chats' : 'Select a User'}
                    </h2>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {isLoadingSessions ? (
                        <div className="flex items-center justify-center p-8 text-slate-500">
                            <Loader2 className="animate-spin mr-2" /> Loading...
                        </div>
                    ) : selectedUser && userSessions.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-sm">This user has no chat history.</div>
                    ) : (
                        userSessions.map(session => (
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
                        ))
                    )}
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
          </>
      )}
    </div>
  );
};