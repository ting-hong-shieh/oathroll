import { backendMode } from "@/lib/backend-selected";
import { Header } from "@/components/header";
import { ReceiptView } from "@/components/proof-view";
export default async function ReceiptPage({ params }: { params: Promise<{ check: string }> }) { const { check } = await params; return <><Header mode={backendMode} /><ReceiptView id={check} /></>; }
