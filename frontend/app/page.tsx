"use client";

import { Navbar } from "@/components/navbar";
import { GradientBackground } from "@/components/gradient-background";

const libraryGamesImages = [
  "/images/from-your-library/it takes two.png",
  "/images/from-your-library/Frame 38.png",
  "/images/from-your-library/Frame 40.png",
  "/images/from-your-library/Frame 39.png",
];

const popularGamesImages = [
  "/images/popular-games/Frame 37.png",
  "/images/popular-games/Frame 38.png",
  "/images/popular-games/Frame 39.png",
  "/images/popular-games/Frame 40.png",
];

const partyGamesImages = [
  "/images/party-games/Frame 37.png",
  "/images/party-games/Frame 38.png",
  "/images/party-games/Frame 39.png",
  "/images/party-games/Frame 40.png",
];

function GameCard({ src, alt = "Game" }: { src: string; alt?: string }) {
  return (
    <div className="relative shrink-0 w-96 h-44 rounded-xl overflow-hidden">
      <img
        alt={alt}
        src={src}
        className="absolute inset-0 w-full h-full object-cover"
      />
    </div>
  );
}

function GameCardsRow({ games }: { games: string[] }) {
  return (
    <div className="flex gap-5 overflow-x-auto pb-2">
      {games.map((src, idx) => (
        <GameCard key={idx} src={src} />
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen w-full">
      <GradientBackground />
      <Navbar />

      <div className="relative z-10 pt-32 pb-12">
        <div className="max-w-7xl mx-auto px-4 lg:px-2">
          <h1 className="text-5xl font-bold font-space-grotesk text-[#fbfff5] mb-12">
            What would you like to play today?
          </h1>

          <div className="space-y-12">
            <section className="space-y-5">
              <h2 className="text-2xl font-medium font-space-grotesk text-[#fbfff5]">
                From Your Library
              </h2>
              <GameCardsRow games={libraryGamesImages} />
            </section>

            <section className="space-y-5">
              <h2 className="text-2xl font-medium font-space-grotesk text-[#fbfff5]">
                Popular Games
              </h2>
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-5">
                  {popularGamesImages.map((src, idx) => (
                    <GameCard key={idx} src={src} />
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <h2 className="text-2xl font-medium font-space-grotesk text-[#fbfff5]">
                Party Games
              </h2>
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-5">
                  {partyGamesImages.map((src, idx) => (
                    <GameCard key={idx} src={src} />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
