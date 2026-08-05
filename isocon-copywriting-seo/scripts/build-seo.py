#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "website"
INDEX = WEBSITE / "index.html"
CATALOG = WEBSITE / "data" / "catalog.json"

DEFAULTS = {
    "title": "ISOCON | Soluções empresariais e logística nacional",
    "description": (
        "Catálogo B2B de produtos, equipamentos e suprimentos para empresas, "
        "com atendimento comercial e logística em todo o Brasil."
    ),
    "canonical": "https://isoconvca.com.br/",
    "socialTitle": "ISOCON | Soluções empresariais e logística nacional",
    "socialDescription": (
        "Soluções empresariais, atendimento comercial e logística nacional."
    ),
    "socialImage": "https://isoconvca.com.br/assets/images/hero-home.png",
}


def remove_existing_seo(source: str) -> str:
    source = re.sub(
        r"\s*<!-- ISOCON SEO START -->.*?<!-- ISOCON SEO END -->\s*",
        "\n",
        source,
        flags=re.S,
    )

    patterns = [
        r"\s*<title>.*?</title>\s*",
        r"\s*<meta\s+name=[\"']description[\"'][^>]*>\s*",
        r"\s*<meta\s+name=[\"']robots[\"'][^>]*>\s*",
        r"\s*<link\s+rel=[\"']canonical[\"'][^>]*>\s*",
        r"\s*<meta\s+property=[\"']og:[^\"']+[\"'][^>]*>\s*",
        r"\s*<meta\s+name=[\"']twitter:[^\"']+[\"'][^>]*>\s*",
        r"\s*<script\s+type=[\"']application/ld\+json[\"'][^>]*>.*?</script>\s*",
    ]

    for pattern in patterns:
        source = re.sub(pattern, "\n", source, flags=re.I | re.S)

    return source


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    seo = {
        **DEFAULTS,
        **catalog.get("copywriting", {}).get("seo", {}),
    }

    canonical = seo["canonical"].rstrip("/") + "/"
    structured = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebSite",
                "@id": f"{canonical}#website",
                "url": canonical,
                "name": "ISOCON",
                "inLanguage": "pt-BR",
            },
            {
                "@type": "Organization",
                "@id": f"{canonical}#organization",
                "name": "ISOCON",
                "url": canonical,
                "logo": f"{canonical}assets/images/logo%201.png",
                "image": seo["socialImage"],
                "areaServed": {
                    "@type": "Country",
                    "name": "Brasil",
                },
            },
        ],
    }

    json_ld = json.dumps(
        structured,
        ensure_ascii=False,
        indent=2,
    ).replace("</", "<\\/")

    block = f"""
  <!-- ISOCON SEO START -->
  <title>{html.escape(seo['title'])}</title>
  <meta name="description" content="{html.escape(seo['description'], quote=True)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{html.escape(canonical, quote=True)}">

  <meta property="og:type" content="website">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="ISOCON">
  <meta property="og:title" content="{html.escape(seo['socialTitle'], quote=True)}">
  <meta property="og:description" content="{html.escape(seo['socialDescription'], quote=True)}">
  <meta property="og:url" content="{html.escape(canonical, quote=True)}">
  <meta property="og:image" content="{html.escape(seo['socialImage'], quote=True)}">
  <meta property="og:image:secure_url" content="{html.escape(seo['socialImage'], quote=True)}">
  <meta property="og:image:alt" content="ISOCON — soluções empresariais e logística nacional">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html.escape(seo['socialTitle'], quote=True)}">
  <meta name="twitter:description" content="{html.escape(seo['socialDescription'], quote=True)}">
  <meta name="twitter:image" content="{html.escape(seo['socialImage'], quote=True)}">

  <script type="application/ld+json">
{json_ld}
  </script>
  <!-- ISOCON SEO END -->
"""

    source = remove_existing_seo(INDEX.read_text(encoding="utf-8"))

    viewport = re.search(
        r'^\s*<meta\s+name=["\']viewport["\'][^>]*>\s*$',
        source,
        flags=re.I | re.M,
    )

    if viewport:
        position = viewport.end()
        source = source[:position] + "\n" + block + source[position:]
    else:
        source = source.replace("<head>", "<head>\n" + block, 1)

    INDEX.write_text(source, encoding="utf-8")

    domain = canonical.removeprefix("https://").removeprefix("http://").rstrip("/")

    (WEBSITE / "robots.txt").write_text(
        "User-agent: *\n"
        "Allow: /\n\n"
        f"Sitemap: {canonical}sitemap.xml\n",
        encoding="utf-8",
    )

    (WEBSITE / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        "  <url>\n"
        f"    <loc>{html.escape(canonical)}</loc>\n"
        f"    <lastmod>{date.today().isoformat()}</lastmod>\n"
        "    <changefreq>weekly</changefreq>\n"
        "    <priority>1.0</priority>\n"
        "  </url>\n"
        "</urlset>\n",
        encoding="utf-8",
    )

    print(f"SEO estático gerado para {domain}")


if __name__ == "__main__":
    main()
