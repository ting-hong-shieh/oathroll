"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main id="main" className="proof-loading"><h1>Something went wrong.</h1><p>Your game is saved in this browser.</p><button className="button button-primary" onClick={reset}>Try again</button></main>; }
