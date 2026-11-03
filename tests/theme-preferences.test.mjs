import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const script = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
function launch(saved, blocked = false) {
  const listeners = new Map(), classes = new Set();
  const storage = new Map(saved ? [['git-ui.theme', saved]] : []);
  const root = { dataset: {}, classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } };
  const window = { addEventListener: (name, callback) => listeners.set(name, callback), dispatchEvent(event) { listeners.get(event.type)?.(event); } };
  const localStorage = { getItem(key) { if (blocked) throw new Error('blocked'); return storage.get(key); }, setItem(key, value) { if (blocked) throw new Error('blocked'); storage.set(key, value); } };
  vm.runInNewContext(script, { window, document: { documentElement: root }, localStorage, CustomEvent: class { constructor(type, init) { this.type=type; this.detail=init.detail; } } });
  return { window, root, classes, storage, listeners };
}

test('restores saved dark theme before mounting and switches completely back to light', () => {
  const app = launch('rose-pine-moon');
  assert.equal(app.root.dataset.theme, 'rose-pine-moon');
  assert.equal(app.root.dataset.kbTheme, 'dark');
  assert.ok(app.classes.has('dark'));
  app.window.gitUiTheme.set('noctis-hibernus');
  assert.equal(app.root.dataset.kbTheme, 'light');
  assert.equal(app.classes.has('dark'), false);
  assert.equal(app.storage.get('git-ui.theme'), 'noctis-hibernus');
});

test('unknown preferences, cleared storage and unavailable storage safely fall back', () => {
  assert.equal(launch('unknown').window.gitUiTheme.get(), 'default');
  assert.equal(launch(null, true).window.gitUiTheme.get(), 'default');
  const app=launch('rose-pine-moon');
  app.listeners.get('storage')({key:null,newValue:null});
  assert.equal(app.window.gitUiTheme.get(), 'default');
  app.listeners.get('storage')({key:'git-ui.theme',newValue:'macos-modern-light'});
  assert.equal(app.window.gitUiTheme.get(), 'macos-modern-light');
});

test('bootstrap loads before theme CSS to prevent an incorrect initial background', () => {
  const html=readFileSync(new URL('../index.html', import.meta.url),'utf8');
  assert.ok(html.indexOf('/theme-init.js') < html.indexOf('/src/theme.css'));
});

test('every custom theme has a complete palette and semantic text remains legible', () => {
  const css=readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');
  function luminance(value) {
    const [h,s,l]=value.match(/[\d.]+/g).map(Number); const chroma=(1-Math.abs(2*l/100-1))*s/100;
    const x=chroma*(1-Math.abs(h/60%2-1)), m=l/100-chroma/2;
    const rgb=h<60?[chroma,x,0]:h<120?[x,chroma,0]:h<180?[0,chroma,x]:h<240?[0,x,chroma]:h<300?[x,0,chroma]:[chroma,0,x];
    return rgb.map(v=>v+m).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  }
  for (const theme of launch().window.gitUiTheme.themes.filter(item=>!['default','dark'].includes(item.id))) {
    const block=css.split(`:root[data-theme="${theme.id}"] {`)[1]?.split('}')[0];
    assert.ok(block,theme.id);
    const values=Object.fromEntries([...block.matchAll(/--([\w-]+): ([^;]+);/g)].map(match=>[match[1],match[2]]));
    for (const [foreground,background] of [['foreground','background'],['muted-foreground','background'],['primary-foreground','primary'],['sidebar-primary-foreground','sidebar-primary'],['destructive-foreground','destructive'],['sidebar-foreground','sidebar-selected'],['success-foreground','success'],['error-foreground','error']]) {
      const a=luminance(values[foreground]),b=luminance(values[background]);
      assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${theme.id}: ${foreground}/${background}`);
      if (['primary','sidebar-primary','destructive'].includes(background) && b < 0.2) {
        assert.ok(a > 0.8, `${theme.id}: dark ${background} buttons need light text`);
      }
    }
  }
});
