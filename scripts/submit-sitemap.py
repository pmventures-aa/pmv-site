#!/usr/bin/env python3
"""Submit the sitemap to Google Search Console.

Auth (pick one, checked in this order):
  1. GSC_ACCESS_TOKEN  - a short-lived OAuth2 access token with the
     https://www.googleapis.com/auth/webmasters scope, from an account that
     is a verified owner of the property. Easiest for a one-off run.
  2. GOOGLE_APPLICATION_CREDENTIALS - path to a service-account JSON. The
     service account must be added as a user/owner of the property in Search
     Console. Requires the google-auth package.

Property + sitemap default to this site; override with env if needed:
  GSC_SITE_URL   (default: https://www.pinnaclemanagementventures.com/)
  GSC_SITEMAP    (default: <site>sitemap.xml)

The Search Console sitemaps endpoint is:
  PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}
A 200/204 with an empty body means success.
"""
import os
import sys
import urllib.parse
import urllib.request

SITE_URL = os.environ.get("GSC_SITE_URL", "https://www.pinnaclemanagementventures.com/")
SITEMAP = os.environ.get("GSC_SITEMAP", SITE_URL.rstrip("/") + "/sitemap.xml")
SCOPE = "https://www.googleapis.com/auth/webmasters"


def get_token() -> str:
    token = os.environ.get("GSC_ACCESS_TOKEN")
    if token:
        return token.strip()
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path:
        try:
            from google.oauth2 import service_account  # type: ignore
            from google.auth.transport.requests import Request  # type: ignore
        except ImportError:
            sys.exit("GOOGLE_APPLICATION_CREDENTIALS is set but google-auth is not installed "
                     "(pip install google-auth).")
        creds = service_account.Credentials.from_service_account_file(cred_path, scopes=[SCOPE])
        creds.refresh(Request())
        return creds.token
    sys.exit(
        "No credentials found. Set GSC_ACCESS_TOKEN (an OAuth token with the "
        "webmasters scope from a verified property owner) or "
        "GOOGLE_APPLICATION_CREDENTIALS (a service-account JSON added as an owner)."
    )


def submit(token: str) -> None:
    feedpath = urllib.parse.quote(SITEMAP, safe="")
    site = urllib.parse.quote(SITE_URL, safe="")
    url = f"https://www.googleapis.com/webmasters/v3/sites/{site}/sitemaps/{feedpath}"
    req = urllib.request.Request(url, method="PUT", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"OK {resp.status}: submitted {SITEMAP} to {SITE_URL}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        sys.exit(f"HTTP {e.code} from Search Console API:\n{body}")


if __name__ == "__main__":
    print(f"Property: {SITE_URL}\nSitemap:  {SITEMAP}")
    submit(get_token())
