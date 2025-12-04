import { User } from '../types';
import { v4 as uuidv4 } from 'uuid';

const USERS_STORAGE_KEY = 'shakbot_users';

// Helper to get all registered users from local storage
const getUsers = (): any[] => {
  const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
  return usersJson ? JSON.parse(usersJson) : [];
};

export const login = async (email: string, password: string): Promise<User> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));

  const users = getUsers();
  const user = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

  if (user) {
    // Return user without password
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  throw new Error('Invalid email or password');
};

export const register = async (email: string, password: string, name: string): Promise<User> => {
  await new Promise(resolve => setTimeout(resolve, 800));

  const users = getUsers();
  
  if (users.find((u: any) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('User already exists with this email');
  }

  const newUser = {
    id: uuidv4(),
    email,
    password, // In a real app, never store passwords in plain text!
    name,
    photoUrl: undefined // Local users might not have a photo initially
  };

  users.push(newUser);
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));

  const { password: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword as User;
};

export const logout = async (): Promise<void> => {
    return new Promise((resolve) => {
        setTimeout(resolve, 300);
    });
};