import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, UserCircle, HelpCircle, ArrowRight } from 'lucide-react';
import { GOOGLE_CLIENT_ID, parseJwt } from '../services/authService';
import { User } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
  isLoading: boolean;
}

// Updated with the user provided Unsplash URL
const SHAKIL_AVATAR_URL = "https://images.unsplash.com/photo-1633957897986-70e83293f3ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxyb2JvdCUyMGF2YXRhcnxlbnwwfHx8fDE3NjQ2NTQwMjh8MA&ixlib=rb-4.1.0&q=80&w=1080";

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, isLoading }) => {
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [configError, setConfigError] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleGuestLogin = () => {
    // Simulate a guest user session
    const guestUser: User = {
        id: `guest-${Date.now()}`,
        name: 'Guest User',
        email: 'guest@shakbot.ai',
        photoUrl: undefined 
    };
    onLoginSuccess(guestUser);
  };

  useEffect(() => {
    // Check if Client ID is configured
    // Cast to string to avoid TypeScript error when comparing specific string literal type
    if (!GOOGLE_CLIENT_ID || (GOOGLE_CLIENT_ID as string) === "YOUR_GOOGLE_CLIENT_ID_HERE") {
        setConfigError(true);
        return;
    }

    const loadGoogleButton = () => {
      const google = (window as any).google;
      if (google) {
        try {
          google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response: any) => {
              const decoded: any = parseJwt(response.credential);
              if (decoded) {
                  const user: User = {
                      id: decoded.sub,
                      name: decoded.name,
                      email: decoded.email,
                      photoUrl: decoded.picture
                  };
                  onLoginSuccess(user);
              }
            },
            auto_select: false,
            cancel_on_tap_outside: false
          });

          if (googleButtonRef.current) {
            google.accounts.id.renderButton(
              googleButtonRef.current,
              { 
                theme: 'outline', 
                size: 'large', 
                shape: 'rectangular',
                text: 'signin_with',
                width: 280
              }
            );
          }
        } catch (e) {
          console.error("Google Sign-In initialization failed:", e);
        }
      }
    };

    // Retry if script isn't loaded yet
    const interval = setInterval(() => {
        if ((window as any).google) {
            loadGoogleButton();
            clearInterval(interval);
        }
    }, 100);

    return () => clearInterval(interval);
  }, [onLoginSuccess]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-red-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden transform transition-all hover:scale-[1.01]">
        
        {/* Header Section */}
        <div className="bg-slate-50 p-8 text-center border-b border-slate-100">
          <div className="w-24 h-24 bg-red-600 rounded-full mx-auto flex items-center justify-center shadow-lg mb-6 border-4 border-yellow-400 overflow-hidden">
             <img src={SHAKIL_AVATAR_URL} alt="Shakil AI" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-bold text-blue-900 mb-2">Welcome to ShakBot</h1>
          <p className="text-slate-500">Your intelligent, multilingual heroic assistant.</p>
        </div>

        {/* Action Section */}
        <div className="p-8 space-y-6 flex flex-col items-center">
          
          {/* Guest Login Button - Now Primary for Reliability */}
          <button 
                onClick={handleGuestLogin}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-red-500/30 flex items-center justify-center gap-2 group"
            >
                <span>Start Chatting Now</span>
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-slate-400 uppercase tracking-wider font-semibold">Or Sign In</span>
            </div>
          </div>
          
          {/* Google Button */}
          {configError ? (
            <div className="w-full bg-amber-50 text-amber-900 p-4 rounded-xl text-sm border border-amber-200 shadow-sm flex items-start gap-3">
               <AlertTriangle size={20} className="shrink-0 text-amber-600" />
               <div>
                   <h3 className="font-semibold text-amber-800">Configuration Error</h3>
                   <p className="opacity-90 leading-relaxed">Google Client ID is missing or invalid.</p>
               </div>
            </div>
          ) : (
             <div className="w-full flex justify-center min-h-[44px]">
                 <div ref={googleButtonRef}></div>
             </div>
          )}
          
          {isLoading && (
              <div className="flex items-center gap-2 text-blue-600">
                  <Loader2 className="animate-spin" size={20} />
                  <span>Processing...</span>
              </div>
          )}

          {/* Help / Error Explanation */}
          <div className="w-full">
            <button 
                onClick={() => setShowHelp(!showHelp)}
                className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 mx-auto mt-2 transition-colors"
            >
                <HelpCircle size={12} />
                <span>Google Sign-In not working?</span>
            </button>
            
            {showHelp && (
                <div className="mt-3 bg-blue-50 p-3 rounded-lg text-xs text-blue-900 leading-relaxed border border-blue-100 animate-in fade-in slide-in-from-top-2">
                    <p className="mb-2"><strong>Error 401: invalid_client</strong> means your preview URL hasn't been added to your Google Cloud "Authorized Origins".</p>
                    <p>Use the <strong>Start Chatting Now</strong> button above to bypass this and use the app immediately.</p>
                </div>
            )}
          </div>

          <p className="text-center text-xs text-slate-400 leading-relaxed pt-2">
            By continuing, you agree to ShakBot's <a href="#" className="text-blue-600 hover:underline">Terms of Service</a> and <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
      
      <div className="mt-8 text-blue-200 text-sm opacity-80 font-light tracking-wide">
        Powered by Gemini 2.5
      </div>
    </div>
  );
};