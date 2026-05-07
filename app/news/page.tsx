import { permanentRedirect } from "next/navigation";

export default function LegacyNewsPathPage() {
  permanentRedirect("/");
}
