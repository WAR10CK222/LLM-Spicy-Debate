import { io, type Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "@court/shared";

let socket: Socket<ServerToClient, ClientToServer> | null = null;

export function getSocket() {
    socket ??= io({ path: "/socket.io", transports: ["websocket", "polling"] });
    return socket;
}
