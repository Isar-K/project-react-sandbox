import pandas as pd
import sys

sys.stdout.reconfigure(encoding='utf-8')

print("Reading EU MRV data...")
df = pd.read_excel('2024-v99-22102025-EU MRV Publication of information.xlsx', header=[0, 1, 2])

print(f"\n{'='*80}")
print("EU MRV DATASET ANALYSIS")
print(f"{'='*80}")
print(f"\nTotal rows: {len(df)}")
print(f"Total columns: {len(df.columns)}")

# Flatten column names for easier access
df.columns = ['_'.join(str(i) for i in col).strip() for col in df.columns.values]

print(f"\n{'='*80}")
print("KEY COLUMNS:")
print(f"{'='*80}")

# Find IMO column
imo_cols = [col for col in df.columns if 'IMO' in col.upper()]
print(f"\nIMO columns: {imo_cols}")

# Find company columns
company_cols = [col for col in df.columns if 'COMPANY' in col.upper()]
print(f"Company columns: {company_cols}")

# Find vessel name columns
name_cols = [col for col in df.columns if 'NAME' in col and 'COMPANY' not in col.upper()]
print(f"Name columns: {name_cols}")

# Find CO2 emissions columns
co2_cols = [col for col in df.columns if 'CO' in col and 'EMISSIONS' in col.upper() and 'TOTAL' in col.upper()]
print(f"\nTotal CO2 emissions columns: {co2_cols[:5]}")  # Show first 5

print(f"\n{'='*80}")
print("SAMPLE DATA (first 5 rows, key columns only):")
print(f"{'='*80}")

# Show sample with key columns
if imo_cols and name_cols and company_cols:
    key_cols = imo_cols + name_cols + company_cols + co2_cols[:2]
    sample = df[key_cols].head(5)
    for idx, row in sample.iterrows():
        print(f"\nRow {idx}:")
        for col in key_cols:
            print(f"  {col}: {row[col]}")

print(f"\n{'='*80}")
print("STATISTICS:")
print(f"{'='*80}")
print(f"Unique IMO numbers: {df[imo_cols[0]].nunique() if imo_cols else 'N/A'}")
print(f"Unique companies: {df[company_cols[0]].nunique() if company_cols else 'N/A'}")
print(f"Unique vessel names: {df[name_cols[0]].nunique() if name_cols else 'N/A'}")

# Save column names to file for reference
with open('mrv_columns.txt', 'w', encoding='utf-8') as f:
    f.write("EU MRV DATASET COLUMNS\n")
    f.write("="*80 + "\n\n")
    for i, col in enumerate(df.columns, 1):
        f.write(f"{i:3}. {col}\n")

print(f"\nColumn names saved to: mrv_columns.txt")
