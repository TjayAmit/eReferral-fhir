import { promises as fs } from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'users.json');

export type Role = "admin" | "practitioner";

export interface UserAccount {
  id: string;
  email: string;
  password: string;
  role: Role;
  practitionerId?: string;
}

const INITIAL: UserAccount[] = [
  { id: "admin-001", email: "admin", password: "@admin123", role: "admin" },
];

async function readUsers(): Promise<UserAccount[]> {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(INITIAL, null, 2), 'utf-8');
    return INITIAL;
  }
}

async function writeUsers(users: UserAccount[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

export async function getAllUsers(): Promise<UserAccount[]> {
  return readUsers();
}

export async function getUserById(id: string): Promise<UserAccount | null> {
  const users = await readUsers();
  return users.find((u) => u.id === id) ?? null;
}

export async function getUsersByPractitionerId(practitionerId: string): Promise<UserAccount[]> {
  const users = await readUsers();
  return users.filter((u) => u.practitionerId === practitionerId);
}

export async function createUser(account: Omit<UserAccount, 'id'>): Promise<UserAccount> {
  const users = await readUsers();
  if (users.find((u) => u.email === account.email)) throw new Error("Email already exists");
  const newUser: UserAccount = { ...account, id: `user-${Date.now()}` };
  await writeUsers([...users, newUser]);
  return newUser;
}

export async function updateUser(id: string, updates: Partial<Omit<UserAccount, 'id'>>): Promise<UserAccount> {
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error("User not found");
  if (updates.email && updates.email !== users[idx].email) {
    if (users.find((u) => u.email === updates.email)) throw new Error("Email already exists");
  }
  users[idx] = { ...users[idx], ...updates };
  await writeUsers(users);
  return users[idx];
}

export async function deleteUser(id: string): Promise<void> {
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error("User not found");
  users.splice(idx, 1);
  await writeUsers(users);
}

export async function validateCredentials(email: string, password: string): Promise<UserAccount | null> {
  const users = await readUsers();
  const user = users.find((u) => u.email === email);
  if (!user || user.password !== password) return null;
  return user;
}
