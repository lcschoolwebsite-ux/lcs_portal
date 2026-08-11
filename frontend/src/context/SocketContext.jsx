import { createContext, useEffect, useState } from "react";
import { useAuth } from "./useAuth";

export const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "https://api-portal.lorettocentralschool.edu.in";

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let activeSocket = null;

    if (user) {
      import("socket.io-client")
        .then(({ io }) => {
          if (cancelled) return;

          const token = localStorage.getItem("token");
          activeSocket = io(SOCKET_URL, {
            auth: { token },
            withCredentials: true,
            transports: ["websocket", "polling"]
          });
          setSocket(activeSocket);
        })
        .catch((error) => {
          if (!cancelled) console.warn("Socket client failed to load:", error.message);
        });

      return () => {
        cancelled = true;
        activeSocket?.close();
        setSocket(null);
      };
    } else {
      setSocket(null);
    }
  }, [user]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}
