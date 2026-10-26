import { useEffect } from "react";
import { useRoute } from "./lib/router";
import { Lobby } from "./routes/Lobby";
import { Courtroom } from "./routes/Courtroom";
import { HallOfFame } from "./routes/HallOfFame";

export function App() {
    const route = useRoute();
    const key = route.name === "court" ? route.id : route.name;
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [key]);
    switch (route.name) {
        case "court":
            return <Courtroom key={route.id} id={route.id} />;
        case "hall":
            return <HallOfFame tab={route.tab} />;
        default:
            return <Lobby />;
    }
}
