"use client";
import { useUser } from "@/context/usercontext";

export function Dashboard() {
    const { userId } = useUser();
    return <p>Logged in as: {userId || "Guest"}</p>;
}
