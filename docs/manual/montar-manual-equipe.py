"""Monta a central de ajuda independente a partir do conteúdo editorial."""
from pathlib import Path
from html import escape
import base64,json,re,subprocess

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
CATEGORIES={
 'primeiros-passos':('Primeiros passos','Entenda a rotina, sua conta e os perfis de acesso.','<path d="M3 10 12 3l9 7v10H3Z"/><path d="M9 20v-7h6v7"/>'),
 'clientes':('Clientes e contatos','Cadastre, encontre e entenda cada relacionamento.','<path d="M4 21V4h11v17M15 9h5v12M8 8h3M8 12h3M8 16h3M2 21h20"/>'),
 'agenda':('Atividades e visitas','Organize compromissos, resultados e próximos passos.','<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-12 5 2 2 4-4"/>'),
 'funis-vendas':('Funis e vendas','Avance com critérios e registre decisões comerciais.','<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M5 8h2m4 4h2m4 4h2"/>'),
 'propostas':('Propostas','Prepare o documento, envie e acompanhe o retorno.','<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h6"/>'),
 'rotas':('Rotas','Planeje deslocamentos e confira a agenda de campo.','<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h8"/>'),
 'metas-gestao':('Metas, Painel e Gestão','Interprete resultados e transforme alertas em ações.','<path d="M4 4v16h17M8 16v-4m5 4V7m5 9V4"/>'),
 'ia-whatsapp':('IA e WhatsApp','Peça registros, confirme visitas e acompanhe respostas.','<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/><path d="M8 10h8m-8 4h5"/>'),
 'administracao':('Administração','Configure o processo, a equipe e a qualidade do atendimento.','<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/>'),
 'solucionar':('Resolver uma dificuldade','Confira filtros, resultados e como pedir ajuda.','<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01"/>'),
}

def icon(category):
 return '<svg viewBox="0 0 24 24" aria-hidden="true">'+CATEGORIES[category][2]+'</svg>'
def arrow():
 return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>'
def uri(path,mime):
 return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()
def heading(id,key,title):
 return '<h2 id="'+id+'--'+key+'">'+title+'</h2>'
def related_link(article):
 return '<a href="#'+article['id']+'">'+escape(article['title'])+arrow()+'</a>'
def flow(items,title='Sequência de trabalho'):
 return '<figure class="process-figure"><figcaption>'+escape(title)+'</figcaption><div class="process-flow">'+''.join('<div class="flow-item"><span>'+str(i+1).zfill(2)+'</span>'+escape(text)+'</div>' for i,text in enumerate(items))+'</div></figure>'

def build():
 articles=json.loads((HERE/'conteudo-ajuda.json').read_text(encoding='utf-8'))
 by_id={a['id']:a for a in articles}
 assert len(by_id)==len(articles) and all(a.get("outcome") for a in articles)
 for article in articles:
  assert article['category'] in CATEGORIES
  assert all(id in by_id for id in article.get('related',[]))
 logo=uri(ROOT/'web/public/brand/tawper-logo.png','image/png')
 fonts=''
 for weight in [400,500,600,700]:
  path=ROOT/'web/node_modules/@fontsource/poppins/files'/f'poppins-latin-{weight}-normal.woff2'
  fonts+=f"@font-face{{font-family:Poppins;font-weight:{weight};font-style:normal;font-display:swap;src:url('{uri(path,'font/woff2')}') format('woff2')}}\n"
 category_cards='';sidebar=''
 for key,(title,description,_) in CATEGORIES.items():
  count=sum(a['category']==key for a in articles)
  attrs='data-category-id="'+key+'" data-category-name="'+escape(title,quote=True)+'"'
  category_cards+='<a class="category-card" href="#categoria/'+key+'" '+attrs+'><span class="category-icon">'+icon(key)+'</span><div><h3>'+title+'</h3><p>'+description+'</p><small>'+str(count)+' artigos</small></div></a>'
  sidebar+='<a href="#categoria/'+key+'" '+attrs+'>'+icon(key)+title+'</a>'
 bodies=''
 for a in articles:
  id=a['id'];category_name=CATEGORIES[a['category']][0]
  body='<div class="article-kicker">'+category_name+'</div><h1>'+escape(a['title'])+'</h1><p class="article-summary">'+escape(a['summary'])+'</p><div class="audience"><b>Para quem:</b> '+escape(a.get('permissions','Conforme seu perfil e carteira'))+'</div>'
  if a.get('before'):
   body+=heading(id,'antes','Antes de começar')+'<div class="before-list"><ul>'+''.join('<li>'+escape(x)+'</li>' for x in a['before'])+'</ul></div>'
  if a.get('flow'):body+=flow(a['flow'])
  if a.get('comparison'):
   body+='<div class="comparison">'+''.join('<div class="comparison-card"><h3>'+escape(x['title'])+'</h3><p>'+escape(x['text'])+'</p></div>' for x in a['comparison'])+'</div>'
  for journey in a.get('journeys',[]):body+=flow(journey['items'],journey['title'])
  body+=heading(id,'passos','Como fazer')+'<ol class="step-list">'+''.join('<li class="step"><span class="step-number">'+str(i+1)+'</span><div><h3>'+escape(s['title'])+'</h3><p>'+escape(s['text'])+'</p></div></li>' for i,s in enumerate(a['steps']))+'</ol>'
  if a.get('table'):
   t=a['table'];body+=heading(id,'referencia','Consulte durante o uso')+'<div class="table-wrap"><table><thead><tr>'+''.join('<th scope="col">'+escape(x)+'</th>' for x in t['headers'])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+escape(x)+'</td>' for x in row)+'</tr>' for row in t['rows'])+'</tbody></table></div>'
  if a.get('extra'):body+='<h3>'+escape(a['extra']['title'])+'</h3><p>'+escape(a['extra']['text'])+'</p>'
  if a.get('example'):
   e=a['example'];body+=heading(id,'exemplo','Exemplo de uso')+'<div class="example"><div class="example-label">Situação didática, sem dados de pessoas ou empresas</div>'+''.join('<div class="example-part"><b>'+label+'</b><p>'+escape(e[key])+'</p></div>' for key,label in [('situation','Situação'),('action','O que fazer ou pedir'),('result','O que esperar')])+'</div>'
  if a.get('cases'):
   body+=heading(id,'situacoes','O que fazer em cada situação')+'<div data-cases><div class="case-choices">'+''.join('<button type="button" data-case="'+str(i)+'" aria-pressed="'+str(i==0).lower()+'">'+escape(c['title'])+'</button>' for i,c in enumerate(a['cases']))+'</div>'
   body+=''.join('<div class="case-answer" data-case-panel="'+str(i)+'"'+(' hidden' if i else '')+'><h3>'+escape(c['title'])+'</h3><p>'+escape(c['text'])+'</p></div>' for i,c in enumerate(a['cases']))+'</div>'
  if a.get('timeline'):
   body+=heading(id,'prazos','Entenda os prazos')+'<div class="timeline">'+''.join('<div class="timeline-item"><strong>'+escape(x['time'])+'</strong><p>'+escape(x['text'])+'</p></div>' for x in a['timeline'])+'</div>'
  if a.get('checklist'):
   body+=heading(id,'conferir','Confira antes de seguir')+'<ul class="checklist">'+''.join('<li><label><input type="checkbox">'+escape(x)+'</label></li>' for x in a['checklist'])+'</ul><p class="check-hint">Lista de apoio para sua revisão; marcar aqui não altera o sistema.</p>'
  if a.get('callout'):
   body+='<aside class="callout"><strong>'+escape(a['callout']['title'])+'</strong><p>'+escape(a['callout']['text'])+'</p></aside>'
  body+=heading(id,'resultado','Como conferir o resultado')+'<div class="success"><b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>Resultado esperado</b><p>'+escape(a['outcome'])+'</p></div>'
  if a.get('faq'):
   body+=heading(id,'duvidas','Dúvidas sobre este assunto')+'<div class="faq">'+''.join('<details><summary>'+escape(x['q'])+'</summary><p>'+escape(x['a'])+'</p></details>' for x in a['faq'])+'</div>'
  if a.get('related'):
   body+='<section class="related-section">'+heading(id,'relacionados','Continue por aqui')+'<div class="related-links">'+''.join(related_link(by_id[key]) for key in a['related'])+'</div></section>'
  body+='<div class="article-end">Ainda precisa de ajuda? <a href="#pedir-ajuda">Veja como explicar o problema ao responsável pelo sistema.</a></div>'
  bodies+='<article class="help-article" id="'+id+'" data-title="'+escape(a['title'],quote=True)+'" data-category="'+a['category']+'" data-category-name="'+escape(category_name,quote=True)+'" hidden>'+body+'</article>\n'
 popular=['cadastrar-cliente','registrar-atividade','avancar-etapa','confirmar-visita','enviar-proposta','cliente-nao-aparece']
 popular_links=''.join('<a class="article-link" href="#'+key+'">'+escape(by_id[key]['title'])+arrow()+'</a>' for key in popular)
 shortcuts=''.join('<a href="#'+key+'">'+label+'</a>' for key,label in [('cadastrar-cliente','Cadastrar cliente'),('confirmar-visita','Confirmar visita'),('preparar-proposta','Preparar proposta'),('planejar-rota','Planejar rota')])
 search_svg='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>'
 html=f'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a1d3f"><meta name="description" content="Central de ajuda Tawper. Aprenda a cadastrar clientes, organizar atividades, usar funis, propostas, rotas e IA."><title>Central de ajuda · Tawper</title><style>{fonts}{(HERE/'central-ajuda.css').read_text(encoding='utf-8')}</style></head><body>
<a class="skip" href="#conteudo">Ir para o conteúdo</a><header class="site-header"><div class="header-inner"><a class="brand-link" href="#inicio" aria-label="Tawper — início da central de ajuda"><img data-brand src="{logo}" alt="Tawper" width="141" height="40"></a><span class="header-label">Central de ajuda</span><div class="header-actions"><button class="button" id="focus-search" type="button" aria-label="Buscar na central de ajuda">{search_svg}<span class="label-wide">Buscar ajuda</span></button><button class="button" id="print-article" type="button" hidden>Imprimir artigo</button></div></div></header>
<main id="conteudo" tabindex="-1"><section id="help-home"><div class="home-hero"><div class="eyebrow">Orientação para o dia a dia</div><h1>Como podemos ajudar?</h1><p class="hero-description">Encontre o caminho para realizar uma tarefa, entender uma regra ou resolver uma dúvida no Tawper.</p><form role="search" id="help-search-form"><label class="sr-only" for="help-search">O que você precisa fazer?</label><div class="search-box">{search_svg}<input id="help-search" type="search" placeholder="Ex.: como cadastrar um cliente ou confirmar uma visita" autocomplete="off"><button class="clear-search" id="clear-search" type="button" aria-label="Limpar busca" hidden>×</button></div></form><p class="search-hint" id="search-status" role="status" aria-live="polite">Procure por uma ação, assunto ou dúvida.</p><div class="shortcuts">{shortcuts}</div></div>
<section class="home-section" id="result-section" hidden><div class="section-heading"><h2 id="result-title">Artigos</h2><p id="result-count"></p></div><div id="result-list"></div><a class="button" href="#inicio">Ver todos os assuntos</a></section>
<section class="home-section" id="category-section"><div class="section-heading"><h2>Explore por assunto</h2><p>Da primeira abordagem ao acompanhamento da equipe.</p></div><div class="category-grid">{category_cards}</div></section>
<section class="home-section" id="popular-section"><div class="section-heading"><h2>Preciso fazer agora</h2><p>Comece por uma destas tarefas.</p></div><div class="article-links">{popular_links}</div></section>
<div class="help-banner">{icon('solucionar')}<div><h3>Não encontrou o que precisava?</h3><p>Confira os filtros, a mensagem exibida e o resultado esperado. <a href="#pedir-ajuda">Veja como pedir ajuda com as informações necessárias.</a></p></div></div></section>
<div class="article-layout" id="article-layout" hidden><aside class="category-sidebar"><p class="sidebar-label">Assuntos</p><nav aria-label="Categorias de ajuda">{sidebar}</nav></aside><div class="article-column"><nav class="breadcrumb" aria-label="Caminho do artigo"><a href="#inicio">Central de ajuda</a><span>›</span><a id="breadcrumb-category" href="#inicio"></a><span>›</span><span id="breadcrumb-title"></span></nav>{bodies}</div><aside class="article-toc"><p>Neste artigo</p><nav id="article-toc-links" aria-label="Seções do artigo"></nav></aside></div></main>
<footer class="site-footer"><span>Tawper · Central de ajuda da equipe</span><a href="#inicio">Voltar ao início</a></footer><script>{(HERE/'central-ajuda.js').read_text(encoding='utf-8')}</script></body></html>'''
 html=html.replace('<script>','<script type="module">').replace('</script>','\ninitializeHelpCenter(document);\n</script>')
 for name in ['central-de-ajuda.html','manual-tawper.html']:(HERE/name).write_text(html,encoding='utf-8')
 component_dir=ROOT/'web/src/components/help'
 content_dir=ROOT/'web/src/content'
 component_dir.mkdir(parents=True,exist_ok=True)
 content_dir.mkdir(parents=True,exist_ok=True)
 (component_dir/'help-center-runtime.js').write_text('// Gerado a partir de docs/manual/central-ajuda.js.\n'+(HERE/'central-ajuda.js').read_text(encoding='utf-8'),encoding='utf-8')
 inner=re.search(r'<main id="conteudo"[^>]*>([\s\S]*?)</main>',html).group(1)
 tools='<div class="embedded-tools"><span>Central de ajuda</span><div class="header-actions"><button class="button" id="focus-search" type="button" aria-label="Buscar na central de ajuda">Buscar ajuda</button><button class="button" id="print-article" type="button" hidden>Imprimir artigo</button></div></div>'
 fragment='<div id="conteudo" class="help-content" tabindex="-1">'+tools+inner+'</div>'
 (content_dir/'help-center.generated.ts').write_text('// Gerado por docs/manual/montar-manual-equipe.py; edite conteudo-ajuda.json.\nexport const HELP_CONTENT = '+json.dumps(fragment,ensure_ascii=False)+';\n',encoding='utf-8')
 subprocess.run(['node',str(ROOT/'web/scripts/build-help-css.mjs')],cwd=ROOT/'web',check=True)
 print(f'Central de ajuda criada: {len(articles)} artigos, {len(CATEGORIES)} assuntos, sem capturas ou dados pessoais.')

if __name__=='__main__':build()
