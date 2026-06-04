import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig, Plugin } from "vite";
import { cjsInterop } from "vite-plugin-cjs-interop";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";

type RuntimeConfig = Record<string, string>;

function loadConfig(): RuntimeConfig {
  try {
    const configPath = path.join(__dirname, "public/config.js");
    if (!fs.existsSync(configPath)) {
      return {};
    }

    const configText = fs.readFileSync(configPath, "utf-8");
    const jsonText = configText
      .replace(/window\.__RUNTIME_CONFIG__\s*=\s*/, "")
      .replace(/;\s*$/, "")
      .trim();

    return JSON.parse(jsonText) as RuntimeConfig;
  } catch (error) {
    console.warn("Failed to load public/config.js:", error);
    return {};
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Inject the <title> and SEO meta tags into the static index.html at build time,
// reading values from public/config.js. This ensures crawlers/preview bots that do
// NOT execute JS (Telegram, X, Discord, WhatsApp, Google) see the correct title,
// description and image. Each tag carries data-rh="true" so react-helmet-async
// reconciles (dedupes) them at runtime instead of duplicating.
function htmlSeoPlugin(): Plugin {
  const config = loadConfig();

  const brokerName = config.VITE_ORDERLY_BROKER_NAME || "Orderly Network";
  const siteName = config.VITE_SEO_SITE_NAME || brokerName;
  const description = config.VITE_SEO_SITE_DESCRIPTION || "";
  const keywords = config.VITE_SEO_KEYWORDS || "";
  const themeColor = config.VITE_SEO_THEME_COLOR || "";
  const siteUrl = (config.VITE_SEO_SITE_URL || "").replace(/\/$/, "");
  const locale = config.VITE_SEO_SITE_LOCALE || "";
  const twitterHandle = config.VITE_SEO_TWITTER_HANDLE || "";
  const ogImage = siteUrl ? `${siteUrl}/logo.webp` : "";

  console.log(`[html-seo] title="${siteName}"`);

  return {
    name: "html-seo-transform",
    transformIndexHtml(html) {
      let out = html.replace(
        /<title>.*?<\/title>/,
        `<title>${escapeText(siteName)}</title>`,
      );

      const tags: string[] = [];
      const meta = (attr: "name" | "property", key: string, value: string) => {
        if (value) {
          tags.push(
            `<meta ${attr}="${key}" content="${escapeAttr(value)}" data-rh="true" />`,
          );
        }
      };

      meta("name", "description", description);
      meta("name", "keywords", keywords);

      // Open Graph
      meta("property", "og:title", siteName);
      meta("property", "og:description", description);
      meta("property", "og:site_name", siteName);
      meta("property", "og:type", "website");
      meta("property", "og:url", siteUrl);
      meta("property", "og:image", ogImage);
      meta("property", "og:locale", locale);

      // Twitter Card
      meta("name", "twitter:card", "summary_large_image");
      meta("name", "twitter:title", siteName);
      meta("name", "twitter:description", description);
      meta("name", "twitter:site", twitterHandle);
      meta("name", "twitter:image", ogImage);

      // theme-color: replace the hardcoded one in index.html if present, else inject.
      if (themeColor) {
        const themeTag = `<meta name="theme-color" content="${escapeAttr(themeColor)}" data-rh="true" />`;
        if (/<meta\s+name="theme-color"[^>]*\/?>/i.test(out)) {
          out = out.replace(/<meta\s+name="theme-color"[^>]*\/?>/i, themeTag);
        } else {
          tags.push(themeTag);
        }
      }

      if (tags.length > 0) {
        out = out.replace(/<\/head>/, `    ${tags.join("\n    ")}\n  </head>`);
      }

      return out;
    },
  };
}

export default defineConfig(() => {
  const basePath = process.env.PUBLIC_PATH || "/";

  return {
    server: {
      open: true,
      host: true,
    },
    base: basePath,
    plugins: [
      react(),
      tsconfigPaths(),
      htmlSeoPlugin(),
      cjsInterop({
        dependencies: ["bs58", "@coral-xyz/anchor", "lodash"],
      }),
      nodePolyfills({
        include: ["buffer", "crypto", "stream"],
      }),
    ],
    build: {
      outDir: "build/client",
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom"],
    },
  };
});
