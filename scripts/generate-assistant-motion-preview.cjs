// Development-only gallery. Runtime CSS owns the inventory; templates own the concept.
const fs = require('node:fs');
const specs = [['Full Assistant','styles/views/assistant-view.css'],['Side panel','styles/legacy/workspace-overrides.css']];
const rows = [];
for (const [group,file] of specs) {
  const source = fs.readFileSync(file,'utf8');
  for (const m of source.matchAll(/@keyframes\s+((?:asst|chatbot|chat-|flow-popover|sutraMic)[\w-]*)\s*\{/g)) {
    let end=m.index+m[0].length, depth=1;
    for (;end<source.length && depth;end++) { if(source[end]==='{')depth++; if(source[end]==='}')depth--; }
    const usage=source.match(new RegExp('\\b'+m[1]+'\\s+([\\d.]+m?s\\b[^;{}]*)'));
    rows.push({name:m[1],group,file,animation:usage?m[1]+' '+usage[1].trim():null,css:source.slice(m.index,end)});
  }
}
fs.mkdirSync('docs/prototypes',{recursive:true});
for (const ext of ['html','css','js']) {
  let output=fs.readFileSync('scripts/templates/assistant-motion/gallery.'+ext,'utf8');
  if(ext==='html')output=output.replace('href="gallery.css"','href="assistant-animation-gallery.css"').replace('src="gallery.js"','src="assistant-animation-gallery.js"');
  if(ext==='css')output+='\n/* Existing Assistant definitions, unchanged. */\n'+rows.map(r=>r.css).join('\n');
  if(ext==='js')output='const currentMotion = '+JSON.stringify(rows).replace(/</g,'\\u003c')+';\n'+output;
  const target='docs/prototypes/assistant-animation-gallery.'+ext;
  if(process.argv.includes('--check')) {
    if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)throw new Error('Stale gallery output: '+target);
  } else fs.writeFileSync(target,output);
}
console.log('Assistant-only gallery: co-editor concept + '+rows.length+' existing definitions.');
