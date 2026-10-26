import { useSyncExternalStore } from "react";

export type Route =
    | { name: "lobby" }
    | { name: "court"; id: string }
    | { name: "hall"; tab: "lawyers" | "roasts" | "cases" };

function parse(hash: string): Route {
    const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts[0] === "court" && parts[1]) return { name: "court", id: parts[1] };
    if (parts[0] === "hall") {
        const tab = parts[1] === "roasts" || parts[1] === "cases" ? parts[1] : "lawyers";
        return { name: "hall", tab };
    }
    return { name: "lobby" };
}

const subscribe = (cb: () => void) => {
    window.addEventListener("hashchange", cb);
    return () => window.removeEventListener("hashchange", cb);
};

/** A tiny hash router: the whole app has three screens. */
export function useRoute(): Route {
    const hash = useSyncExternalStore(subscribe, () => window.location.hash);
    return parse(hash);
}

export const navigate = (path: string) => {
    window.location.hash = path;
};
