import { issueplus } from "@/data/issueplus";

export type IssueSlide = {
  id: string;
  href: string;
  imageUrl: string;
  title: string;
  sourceName: string;
  sourceTime: string;
};

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  return trimmed;
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseIssuePickHtml(html: string, index: number): IssueSlide | null {
  if (html.includes("issueAdBox")) {
    return null;
  }

  if (!html.includes("issuePlusBox")) {
    return null;
  }

  if (html.includes("clusterTit")) {
    return null;
  }

  const hrefMatch = html.match(/<a\s+[^>]*href="([^"]+)"/i);
  const rawHref = hrefMatch?.[1]?.trim() ?? "";
  const href = rawHref ? normalizeUrl(rawHref.startsWith("//") ? `https:${rawHref}` : rawHref) : "";

  const imgMatches = [...html.matchAll(/<img[^>]*src="([^"]+)"[^>]*>/gi)];
  let imageUrl = "";
  for (const m of imgMatches) {
    const tag = m[0];
    const src = m[1];
    if (tag.includes('width="20"') || tag.includes("width='20'")) {
      continue;
    }
    if (/profile_(pann|nateview)|img_profile_n_news/i.test(src)) {
      continue;
    }
    imageUrl = normalizeUrl(src);
    break;
  }

  if (!imageUrl) {
    const iBox = html.match(
      /<span[^>]*class="[^"]*iBox[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i,
    );
    if (iBox?.[1]) {
      imageUrl = normalizeUrl(iBox[1]);
    }
  }

  let title = "";
  const txtMatch = html.match(/<span[^>]*class="[^"]*txt[^"]*"[^>]*>([^<]*)</i);
  if (txtMatch?.[1]) {
    title = decodeBasicEntities(txtMatch[1].trim());
  }
  if (!title) {
    const altMatch = html.match(/alt="([^"]*)"/i);
    if (altMatch?.[1]) {
      title = decodeBasicEntities(altMatch[1].trim());
    }
  }

  const nameMatch = html.match(/<span[^>]*class="[^"]*s_name[^"]*"[^>]*>([^<]*)</i);
  const timeMatch = html.match(/<span[^>]*class="[^"]*s_text[^"]*"[^>]*>([^<]*)</i);

  if (!href || !imageUrl) {
    return null;
  }

  return {
    id: `issueplus-${index}`,
    href,
    imageUrl,
    title: title || "이슈+",
    sourceName: nameMatch?.[1]?.trim() || "Nate",
    sourceTime: timeMatch?.[1]?.trim() ?? "",
  };
}

const rawPick = issueplus[0]?.issuepick ?? [];

export const issuePlusSlides: IssueSlide[] = rawPick
  .map((html, index) => parseIssuePickHtml(html, index))
  .filter((item): item is IssueSlide => item !== null);
