#!/usr/bin/env python3
"""Stamp every app-file URL with the release version so browsers always load one matching set of files,
regenerate the service worker's language and demo-farm lists from their sources, and refuse to release
if the read-aloud voices or demo-farm practices are out of step. Needs Python 3 and Node.js.

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
# single sources of truth: languages from js/i18n.js LANGS, demo farms from data/demo/*.json
meta = json.loads(subprocess.run(['node', '--input-type=module', '-e',
    "const {LANGS}=await import('./js/i18n.js');const {DEMOS}=await import('./js/data.js');"
    "process.stdout.write(JSON.stringify({langs:LANGS.map(x=>x[0]),demos:DEMOS.map(x=>x[0])}))"],
    capture_output=True, text=True, check=True).stdout)
langs = [l for l in meta['langs'] if l != 'en']
demos = sorted(f[:-5] for f in glob.glob('data/demo/*.json') for f in [f.split('/')[-1]])
problems = []
missing_lang_files = [l for l in langs if not glob.glob(f'js/lang/{l}.js')]
if missing_lang_files: problems.append(f'language files missing: {missing_lang_files}')
if sorted(meta['demos']) != demos: problems.append(f'data.js DEMOS {sorted(meta["demos"])} != data/demo files {demos}')
appjs = open('js/app.js', encoding='utf-8').read()
voice = re.search(r"const VOICE = \{(.*?)\};", appjs, re.S).group(1)
missing_voice = [l for l in meta['langs'] if not re.search(r"\b" + l + r":", voice)]
if missing_voice: problems.append(f'app.js VOICE has no locale for: {missing_voice}')
practice = re.search(r"const DEMO_PRACTICE = \{(.*?)\n\};", appjs, re.S).group(1)
missing_practice = [d for d in demos if not re.search(r"\b" + d + r":", practice)]
if missing_practice: problems.append(f'app.js DEMO_PRACTICE has no entry for: {missing_practice}')
if problems:
    sys.exit('release blocked:\n  ' + '\n  '.join(problems))
w = open('sw.js', encoding='utf-8').read()
w, n1 = re.subn(r"const LANG_FILES = \[.*?\]\.map", "const LANG_FILES = " + json.dumps(langs).replace('"', "'") + ".map", w, flags=re.S)
w, n2 = re.subn(r"const DEMOS = \[.*?\]\.map", "const DEMOS = " + json.dumps(demos) + ".map", w, flags=re.S)
if n1 != 1 or n2 != 1:
    sys.exit('sw.js: LANG_FILES/DEMOS lists not found')
open('sw.js', 'w', encoding='utf-8').write(w)
w = open('sw.js', encoding='utf-8').read()
w, n = re.subn(r"const APP_V = '" + VER + "';", f"const APP_V = '{V}';", w)
if n != 1:
    sys.exit('sw.js: APP_V not found')
open('sw.js', 'w', encoding='utf-8').write(w)
print('stamped', V)
