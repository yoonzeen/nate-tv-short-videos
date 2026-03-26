import { ShortsFeed } from "@/components/ShortsFeed";
import { videos } from "@/data/videos";

export default function Home() {
  return <ShortsFeed videos={videos} />;
}
