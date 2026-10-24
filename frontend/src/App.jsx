import { useEffect, useState } from "react";

export default function App() {
  const [msg, setMsg] = useState("loading...");

  useEffect(() => {
    fetch(import.meta.env.VITE_API_URL + "/")
      .then((r) => r.json())
      .then((d) => setMsg(d.status))
      .catch(() => setMsg("error"));
  }, []);

  return <h1>Backend says: {msg}</h1>;
}