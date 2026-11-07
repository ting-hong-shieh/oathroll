import Link from "next/link";
import { Header } from "@/components/header";
export default function NotFound() { return <><Header /><main id="main" className="proof-loading"><h1>Page not found.</h1><Link href="/" className="button button-primary">Back to start</Link></main></>; }
