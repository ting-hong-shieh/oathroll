import { backendMode } from "@/lib/backend-selected";
import { Header } from "@/components/header";
import { ProofView } from "@/components/proof-view";
export default async function VerifyPage({ params }: { params: Promise<{ check: string }> }) { const { check } = await params; return <><Header mode={backendMode} /><ProofView id={check} /></>; }
