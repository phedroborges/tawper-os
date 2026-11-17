"""Conferência local da Ajuda integrada, sem banco ou serviços externos."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, tempfile

BASE='http://127.0.0.1:4317'

def verify():
    errors=[]
    output=Path(tempfile.mkdtemp(prefix='tawper-ajuda-integrada-'))
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        def setup(context):
            def route(request):
                if not request.request.url.startswith(BASE):return request.abort()
                if '/api/crm/snapshot' in request.request.url:
                    return request.fulfill(json={'health':{'ok':True,'organization':'Ambiente local de teste','companies':23,'stages':15},'snapshot':None})
                if '/api/' in request.request.url:return request.fulfill(json={})
                return request.continue_()
            context.route('**/*',route)
            context.add_init_script('''
              window.addEventListener('DOMContentLoaded', () => {
                const style = document.createElement('style');
                style.textContent = 'nextjs-portal { display: none !important; }';
                document.head.append(style);
              });
              window.__helpHashSignals = [];
              const original = window.addEventListener;
              window.addEventListener = function(type, callback, options) {
                if (type === 'hashchange' && options?.signal) window.__helpHashSignals.push(options.signal);
                return original.call(this, type, callback, options);
              };
            ''')
        context=browser.new_context(viewport={'width':1440,'height':1050},color_scheme='light')
        setup(context)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/carteira',wait_until='networkidle')
        desktop=page.locator('aside.fixed').first
        help_link=desktop.get_by_role('link',name='Ajuda',exact=True)
        assert help_link.evaluate('(e)=>e.nextElementSibling.textContent.trim()')=='Configurações'
        help_link.click()
        page.wait_for_selector('[data-help-center] #help-home:visible')
        assert page.url==BASE+'/ajuda'
        assert desktop.get_by_role('link',name='Ajuda',exact=True).get_attribute('class').find('bg-soft')>=0
        assert page.locator('[data-help-center] img, [data-help-center] iframe, [data-help-center] code').count()==0
        assert page.locator('[data-help-center] .help-article').count()==44
        assert page.locator('[data-help-center] .site-header').count()==0
        page.locator('#help-search').fill('confirmar visita')
        page.locator('#result-list a[href="#confirmar-visita"]').click()
        page.wait_for_selector('#confirmar-visita:visible')
        assert '/ajuda#confirmar-visita' in page.url
        page.locator('[data-case="1"]').click()
        assert page.locator('[data-case-panel="1"]').is_visible()
        page.reload(wait_until='networkidle')
        page.wait_for_selector('#confirmar-visita:visible')
        page.locator('#focus-search').click()
        page.wait_for_selector('#help-home:visible')
        assert page.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
        page.screenshot(path=str(output/'desktop.png'))

        # Montar e desmontar a rota não deixa os ouvintes globais da Ajuda ativos.
        for _ in range(3):
            desktop.get_by_role('link',name='Carteira',exact=True).click()
            page.wait_for_url(BASE+'/carteira')
            page.wait_for_function('window.__helpHashSignals.every(signal=>signal.aborted)')
            assert page.locator('[data-help-center]').count()==0
            desktop.get_by_role('link',name='Ajuda',exact=True).click()
            page.wait_for_selector('#help-home:visible')
            assert page.evaluate('window.__helpHashSignals.filter(signal=>!signal.aborted).length')==1
        page.get_by_role('button',name='Recolher menu',exact=True).click()
        assert desktop.get_by_role('link',name='Ajuda',exact=True).is_visible()
        page.get_by_role('button',name='Expandir menu',exact=True).click()

        # Persiste apenas a base local demonstrativa para variar os perfis da interface.
        page.get_by_role('button',name='Notificações',exact=True).click()
        mark=page.get_by_role('button',name='marcar como lidas',exact=True)
        if mark.count():mark.click()
        page.keyboard.press('Escape')
        saved=page.evaluate("localStorage.getItem('tawper-os-demo')")
        assert saved
        for role in ['admin','gestor','vendedor','representante']:
            profile=json.loads(saved)
            actor=next(u for u in profile['state']['users'] if u['id']==profile['state']['currentUserId'])
            actor['role']=role
            actor['isAdmin']=role=='admin'
            role_context=browser.new_context(viewport={'width':1440,'height':1050})
            setup(role_context)
            role_context.add_init_script('localStorage.setItem("tawper-os-demo",'+json.dumps(json.dumps(profile))+');')
            role_page=role_context.new_page()
            role_page.goto(BASE+'/ajuda',wait_until='networkidle')
            role_page.wait_for_selector('#help-home:visible')
            assert role_page.locator('aside.fixed').first.get_by_role('link',name='Ajuda',exact=True).is_visible(),role
            role_context.close()

        page.set_viewport_size({'width':390,'height':844})
        page.get_by_role('button',name='Menu',exact=True).click()
        drawer=page.get_by_role('dialog',name='Menu',exact=True)
        mobile_help=drawer.get_by_role('link',name='Ajuda',exact=True)
        assert mobile_help.evaluate('(e)=>e.nextElementSibling.textContent.trim()')=='Configurações'
        mobile_help.click()
        drawer.wait_for(state='hidden')
        page.locator('#help-search').fill('cadastrar cliente')
        page.locator('#result-list a[href="#cadastrar-cliente"]').click()
        page.wait_for_selector('#cadastrar-cliente:visible')
        assert page.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
        page.screenshot(path=str(output/'celular.png'))
        page.emulate_media(media='print')
        assert desktop.evaluate('(e)=>getComputedStyle(e).display')=='none'
        page.pdf(path=str(output/'artigo.pdf'),format='A4',print_background=True)
        assert not errors,errors
        browser.close()
    print('OK: /ajuda, posição do menu, quatro perfis, celular, menu recolhido, busca, links diretos, reentrada sem ouvintes duplicados e impressão.')
    print('Conferência visual local:',output)

if __name__=='__main__':verify()
