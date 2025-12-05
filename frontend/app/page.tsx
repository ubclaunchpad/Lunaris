"use client";

import { GameCardsRow } from "@/components/game-card/game-cards-row";
import gameData from "@/lib/data.json";

export default function Home() {
    return (
        <div>
            <header className="space-y-4 mb-12">
                <h1 className="text-3xl sm:text-5xl font-bold font-space-grotesk">
                    What would you like to play today?
                </h1>
            </header>

            <section aria-label="featured games">
                <GameCardsRow />
            </section>
        </div>
    );
}
