"""Verifica navegação e privacidade da central local; nenhum acesso externo."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,tempfile
HERE=Path(__file__).resolve().parent

def verify():
 output=Path(tempfile.mkdtemp(prefix='tawper-central-ajuda-qa-'))
 articles=json.loads((HERE/'conteudo-ajuda.json').read_text(encoding='utf-8'))
 errors=[];external=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  page=browser.new_page(viewport={'width':1440,'height':1000},color_scheme='light')
  def route(request):
   if request.request.url.startswith(('http://','https://')):external.append(request.request.url);request.abort()
   else:request.continue_()
  page.route('**/*',route)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto((HERE/'central-de-ajuda.html').as_uri())
  page.evaluate('document.fonts.ready')
  assert page.locator('#help-home').is_visible()
  assert page.locator('.help-article:visible').count()==0
  assert page.locator('img').count()==1 and page.locator('[data-brand]').evaluate('(e)=>e.naturalWidth')>0
  assert page.locator('.category-card').count()==10
  assert page.locator('code,pre,iframe,canvas').count()==0
  assert page.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
  page.screenshot(path=str(output/'inicio.png'),full_page=True)

  # O usuario encontra uma tarefa, incluindo a busca com acentos omitidos.
  for query,key in [('como cadastrar um cliente','cadastrar-cliente'),('confirmacao visita','confirmar-visita'),('cliente nao aparece','cliente-nao-aparece'),('regressao','metas-resultados')]:
   page.locator('#help-search').fill(query)
   assert page.locator('#result-list a[href="#'+key+'"]').count()==1,(query,key)
  page.locator('#help-search').fill('busca-inexistente-xyz')
  assert page.locator('.empty-result').is_visible()
  page.locator('#clear-search').click()
  assert page.locator('#category-section').is_visible()
  page.locator('.category-card[data-category-id="clientes"]').click()
  page.wait_for_function("document.querySelector('#result-title').textContent==='Clientes e contatos'")
  assert page.locator('.result-card').count()==5
  page.locator('#result-list a[href="#cadastrar-cliente"]').click()
  page.wait_for_selector('#cadastrar-cliente:visible')
  assert page.locator('.help-article:visible').count()==1
  assert page.locator('#article-toc-links a').count()>=4
  page.locator('#article-toc-links a[href="#cadastrar-cliente--passos"]').click()
  assert page.locator('#cadastrar-cliente').is_visible()
  checklist=page.locator('#cadastrar-cliente .checklist input').first
  checklist.check();assert checklist.is_checked()
  page.locator('#cadastrar-cliente details').first.locator('summary').click()
  assert page.locator('#cadastrar-cliente details').first.get_attribute('open') is not None
  page.screenshot(path=str(output/'artigo-cadastro.png'),full_page=True)

  # Todos os artigos sao alcancaveis por endereco, com passos e resultado.
  for article in articles:
   key=article['id']
   page.evaluate('(key)=>location.hash=key',key)
   page.wait_for_selector('#'+key+':visible')
   assert page.locator('.help-article:visible').count()==1
   assert page.locator('#'+key+' .step').count()>=3
   assert page.locator('#'+key+' .success p').inner_text().strip()
  page.evaluate("location.hash='confirmar-visita'")
  page.wait_for_selector('#confirmar-visita:visible')
  page.locator('#confirmar-visita [data-case="1"]').click()
  assert page.locator('#confirmar-visita [data-case-panel="1"]').is_visible()
  assert not page.locator('#confirmar-visita [data-case-panel="0"]').is_visible()

  # Voltar ao inicio tambem funciona quando o endereco ja e #inicio.
  page.locator('#focus-search').click()
  page.wait_for_selector('#help-home:visible')
  page.locator('#help-search').fill('proposta')
  page.locator('#result-section a[href="#inicio"]').click()
  assert page.locator('#category-section').is_visible()
  page.locator('#help-search').fill('cliente')
  page.locator('#result-section a[href="#inicio"]').click()
  assert page.locator('#category-section').is_visible()
  page.evaluate("location.hash='artigo-inexistente'")
  page.wait_for_timeout(100)
  assert page.locator('#help-home').is_visible()

  page.set_viewport_size({'width':390,'height':844})
  page.evaluate("location.hash='inicio'")
  page.wait_for_timeout(100)
  assert page.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
  page.screenshot(path=str(output/'inicio-celular.png'),full_page=True)
  for article in articles:
   page.evaluate('(key)=>location.hash=key',article['id'])
   page.wait_for_selector('#'+article['id']+':visible')
   assert page.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth'),'overflow: '+article['id']
  page.evaluate("location.hash='cliente-sem-resposta'")
  page.wait_for_selector('#cliente-sem-resposta:visible')
  page.screenshot(path=str(output/'prazos-celular.png'),full_page=True)
  page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
  assert page.locator('#cliente-sem-resposta details[open]').count()==2
  page.evaluate("window.dispatchEvent(new Event('afterprint'))")
  assert page.locator('#cliente-sem-resposta details[open]').count()==0
  page.emulate_media(media='print')
  page.pdf(path=str(output/'artigo.pdf'),format='A4',print_background=True)
  assert not errors,errors
  assert not external,external
  browser.close()
 print('OK: 44 artigos, busca, categorias, links, casos, checklist, FAQ e impressao; desktop/celular sem overflow; sem acesso externo.')
 print('Conferencia visual privada:',output)

if __name__=='__main__':verify()
