import { Header } from "@/components/header";
import { PlayGame } from "@/components/play-game";
import { backendMode } from "@/lib/backend-selected";
export default function PlayPage() { return <><Header mode={backendMode} /><PlayGame mode={backendMode} /></>; }
