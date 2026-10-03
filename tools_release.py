#!/usr/bin/env python3
"""Stamp every app-file URL with the release version so browsers always load one matching set of files.

Usage: python3 tools_release.py 1.9.5
Updates: static/dynamic imports and the worker URL in js/*.js, the language-file template, APP_VERSION,
index.html (boot/app script, modulepreload, stylesheet) and the service worker (APP_V -> cache name and
precache list). Version format: digits, letters, dots, '+' and '-' (e.g. 2.0.0-rc1).
"""
import re, sys, glob

if len(sys.argv) != 2 or not re.fullmatch(r'[0-9A-Za-z][0-9A-Za-z.+-]*', sys.argv[1]):
    sys.exit(__doc__)
V = sys.argv[1]
VER = r'[0-9A-Za-z.+-]+'
for f in sorted(glob.glob('js/*.js')):
    s = open(f, encoding='utf-8').read()
    s = re.sub(r"(['\"])(\./[\w/]+\.js)(\?v=" + VER + r")?\1", lambda m: f"{m.group(1)}{m.group(2)}?v={V}{m.group(1)}", s)
    s = re.sub(r"\./lang/\$\{code\}\.js(\?v=" + VER + r")?", f"./lang/${{code}}.js?v={V}", s)
    s = re.sub(r"APP_VERSION = '" + VER + "'", f"APP_VERSION = '{V}'", s)
    open(f, 'w', encoding='utf-8').write(s)
h = open('index.html', encoding='utf-8').read()
h = re.sub(r'(js/app\.js|js/boot\.js|css/app\.css)(\?v=' + VER + r')?"', lambda m: f'{m.group(1)}?v={V}"', h)
open('index.html', 'w', encoding='utf-8').write(h)
# texts for the pre-app screens in js/boot.js, taken from the language files (needs node)
import json, subprocess
keys = ['boot_fail_title', 'boot_fail_body', 'boot_fail_hint', 'clean_start', 'resetting', 'update_browser']
js = ("const {EN,LANGS}=await import('./js/i18n.js');const out={en:{}};for(const k of %s)out.en[k]=EN[k];"
      "for(const [l] of LANGS.slice(1)){const m=(await import('./js/lang/'+l+'.js')).default;out[l]={};for(const k of %s)out[l][k]=m[k]||EN[k];}"
      "process.stdout.write(JSON.stringify(out));") % (json.dumps(keys), json.dumps(keys))
boot_i18n = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, check=True).stdout
b = open('js/boot.js', encoding='utf-8').read()
b, n = re.subn(r"/\*I18N\*/.*?/\*END\*/", lambda m: '/*I18N*/' + boot_i18n.replace('</', '<\\/') + '/*END*/', b, flags=re.S)
if n != 1:
    sys.exit('js/boot.js: I18N marker not found')
open('js/boot.js', 'w', encoding='utf-8').write(b)
w = open('sw.js', encoding='utf-8').read()
w, n = re.subn(r"const APP_V = '" + VER + "';", f"const APP_V = '{V}';", w)
if n != 1:
    sys.exit('sw.js: APP_V not found')
open('sw.js', 'w', encoding='utf-8').write(w)
print('stamped', V)
