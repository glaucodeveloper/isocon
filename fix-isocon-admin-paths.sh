#!/usr/bin/env bash
set -euo pipefail

ROOT="."
SITE_DIR="${SITE_DIR:-$ROOT/website}"
APP_JS="$SITE_DIR/assets/js/app.js"
CATALOG="$SITE_DIR/data/catalog.json"

if [[ ! -f "$APP_JS" ]]; then
  echo "Erro: não encontrei $APP_JS"
  echo "Execute este script na raiz do repositório ISOCON ou defina SITE_DIR."
  exit 1
fi

if [[ ! -f "$CATALOG" ]]; then
  echo "Erro: não encontrei $CATALOG"
  exit 1
fi

cp "$APP_JS" "$APP_JS.bak.$(date +%Y%m%d-%H%M%S)"

python3 - "$APP_JS" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
src = path.read_text(encoding="utf-8")
original = src

src, count = re.subn(
    r'const cfg=\{owner:"glaucodeveloper",repo:"isocon",branch:"main",path:"[^"]+"\};',
    'const cfg={owner:"glaucodeveloper",repo:"isocon",branch:"main",path:"website/data/catalog.json"};',
    src,
    count=1,
)
if count == 0:
    raise SystemExit("Não foi possível localizar a declaração const cfg no app.js.")

read_pattern = re.compile(r'async function readRemote\(token\)\{.*?\n\}', re.S)
read_replacement = '''async function readRemote(token){
 const url=`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`;
 const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json"}});
 if(r.status===404){
   return {sha:null,data:structuredClone(state.data),missing:true};
 }
 if(!r.ok){
   let detail="";
   try{detail=(await r.json()).message||""}catch{}
   throw Error(detail||"Não foi possível ler o catálogo no GitHub.");
 }
 const j=await r.json();
 const decoded=decodeURIComponent(escape(atob(j.content.replace(/\\n/g,""))));
 return {sha:j.sha,data:JSON.parse(decoded),missing:false};
}'''
src, count = read_pattern.subn(read_replacement, src, count=1)
if count == 0:
    raise SystemExit("Não foi possível localizar readRemote(token) no app.js.")

write_pattern = re.compile(r'async function writeRemote\(token,data,sha,message\)\{.*?\n\}', re.S)
write_replacement = '''async function writeRemote(token,data,sha,message){
 const body={
   message,
   content:btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2)))),
   branch:cfg.branch
 };
 if(sha) body.sha=sha;

 const r=await fetch(
   `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`,
   {
     method:"PUT",
     headers:{
       Authorization:`Bearer ${token}`,
       Accept:"application/vnd.github+json",
       "Content-Type":"application/json"
     },
     body:JSON.stringify(body)
   }
 );

 if(!r.ok){
   let detail="";
   try{detail=(await r.json()).message||""}catch{}
   throw Error(detail||"Falha ao salvar o catálogo no GitHub.");
 }
 return r.json();
}'''
src, count = write_pattern.subn(write_replacement, src, count=1)
if count == 0:
    raise SystemExit("Não foi possível localizar writeRemote(token,data,sha,message) no app.js.")

old_load = 'async load(){try{this.remote=await readRemote(state.token);state.data=this.remote.data;this.dashboard()}catch(e){sessionStorage.removeItem("isoconPat");state.token="";this.login()}}'
new_load = '''async load(){
 try{
   this.remote=await readRemote(state.token);
   state.data=this.remote.data;
   this.dashboard();
 }catch(e){
   console.error(e);
   sessionStorage.removeItem("isoconPat");
   state.token="";
   this.login();
   queueMicrotask(()=>{
     const out=this.querySelector("#err");
     if(out) out.textContent=e.message;
   });
 }
}'''
if old_load in src:
    src = src.replace(old_load, new_load, 1)

src = src.replace(
    'type="password" class="form-control form-control-lg mb-3" name="token"',
    'type="password" autocomplete="current-password" class="form-control form-control-lg mb-3" name="token"',
)

if src == original:
    raise SystemExit("Nenhuma alteração foi aplicada.")

path.write_text(src, encoding="utf-8")
print(f"Arquivo corrigido: {path}")
PY

python3 -m json.tool "$CATALOG" >/dev/null

echo
echo "Correções aplicadas:"
echo "  - API do GitHub usa: website/data/catalog.json"
echo "  - 404 usa o catálogo local como base"
echo "  - primeiro salvamento cria o arquivo sem enviar sha"
echo "  - atualizações posteriores enviam o sha atual"
echo "  - campo PAT usa autocomplete=current-password"
echo
echo "Próximos comandos:"
echo "  git add website/assets/js/app.js website/data/catalog.json"
echo '  git commit -m "fix: corrige caminho e criação do catálogo administrativo"'
echo "  git push origin main"
