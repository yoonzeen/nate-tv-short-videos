import { IssuePlusFeed } from "@/components/IssuePlusFeed";
import { issuePlusSlides } from "@/data/issuePlusSlides";

export default function IssuePlusPage() {
  return <IssuePlusFeed slides={issuePlusSlides} />;
}
