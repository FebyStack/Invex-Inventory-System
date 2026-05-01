import os
import re

html_dir = '/Users/febrielotud/Desktop/Invex/frontend/public'
new_logo_html = '''      <div class="logo-container">
        <img src="/assets/logo.png" alt="Invex Logo" class="logo-image">'''

# Pattern to match the logo-container and the logo-icon div with its SVG inside
pattern = re.compile(r'<div class="logo-container">.*?<div class="logo-icon">.*?</div>', re.DOTALL)

for filename in os.listdir(html_dir):
    if filename.endswith('.html'):
        filepath = os.path.join(html_dir, filename)
        with open(filepath, 'r') as f:
            content = f.read()
        
        if 'logo-container' in content:
            new_content = pattern.sub(new_logo_html, content)
            with open(filepath, 'w') as f:
                f.write(new_content)
            print(f"Updated {filename}")
