import { Header } from "@/components/header";
import { WallView } from "@/components/wall-view";
import { backendMode } from "@/lib/backend-selected";
export default function WallPage() { return <><Header mode={backendMode} /><WallView mode={backendMode} /></>; }
