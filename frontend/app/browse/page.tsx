import { Gamepad2, Search, Filter, User, LogOut } from "lucide-react";
import { Dashboard } from "@/components/dashboard";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GradientBackground } from "@/components/gradient-background";

export default function BrowsePage() {
    return (
        <>
            <GradientBackground />
            <div className="relative z-0 min-h-screen">
            {/* Header */}
            <Dashboard />
            <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/browse" className="flex items-center gap-2">
                            <Gamepad2 className="h-6 w-6" />
                            <span className="font-bold">Lunaris</span>
                        </Link>
                    </div>

                    {/* Search Bar */}
                    <div className="flex flex-1 items-center justify-center gap-4 px-6">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input placeholder="Search games..." className="pl-9" />
                        </div>
                        <Button variant="outline" size="sm">
                            <Filter className="h-4 w-4 mr-2" />
                            Filters
                        </Button>
                    </div>

                    {/* User Menu */}
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                            <User className="h-4 w-4 mr-2" />
                            Profile
                        </Button>
                        <Link href="/login">
                            <Button variant="ghost" size="sm">
                                <LogOut className="h-4 w-4 mr-2" />
                                Logout
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Browse Games</h1>
                    <p className="text-muted-foreground">
                        Discover and play the latest cloud games
                    </p>
                </div>

                {/* Featured Games */}
                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-6">Featured Games</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {featuredGames.map((game) => (
                            <div key={game.id} className="group cursor-pointer">
                                <div className="aspect-video bg-muted rounded-lg mb-3 overflow-hidden">
                                    <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                                        {game.name}
                                    </div>
                                </div>
                                <h3 className="font-semibold group-hover:text-primary transition-colors">
                                    {game.name}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {game.genre} • {game.playTime}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Popular Games */}
                <section>
                    <h2 className="text-2xl font-semibold mb-6">Popular Games</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {popularGames.map((game) => (
                            <div key={game.id} className="group cursor-pointer">
                                <div className="aspect-video bg-muted rounded-lg mb-3 overflow-hidden">
                                    <div className="w-full h-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl">
                                        {game.name}
                                    </div>
                                </div>
                                <h3 className="font-semibold group-hover:text-primary transition-colors">
                                    {game.name}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {game.genre} • {game.playTime}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
        </>
    );
}

// Sample game data
const featuredGames = [
    { id: 1, name: "Cyber Adventure", genre: "Action", playTime: "15-30 min" },
    { id: 2, name: "Space Odyssey", genre: "Sci-Fi", playTime: "30-45 min" },
    { id: 3, name: "Mystic Quest", genre: "RPG", playTime: "45-60 min" },
    { id: 4, name: "Racing Thunder", genre: "Racing", playTime: "10-20 min" },
];

const popularGames = [
    { id: 5, name: "Battle Royale", genre: "FPS", playTime: "20-40 min" },
    { id: 6, name: "Puzzle Master", genre: "Puzzle", playTime: "5-15 min" },
    { id: 7, name: "Fantasy World", genre: "Adventure", playTime: "30-60 min" },
    { id: 8, name: "Sports Arena", genre: "Sports", playTime: "15-30 min" },
];
