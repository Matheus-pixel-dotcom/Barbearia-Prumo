import glob, re

html_files = glob.glob("/home/ubuntu/Barbearia-Prumo/*.html")
for filepath in html_files:
    if "admin.html" in filepath or "dashboard.html" in filepath:
        continue
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    if "admin.html" in content:
        print(f"Already has admin: {filepath}")
        continue
        
    pattern = r'(<a[^>]*href=["\']login\.html["\'][^>]*>)'
    replacement = r'<a href="admin.html" style="color: var(--gold); font-weight: 600;">Admin</a>\n        \1'
    
    new_content, count = re.subn(pattern, replacement, content)
    if count == 0:
        pattern2 = r'(</div\s*>\s*</nav\s*>)'
        replacement2 = r'  <a href="admin.html" style="color: var(--gold); font-weight: 600;">Admin</a>\n      \1'
        new_content, count = re.subn(pattern2, replacement2, content, count=1)
        
    if count > 0:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated: {filepath}")
    else:
        print(f"Could not update: {filepath}")
