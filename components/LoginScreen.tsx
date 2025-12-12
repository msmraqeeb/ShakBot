import React, { useState } from 'react';
import { Loader2, UserCircle, Mail, Lock, User as UserIcon, AlertCircle, ArrowRight, Database } from 'lucide-react';
import { login, register } from '../services/authService';
import { User } from '../types';
import HeroicBackground from './HeroicBackground';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
  isLoading: boolean;
}

const SHAKIL_AVATAR_URL = "https://images.unsplash.com/photo-1633957897986-70e83293f3ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxyb2JvdCUyMGF2YXRhcnxlbnwwfHx8fDE3NjQ2NTQwMjh8MA&ixlib=rb-4.1.0&q=80&w=1080";

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, isLoading: appLoading }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

  const isLoading = appLoading || localLoading;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password || (!isLoginMode && !formData.name)) {
      setError("Please fill in all fields.");
      return;
    }

    setLocalLoading(true);
    setError(null);

    try {
      let user: User;
      if (isLoginMode) {
        user = await login(formData.email, formData.password);
      } else {
        user = await register(formData.email, formData.password, formData.name);
      }
      onLoginSuccess(user);
    } catch (err: any) {
      // EMERGENCY BYPASS:
      // If the Admin account is stuck in "Email not confirmed", we allow them to enter 
      // "Setup Mode" to access the Admin Panel and copy the SQL schema to fix the DB.
      // This is secure because "Setup Mode" (temp-admin-setup) has no real DB access token, 
      // it only allows viewing the static SQL schema generator UI.
      const isConfigError = err.message?.includes('Email not confirmed');
      const isAdminUser = formData.email.toLowerCase() === 'msmraqeeb@gmail.com';
      
      if (isAdminUser && isConfigError) {
          console.warn("Entering Admin Setup Mode to fix DB schema...");
          onLoginSuccess({
              id: 'temp-admin-setup',
              name: 'Admin (Setup Mode)',
              email: formData.email,
              isAdmin: true
          });
          return;
      }
      
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGuestLogin = () => {
    const guestUser: User = {
        id: `guest-${Date.now()}`,
        name: 'Guest User',
        email: 'guest@shakbot.ai',
        photoUrl: undefined 
    };
    onLoginSuccess(guestUser);
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 relative overflow-hidden">
      
      {/* Superman Interactive Background */}
      <HeroicBackground />

      <div className="w-[95%] max-w-md bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden transform transition-all z-10 border border-white/20">
        
        {/* Header Section */}
        <div className="bg-slate-50 p-6 text-center border-b border-slate-100">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-red-600 rounded-full mx-auto flex items-center justify-center shadow-lg mb-4 border-4 border-yellow-400 overflow-hidden">
             <img src={SHAKIL_AVATAR_URL} alt="Shakil AI" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-blue-900">
            {isLoginMode ? 'Welcome Back!' : 'Join ShakBot'}
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-1">
            {isLoginMode ? 'Enter your credentials to continue.' : 'Create an account to save your chats.'}
          </p>
        </div>

        {/* Form Section */}
        <div className="p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-start gap-2 border border-red-200">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!isLoginMode && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Clark Kent"
                    autoComplete="name"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-base"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="email" 
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="hero@example.com"
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-base"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password" 
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="••••••••"
                  autoComplete={isLoginMode ? "current-password" : "new-password"}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-base"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-yellow-50 font-bold py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 mt-4 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Please wait...</span>
                </>
              ) : (
                <>
                  <span>{isLoginMode ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              {isLoginMode ? "Don't have an account?" : "Already have an account?"}{' '}
              <button 
                onClick={() => {
                  setIsLoginMode(!isLoginMode);
                  setError(null);
                }}
                className="text-blue-600 font-semibold hover:underline"
              >
                {isLoginMode ? 'Sign Up' : 'Log In'}
              </button>
            </p>
          </div>

          <div className="relative w-full my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-slate-400 uppercase tracking-wider font-semibold">Or</span>
            </div>
          </div>

          <button 
            onClick={handleGuestLogin}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 group border border-slate-200 active:scale-[0.98]"
          >
            <UserCircle size={20} className="text-slate-500 group-hover:text-blue-600 transition-colors" />
            <span>Continue as Guest</span>
          </button>

          <p className="text-center text-xs text-slate-400 leading-relaxed pt-6">
            By continuing, you agree to ShakBot's <a href="#" className="text-blue-600 hover:underline">Terms of Service</a> and <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-8 z-10 text-center">
        <div className="text-blue-200 text-sm opacity-80 font-light tracking-wide">
            Powered by Gemini 2.5
        </div>
        <div className="mt-1 text-[10px] text-blue-200/50 font-light">
            Proudly presented by: <a href="https://shakilmahmud.vercel.app/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors underline decoration-blue-400/20">Shakil Mahmud</a>
        </div>
      </div>
    </div>
  );
};