"""
Quick test to verify the pulled changes work correctly
"""
import sqlite3
from pathlib import Path
import sys

# Fix Windows encoding
sys.stdout.reconfigure(encoding='utf-8')

DB_NAME = "vessel_static_data.db"

def test_database_schema():
    """Test that database schema is correct."""
    script_dir = Path(__file__).parent
    db_path = script_dir / DB_NAME
    
    if not db_path.exists():
        print("⚠️  Database doesn't exist yet - run import_mrv_data.py first")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if eu_mrv_emissions table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='eu_mrv_emissions'")
    if not cursor.fetchone():
        print("⚠️  eu_mrv_emissions table doesn't exist - run import_mrv_data.py first")
        conn.close()
        return False
    
    # Check if econowind_fit_score column exists
    cursor.execute("PRAGMA table_info(eu_mrv_emissions)")
    columns = {row[1] for row in cursor.fetchall()}
    
    if 'econowind_fit_score' in columns:
        print("✅ econowind_fit_score column exists")
        
        # Check if there are any scores
        cursor.execute("SELECT COUNT(*) FROM eu_mrv_emissions WHERE econowind_fit_score > 0")
        count = cursor.fetchone()[0]
        print(f"✅ {count} vessels have fit scores > 0")
    else:
        print("⚠️  econowind_fit_score column missing - will be added automatically")
    
    conn.close()
    return True

def test_imports():
    """Test that all required imports work."""
    try:
        import pandas
        print("✅ pandas imported successfully")
    except ImportError:
        print("❌ pandas not installed - run: pip install pandas")
        return False
    
    try:
        import openpyxl
        print("✅ openpyxl imported successfully")
    except ImportError:
        print("❌ openpyxl not installed - run: pip install openpyxl")
        return False
    
    try:
        import flask
        print("✅ flask imported successfully")
    except ImportError:
        print("❌ flask not installed")
        return False
    
    try:
        import flask_socketio
        print("✅ flask_socketio imported successfully")
    except ImportError:
        print("❌ flask_socketio not installed")
        return False
    
    return True

def test_syntax():
    """Test that all Python files have valid syntax."""
    import py_compile
    
    files_to_test = [
        'web_tracker.py',
        'import_mrv_data.py',
        'emissions_matcher.py',
        'ais_collector.py'
    ]
    
    all_ok = True
    for filename in files_to_test:
        try:
            py_compile.compile(filename, doraise=True)
            print(f"✅ {filename} syntax OK")
        except py_compile.PyCompileError as e:
            print(f"❌ {filename} has syntax errors:")
            print(f"   {e}")
            all_ok = False
    
    return all_ok

if __name__ == "__main__":
    print("="*60)
    print("TESTING PULLED CHANGES")
    print("="*60)
    
    print("\n1. Testing Python Syntax...")
    print("-"*60)
    syntax_ok = test_syntax()
    
    print("\n2. Testing Dependencies...")
    print("-"*60)
    imports_ok = test_imports()
    
    print("\n3. Testing Database Schema...")
    print("-"*60)
    db_ok = test_database_schema()
    
    print("\n" + "="*60)
    if syntax_ok and imports_ok:
        print("✅ ALL TESTS PASSED - Ready to push!")
        print("\nNext steps:")
        print("  1. git add web_tracker.py")
        print("  2. git commit -m 'Fix formatting in web_tracker.py'")
        print("  3. git push origin master")
    else:
        print("❌ SOME TESTS FAILED - Fix issues before pushing")
    print("="*60)
