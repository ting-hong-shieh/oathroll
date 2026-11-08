"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const types = ["fraunces", "garamond", "newsreader", "sora"];

export function TypePreference() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    const requested = search.get("type");
    let selected = "fraunces";
    try {
      const saved = localStorage.getItem("oathroll-type");
      if (saved && types.includes(saved)) selected = saved;
    } catch { /* Query selection also works without browser storage. */ }
    if (requested && types.includes(requested)) {
      selected = requested;
      try { localStorage.setItem("oathroll-type", selected); } catch { /* Storage is optional. */ }
    }
    document.documentElement.dataset.type = selected;
  }, [pathname, search]);
  return null;
}
