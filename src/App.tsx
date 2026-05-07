import { NewsFeed } from "@/components/NewsFeed";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

const rawBase = import.meta.env.BASE_URL;
const basename =
  rawBase === "/" ? undefined : rawBase.replace(/\/$/, "") || undefined;

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<NewsFeed />} />
        <Route path="/news" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
