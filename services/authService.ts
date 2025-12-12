import { supabase } from './supabaseClient';
import { User } from '../types';

const ADMIN_EMAIL = 'msmraqeeb@gmail.com';

// Cast supabase.auth to any to bypass type mismatch issues with Supabase SDK versions
const auth = supabase.auth as any;

export const login = async (email: string, password: string): Promise<User> => {
  const { data, error } = await auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  if (!data.user) throw new Error("No user data returned");

  // Fetch user profile
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();

  // If profile is missing (e.g. user existed before schema, or trigger failed), create it now.
  if (profileError || !profile) {
      console.warn("User profile missing, creating fallback profile...");
      
      const newProfile = {
          id: data.user.id,
          email: data.user.email || '',
          name: data.user.user_metadata?.full_name || 'User',
          // Force admin if it matches the specific email
          is_admin: data.user.email === ADMIN_EMAIL
      };

      const { error: insertError } = await supabase
        .from('users')
        .upsert(newProfile);

      if (insertError) {
          console.error("Failed to create fallback profile:", JSON.stringify(insertError, null, 2));
          // Return a basic object so login doesn't completely fail, though DB ops might fail later
          return {
              id: data.user.id,
              email: data.user.email || '',
              name: 'User',
              isAdmin: newProfile.is_admin
          };
      }

      return {
          id: newProfile.id,
          email: newProfile.email,
          name: newProfile.name,
          isAdmin: newProfile.is_admin
      };
  }

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    photoUrl: profile.photo_url,
    isAdmin: profile.is_admin
  };
};

export const register = async (email: string, password: string, name: string): Promise<User> => {
  const { data, error } = await auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
      }
    }
  });

  if (error) throw error;
  if (!data.user) throw new Error("Registration failed");

  // Attempt to auto-login if the session is missing
  // (This handles cases where the user has disabled email confirmation in Supabase but signUp didn't return the session immediately)
  if (!data.session) {
      try {
          await auth.signInWithPassword({ email, password });
      } catch (e) {
          // If this fails, it might truly require confirmation, but we proceed to let the UI try.
          console.warn("Auto-login after registration failed:", e);
      }
  }

  // Allow a moment for the SQL Trigger to create the profile
  // But return the user object immediately for UI responsiveness
  return {
    id: data.user.id,
    email: data.user.email || email,
    name: name,
    isAdmin: email === ADMIN_EMAIL // Optimistic admin check
  };
};

export const logout = async (): Promise<void> => {
  const { error } = await auth.signOut();
  if (error) console.error('Error logging out:', error);
};

export const getCurrentUser = async (): Promise<User | null> => {
    const { data: { session } } = await auth.getSession();
    if (!session?.user) return null;

    const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();
    
    if (profile) {
        return {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            photoUrl: profile.photo_url,
            isAdmin: profile.is_admin
        };
    } else {
        // If logged in but no profile, return basic info so we don't loop indefinitely
        return {
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.full_name || 'User',
            isAdmin: session.user.email === ADMIN_EMAIL
        }
    }
}