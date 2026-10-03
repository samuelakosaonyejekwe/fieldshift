#!/usr/bin/env python3
"""Stamp every module URL with the app version so browsers always load one matching set of files.
Usage: python3 tools_release.py 1.9.0"""
import re, sys, glob
V = sys.argv[1]
for f in glob.glob('js/*.js'):
    s = open(f, encoding='utf-8').read()
    s = re.sub(r"(['\"])(\./[\w/]+\.js)(\?v=[\w.]+)?\1", lambda m: f"{m.group(1)}{m.group(2)}?v={V}{m.group(1)}", s)
    s = re.sub(r"\./lang/\$\{code\}\.js(\?v=[\w.]+)?", f"./lang/${{code}}.js?v={V}", s)
    s = re.sub(r"APP_VERSION = '[\w.]+'", f"APP_VERSION = '{V}'", s)
    open(f, 'w', encoding='utf-8').write(s)
h = open('index.html', encoding='utf-8').read()
h = re.sub(r'(js/app\.js|css/app\.css)(\?v=[\w.]+)?"', lambda m: f'{m.group(1)}?v={V}"', h)
open('index.html', 'w', encoding='utf-8').write(h)
w = open('sw.js', encoding='utf-8').read()
w = re.sub(r"const VER = 'fieldshift-[\w.]+';", f"const VER = 'fieldshift-{V}';", w)
open('sw.js', 'w', encoding='utf-8').write(w)
print('stamped', V)
