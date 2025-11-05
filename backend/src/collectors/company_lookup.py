import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
from tqdm import tqdm

BASE_SEARCH_URL = "https://lookup.itfglobal.org/search-vessels?FreeText="
BASE_VESSEL_URL = "https://lookup.itfglobal.org/vessel/"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; EconowindBot/1.0; +https://econowind.nl)"}


def get_vessel_uuid(vessel_name: str):
    """Search ITF Lookup by vessel name and return the first vessel UUID."""
    try:
        search_url = BASE_SEARCH_URL + requests.utils.quote(vessel_name)
        resp = requests.get(search_url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")
        link = soup.select_one("h2 a[href*='/vessel/']")
        if not link:
            return None

        uuid = link["href"].split("/vessel/")[1]
        return uuid
    except Exception:
        return None


def get_signatory_company(vessel_name: str):
    """Return the signatory company name for a vessel (if found)."""
    uuid = get_vessel_uuid(vessel_name)
    if not uuid:
        return None

    try:
        vessel_url = BASE_VESSEL_URL + uuid
        resp = requests.get(vessel_url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")
        company_div = soup.find("div", class_="signatory-company")
        if not company_div:
            return None

        spans = company_div.find_all("span")
        if len(spans) >= 2:
            return spans[1].get_text(strip=True)
    except Exception:
        return None
    return None


def enrich_dataframe(csv_path: str, out_path: str = "vessel_with_company.csv"):
    """Read a CSV with a 'name' column, look up companies, and export results."""
    df = pd.read_csv(csv_path)
    if "name" not in df.columns:
        raise ValueError("CSV must have a 'name' column containing vessel names.")

    results = []
    for vessel in tqdm(df["name"].fillna(""), desc="Fetching ITF companies"):
        vessel = vessel.strip()
        if not vessel:
            results.append(None)
            continue

        company = get_signatory_company(vessel)
        results.append(company)
        time.sleep(1.5)  # be polite to the ITF server

    df["signatory_company"] = results
    df.to_csv(out_path, index=False)
    print(f"✅ Done! Saved results to {out_path}")


if __name__ == "__main__":
    enrich_dataframe("vessel_data_20251023_180650.csv")
