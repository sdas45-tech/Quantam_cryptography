"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface UserSession {
  username: string;
  role: "admin" | "user" | "guest" | "organization";
  full_name: string;
  organization_id?: string;
  subscription_tier?: string;
}

interface AuthContextType {
  token: string | null;
  user: UserSession | null;
  isAuthenticated: boolean;
  login: (token: string, user: UserSession) => void;
  logout: () => void;
  updateUser: (updatedUser: Partial<UserSession>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("jwt_token");
    const savedUser = localStorage.getItem("user_profile");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    } else {
      // Setup a fallback guest profile
      const guestProfile: UserSession = {
        username: "guest",
        role: "guest",
        full_name: "Guest Operator",
        subscription_tier: "free"
      };
      setToken("guest-token");
      setUser(guestProfile);
    }
    setLoading(false);
  }, []);

  const login = (newToken: string, newUser: UserSession) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("jwt_token", newToken);
    localStorage.setItem("user_profile", JSON.stringify(newUser));
  };

  const logout = () => {
    setToken("guest-token");
    setUser({
      username: "guest",
      role: "guest",
      full_name: "Guest Operator",
      subscription_tier: "free"
    });
    localStorage.removeItem("jwt_token");
    localStorage.removeItem("user_profile");
  };

  const updateUser = (updatedFields: Partial<UserSession>) => {
    if (user) {
      const nextUser = { ...user, ...updatedFields };
      setUser(nextUser);
      localStorage.setItem("user_profile", JSON.stringify(nextUser));
    }
  };

  const isAuthenticated = token !== null && token !== "guest-token" && user?.role !== "guest";

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated, login, logout, updateUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
