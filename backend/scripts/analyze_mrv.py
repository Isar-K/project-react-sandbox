import pandas as pd
import sys

# Set UTF-8 encoding for console output
sys.stdout.reconfigure(encoding='utf-8')

# Read the Excel file - skip first rows if they're headers
print("Reading EU MRV data...")
df = pd.read_excel('2024-v99-22102025-EU MRV Publication of information.xlsx', header=[0, 1, 2])

print(f"\n{'='*80}")
print("EU MRV DATASET ANALYSIS")
print(f"{'='*80}")

print(f"\nTotal rows: {len(df)}")
print(f"Total columns: {len(df.columns)}")

print(f"\n{'='*80}")
print("COLUMN NAMES:")
print(f"{'='*80}")
for i, col in enumerate(df.columns, 1):
    print(f"{i:3}. {col}")

print(f"\n{'='*80}")
print("FIRST ROW SAMPLE:")
print(f"{'='*80}")
for col in df.columns:
    value = df[col].iloc[0]
    print(f"{col}: {value}")

print(f"\n{'='*80}")
print("DATA TYPES:")
print(f"{'='*80}")
print(df.dtypes)

print(f"\n{'='*80}")
print("KEY COLUMNS CHECK:")
print(f"{'='*80}")
# Check for IMO column
imo_cols = [col for col in df.columns if 'IMO' in col.upper()]
print(f"IMO columns: {imo_cols}")

# Check for company columns
company_cols = [col for col in df.columns if 'COMPANY' in col.upper() or 'OWNER' in col.upper()]
print(f"Company columns: {company_cols}")

# Check for CO2 columns
co2_cols = [col for col in df.columns if 'CO2' in col.upper() or 'EMISSION' in col.upper()]
print(f"CO2/Emission columns: {co2_cols}")

# Check for vessel name columns
name_cols = [col for col in df.columns if 'NAME' in col.upper() or 'VESSEL' in col.upper()]
print(f"Name/Vessel columns: {name_cols}")

print(f"\n{'='*80}")
print("SAMPLE DATA (first 3 rows):")
print(f"{'='*80}")
print(df.head(3).to_string())
