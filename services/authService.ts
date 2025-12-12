import { User } from '../types';
import { v4 as uuidv4 } from 'uuid';

const USERS_STORAGE_KEY = 'shakbot_users';
const ADMIN_EMAIL = 'msmraqeeb@gmail.com';
const ADMIN_PASS = 'msm039raqeeb';

// Helper to get all registered users from local storage with error handling
const getUsers = (): any[] => {
  try {
    const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
    if (!usersJson) return [];
    
    const users = JSON.parse(usersJson);
    return Array.isArray(users) ? users : [];
  } catch (e) {
    console.error("Error reading users from storage:", e);
    // Return empty array but DO NOT wipe storage here to prevent data loss on transient errors
    return [];
  }
};

export const login = async (email: string, password: string): Promise<User> => {
  // 1. Check for Hardcoded Admin Credentials
  if (email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASS) {
      return {
          id: 'admin-master-id',
          name: 'Super Admin',
          email: ADMIN_EMAIL,
          isAdmin: true
      };
  }

  // 2. Normal User Login
  const users = getUsers();
  
  // Case-insensitive email match
  const user = users.find((u: any) => 
    u.email && u.email.trim().toLowerCase() === email.trim().toLowerCase() && 
    u.password === password
  );

  if (user) {
    // Return user without password
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  throw new Error('Invalid email or password');
};

export const register = async (email: string, password: string, name: string): Promise<User> => {
  const users = getUsers();
  const cleanEmail = email.trim().toLowerCase();
  
  if (users.find((u: any) => u.email && u.email.toLowerCase() === cleanEmail)) {
    throw new Error('User already exists with this email');
  }

  const newUser = {
    id: uuidv4(),
    email: cleanEmail,
    password, // Stored locally for this demo.
    name: name.trim(),
    photoUrl: undefined 
  };

  users.push(newUser);
  
  try {
    const jsonString = JSON.stringify(users);
    localStorage.setItem(USERS_STORAGE_KEY, jsonString);
    
    // Verification step: Ensure it was written
    const verify = localStorage.getItem(USERS_STORAGE_KEY);
    if (!verify) {
        throw new Error("Storage write verification failed.");
    }
  } catch (e: any) {
    console.error("Failed to save user to storage", e);
    if (e.name === 'QuotaExceededError' || e.code === 22) {
         throw new Error("Browser storage is full. Please clear some space or delete old conversations.");
    }
    throw new Error("Failed to save account. Storage might be full or disabled.");
  }

  const { password: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword as User;
};

export const logout = async (): Promise<void> => {
    // Immediate resolve
    return Promise.resolve();
};