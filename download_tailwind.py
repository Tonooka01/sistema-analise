import urllib.request
url = 'https://cdn.jsdelivr.net/npm/tailwindcss@3/dist/tailwind.min.css'
urllib.request.urlretrieve(url, 'static/css/tailwind.min.css')
print('OK')