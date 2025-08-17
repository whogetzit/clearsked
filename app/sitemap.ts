// app/sitemap.ts
import { type MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://clearsked.com/", lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: "https://clearsked.com/admin", lastModified: now, changeFrequency: "weekly", priority: 0.2 },
  ];
}
