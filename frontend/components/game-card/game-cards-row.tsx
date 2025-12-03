import { ReactNode } from "react";
import { GameCard } from "./game-card";
import gamesData from "@/lib/data.json";

interface CarouselProps {
    children: ReactNode;
    className?: string;
}

const Carousel = ({ children, className = "" }: CarouselProps) => (
    <div className={`relative -my-28 -mx-8 ${className}`}>
        <div
            className="overflow-x-auto overflow-y-visible py-28 px-8 no-scrollbar"
            role="region"
            aria-label="game cards"
        >
            <div className="flex gap-5 min-h-[220px] pr-8">{children}</div>
        </div>
    </div>
);

type GamesDataset = typeof gamesData;
type Game = GamesDataset["games"][number];

const gameMap: Record<string, Game> = gamesData.games.reduce(
    (acc, game) => {
        acc[game.id] = game;
        return acc;
    },
    {} as Record<string, Game>,
);

interface GameCardsRowProps {
    gameIds?: string[];
}

export function GameCardsRow({ gameIds }: GameCardsRowProps) {
    const gamesToRender: Game[] = gameIds?.length
        ? gameIds.map((id) => gameMap[id]).filter((game): game is Game => Boolean(game))
        : gamesData.games;

    return (
        <Carousel>
            {gamesToRender.map((game) => (
                <GameCard
                    key={game.id}
                    id={game.id}
                    src={game.image}
                    alt={game.name}
                    title={game.name}
                    modes={game.modes}
                    tags={game.tags}
                />
            ))}
        </Carousel>
    );
}
