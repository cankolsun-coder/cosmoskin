#!/usr/bin/env python3
from __future__ import annotations
import json, re, sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT / 'qa' / 'evidence' / 'additional-quality-gates.json'
EXCLUDED_DIRS = {'.git','node_modules','.cache','__pycache__','test-results','playwright-report'}

def files(exts=None):
    for p in ROOT.rglob('*'):
        if not p.is_file() or any(part in EXCLUDED_DIRS for part in p.parts):
            continue
        if exts is None or p.suffix.lower() in exts:
            yield p

def rel(p): return p.relative_to(ROOT).as_posix()

checks = {}

# CSS structural parser: strips comments and verifies strings/braces are balanced.
css_issues=[]
for p in files({'.css'}):
    s=p.read_text('utf-8', errors='replace')
    s=re.sub(r'/\*.*?\*/','',s,flags=re.S)
    depth=0; quote=None; esc=False
    for i,ch in enumerate(s):
        if quote:
            if esc: esc=False
            elif ch=='\\': esc=True
            elif ch==quote: quote=None
        else:
            if ch in ('"',"'"): quote=ch
            elif ch=='{': depth+=1
            elif ch=='}':
                depth-=1
                if depth<0:
                    css_issues.append({'file':rel(p),'error':'unexpected closing brace','offset':i}); break
    if quote: css_issues.append({'file':rel(p),'error':'unterminated string'})
    if depth!=0: css_issues.append({'file':rel(p),'error':f'unbalanced braces: {depth}'})
checks['css_structural_parse']={'passed':not css_issues,'files':sum(1 for _ in files({'.css'})),'issues':css_issues}

# SQL lexical safeguards: balanced dollar quote tags and no destructive bare DROP in new hardening migrations.
sql_issues=[]
for p in files({'.sql'}):
    s=p.read_text('utf-8', errors='replace')
    tags=re.findall(r'\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$',s)
    for tag in set(tags):
        if tags.count(tag)%2:
            sql_issues.append({'file':rel(p),'error':f'unbalanced dollar quote {tag}'})
    if p.name.startswith('20260616_'):
        for m in re.finditer(r'(?im)^\s*DROP\s+(TABLE|COLUMN|SCHEMA)\b(?!.*IF\s+EXISTS)',s):
            sql_issues.append({'file':rel(p),'error':f'potential destructive statement: {m.group(0).strip()}'})
checks['sql_lexical_safety']={'passed':not sql_issues,'files':sum(1 for _ in files({'.sql'})),'issues':sql_issues}

# Environment references vs .env.example.
env_refs={}
pat=re.compile(r'\b(?:env|context\.env)\.([A-Z][A-Z0-9_]*)\b|\bprocess\.env\.([A-Z][A-Z0-9_]*)\b')
for p in files({'.js','.mjs','.cjs'}):
    s=p.read_text('utf-8', errors='replace')
    for m in pat.finditer(s):
        key=m.group(1) or m.group(2)
        env_refs.setdefault(key,set()).add(rel(p))
env_file=ROOT/'.env.example'
defined=set(re.findall(r'^([A-Z][A-Z0-9_]*)=',env_file.read_text('utf-8'),flags=re.M)) if env_file.exists() else set()
missing=sorted(set(env_refs)-defined)
checks['environment_reference_coverage']={'passed':not missing,'referenced':len(env_refs),'defined':len(defined),'missing':missing,'references':{k:sorted(v) for k,v in sorted(env_refs.items())}}

# Secret scan: high-confidence private key, live secret key or hard-coded sensitive assignment.
secret_issues=[]
assignment=re.compile(r'(?i)\b(ADMIN_TOKEN|ADMIN_SESSION_SECRET|IYZICO_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET)\b\s*[:=]\s*["\']([^"\']{12,})["\']')
jwt=re.compile(r'eyJ[A-Za-z0-9_-]{25,}\.eyJ[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{20,}')
for p in files({'.js','.mjs','.cjs','.json','.html','.sql','.md','.toml','.yml','.yaml','.txt'}):
    if p.name=='.env.example' or '/fixtures/' in '/'+rel(p):
        continue
    s=p.read_text('utf-8', errors='replace')
    if '-----BEGIN PRIVATE KEY-----' in s or '-----BEGIN RSA PRIVATE KEY-----' in s:
        secret_issues.append({'file':rel(p),'error':'private key material'})
    for m in assignment.finditer(s):
        value=m.group(2)
        if any(token in value.lower() for token in ('placeholder','replace-with','your_','process.env','context.env','service-test','set-in-shell-only')):
            continue
        secret_issues.append({'file':rel(p),'error':f'hard-coded {m.group(1)}'})
    for m in jwt.finditer(s):
        # Public anon JWTs are browser-safe; service-role JWTs conventionally contain role=service_role.
        token=m.group(0)
        if 'service_role' in s[max(0,m.start()-200):m.end()+200]:
            secret_issues.append({'file':rel(p),'error':'possible service-role JWT'})
checks['secret_scan']={'passed':not secret_issues,'files_scanned':sum(1 for _ in files()),'issues':secret_issues}

# Iyzico fixture JSON parse and callback harness presence.
fixture_issues=[]
for p in (ROOT/'scripts'/'fixtures'/'iyzico').glob('*.json') if (ROOT/'scripts'/'fixtures'/'iyzico').exists() else []:
    try: json.loads(p.read_text('utf-8'))
    except Exception as e: fixture_issues.append({'file':rel(p),'error':str(e)})
required=[ROOT/'scripts'/'replay-iyzico-callback.mjs',ROOT/'supabase'/'verification'/'20260616_prelaunch_verification.sql',ROOT/'supabase'/'rollback'/'20260616_prelaunch_recovery.sql']
for p in required:
    if not p.exists(): fixture_issues.append({'file':rel(p),'error':'required readiness artifact missing'})
checks['readiness_artifacts']={'passed':not fixture_issues,'issues':fixture_issues,'required':[rel(p) for p in required]}

result={'root':str(ROOT),'checks':checks,'passed':sum(1 for v in checks.values() if v['passed']),'failed':sum(1 for v in checks.values() if not v['passed'])}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf-8')
print(json.dumps({'out':str(OUT),'passed':result['passed'],'failed':result['failed'],'details':{k:{'passed':v['passed'],'issues':len(v.get('issues',[])),'missing':len(v.get('missing',[]))} for k,v in checks.items()}},ensure_ascii=False,indent=2))
sys.exit(1 if result['failed'] else 0)
