// User storage for linking FHIR Practitioners to local accounts
// Since FHIR server has no auth, we maintain our own user registry

export type Role = "admin" | "practitioner" | "user";

export interface UserAccount {
  id: string;
  username: string;
  email?: string; // Email for practitioner accounts
  password: string; // In production, this should be hashed
  role: Role;
  practitionerId?: string; // Link to FHIR Practitioner resource
  organizationId?: string; // Link to FHIR Organization resource
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

const STORAGE_KEY = "eref_users";

// Initialize with admin account
const INITIAL_USERS: UserAccount[] = [
  {
    id: "admin-001",
    username: "admin",
    password: "@admin123",
    role: "admin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    active: true,
  },
];

export function getUsers(): UserAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Initialize with default users
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_USERS));
      return INITIAL_USERS;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.error("Failed to load users:", error);
    return INITIAL_USERS;
  }
}

export function saveUsers(users: UserAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    console.error("Failed to save users:", error);
    throw new Error("Failed to save user data");
  }
}

export function findUserByUsername(username: string): UserAccount | undefined {
  const users = getUsers();
  return users.find((u) => u.username === username && u.active);
}

export function findUserByEmail(email: string): UserAccount | undefined {
  const users = getUsers();
  return users.find((u) => u.email === email && u.active);
}

export function findUserById(id: string): UserAccount | undefined {
  const users = getUsers();
  return users.find((u) => u.id === id);
}

export function createUser(account: Omit<UserAccount, "id" | "createdAt" | "updatedAt">): UserAccount {
  const users = getUsers();
  
  // Check if username already exists
  if (users.find((u) => u.username === account.username)) {
    throw new Error("Username already exists");
  }

  const newUser: UserAccount = {
    ...account,
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);
  return newUser;
}

export function updateUser(id: string, updates: Partial<Omit<UserAccount, "id" | "createdAt">>): UserAccount {
  const users = getUsers();
  const index = users.findIndex((u) => u.id === id);
  
  if (index === -1) {
    throw new Error("User not found");
  }

  // Check if username is being changed and already exists
  if (updates.username && updates.username !== users[index].username) {
    if (users.find((u) => u.username === updates.username)) {
      throw new Error("Username already exists");
    }
  }

  users[index] = {
    ...users[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveUsers(users);
  return users[index];
}

export function deleteUser(id: string): void {
  const users = getUsers();
  const index = users.findIndex((u) => u.id === id);
  
  if (index === -1) {
    throw new Error("User not found");
  }

  // Soft delete by setting active to false
  users[index].active = false;
  users[index].updatedAt = new Date().toISOString();
  saveUsers(users);
}

export function validateCredentials(username: string, password: string): UserAccount | null {
  // Try to find by username first, then by email
  const user = findUserByUsername(username) || findUserByEmail(username);
  if (!user) return null;
  if (user.password !== password) return null;
  return user;
}

export function linkPractitioner(userId: string, practitionerId: string): UserAccount {
  return updateUser(userId, { practitionerId });
}

export function getUsersByPractitionerId(practitionerId: string): UserAccount[] {
  const users = getUsers();
  return users.filter((u) => u.practitionerId === practitionerId && u.active);
}

export function getUsersByOrganizationId(organizationId: string): UserAccount[] {
  const users = getUsers();
  return users.filter((u) => u.organizationId === organizationId && u.active);
}
