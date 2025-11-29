"use client";

import { createContext, useContext, useState } from "react";

interface UserContextType {
    userId: string | null;
    setUserId: (id: string | null) => void;
    streamingLink: string | null;
    setStreamingLink: (link: string | null) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
    const [userId, setUserId] = useState<string | null>(null);
    const [streamingLink, setStreamingLink] = useState<string | null>(null);

    return (
        <UserContext.Provider value={{ userId, setUserId, streamingLink, setStreamingLink }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
};
