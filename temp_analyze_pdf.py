import urllib.request
import os
import sys

def analyze():
    url = "https://www.rd.go.th/fileadmin/tax_pdf/withhold/approve_wh3_081156.pdf"
    print("Downloading PDF...")
    try:
        filename, _ = urllib.request.urlretrieve(url, "temp_doc.pdf")
    except Exception as e:
        print(f"Error downloading: {e}")
        return
        
    try:
        from pypdf import PdfReader
    except ImportError:
        print("Installing pypdf...")
        os.system(f"{sys.executable} -m pip install pypdf")
        from pypdf import PdfReader
        
    try:
        reader = PdfReader("temp_doc.pdf")
        print(f"Number of Pages: {len(reader.pages)}")
        print(f"Metadata: {reader.metadata}")
        
        fields = reader.get_fields()
        if fields:
            print(f"\nForm Fields found: {len(fields)}")
            for key in list(fields.keys())[:30]:
                print(f"- {key}")
        else:
            print("\nNo interactive form fields found.")
            
        print("\n--- First Page Text Preview ---")
        text = reader.pages[0].extract_text()
        print(text[:1000] if text else "No text extracted.")
        
    except Exception as e:
        print(f"Error reading PDF: {e}")

if __name__ == '__main__':
    analyze()
