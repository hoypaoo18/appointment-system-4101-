
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(<>
    {import.meta.env.MODE === "test" && <div role="status" className="fixed top-0 left-1/2 -translate-x-1/2 z-[120] bg-amber-100 text-amber-900 px-3 py-0.5 rounded-b-lg text-xs font-semibold shadow-sm">Test environment · sample data</div>}
    {import.meta.env.MODE === "pages" && <div role="status" className="fixed top-0 left-1/2 -translate-x-1/2 z-[120] bg-amber-100 text-amber-900 px-3 py-1 rounded-b-lg text-xs font-semibold shadow-sm text-center">Frontend preview · sample data · online login and saving unavailable</div>}
    <App />
  </>);
