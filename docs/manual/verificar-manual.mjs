import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url));
const html=readFileSync(resolve(here,'central-de-ajuda.html'),'utf8');
const compatibility=readFileSync(resolve(here,'manual-tawper.html'),'utf8');
assert.equal(html,compatibility,'O endereco anterior precisa conter a mesma central');
const content=JSON.parse(readFileSync(resolve(here,'conteudo-ajuda.json'),'utf8'));
assert.equal(content.length,44);
assert.equal((html.match(/<article class="help-article"/g)||[]).length,44);
assert.equal(new Set(content.map(a=>a.category)).size,10);
for(const article of content){
 assert.ok(article.summary && article.outcome && article.steps.length>=3);
 for(const id of article.related||[])assert.ok(content.some(a=>a.id===id));
}
const imgs=Array.from(html.matchAll(/<img\b[^>]+>/g));
assert.equal(imgs.length,1,'Somente o logotipo deve ser uma imagem');
assert.match(imgs[0][0],/data-brand/);
const logoData=imgs[0][0].match(/src="data:image\/png;base64,([^"]+)"/)[1];
const originalLogo=readFileSync(resolve(here,'../../web/public/brand/tawper-logo.png'));
assert.equal(createHash('sha256').update(Buffer.from(logoData,'base64')).digest('hex'),createHash('sha256').update(originalLogo).digest('hex'));
assert.doesNotMatch(html,/<(?:iframe|canvas|video|pre|code)\b|data:image\/jpeg|screen-assets|data-gallery|CAPTURAS-DO-MANUAL/);
const visible=html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,'');
assert.doesNotMatch(visible,/Carlos|Lisboa|Douglas|Murilo|Phedro|Adriana|Vagner|Usina Horizonte|Rio Claro do Norte|metricz|duimdczy|Supabase|PostgreSQL|Zustand|PGlite|checkout|c92da7e|web\/src|confirmar_visita_cliente|consultar_crm|snapshot/i);
assert.doesNotMatch(visible,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\(\d{2}\)\s?\d{4,5}[- ]\d{4}/i);
assert.doesNotMatch(html,/sb_(?:secret|publishable)_[A-Za-z0-9_-]+|fetch\(|XMLHttpRequest|sendBeacon|localStorage|https:\/\//i);
assert.match(html,/font-family:Poppins/);
assert.match(html,/--navy:#0a1d3f/);
const ids=Array.from(visible.matchAll(/<[a-z][^<>]*\sid="([^"]+)"/gi),m=>m[1]);
assert.equal(ids.length,new Set(ids).size);
for(const [,hash] of visible.matchAll(/href="#([^"]+)"/g)){
 if(hash==='inicio')continue;
 if(hash.startsWith('categoria/')){assert.ok(content.some(a=>a.category===hash.slice(10)));continue;}
 assert.ok(ids.includes(hash),'Destino inexistente: '+hash);
}
console.log('OK: 44 artigos, 10 categorias, links e resultados completos; sem prints, dados pessoais, credenciais, blocos de codigo ou chamadas externas.');
