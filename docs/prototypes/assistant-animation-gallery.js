const currentMotion = [{"name":"asstFloatA","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstFloatA 14s ease-in-out infinite","css":"@keyframes asstFloatA {\n    0%,100% { transform: translate(0,0) scale(1); }\n    50%     { transform: translate(-30px, 40px) scale(1.08); }\n}"},{"name":"asstFloatB","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstFloatB 18s ease-in-out infinite","css":"@keyframes asstFloatB {\n    0%,100% { transform: translate(0,0) scale(1); }\n    50%     { transform: translate(40px, -30px) scale(1.1); }\n}"},{"name":"asstThinkingPulse","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstThinkingPulse 1.4s ease-in-out infinite","css":"@keyframes asstThinkingPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }"},{"name":"asstThinkingSpin","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstThinkingSpin 2.6s linear infinite, asstThinkingPulse 1.4s ease-in-out infinite","css":"@keyframes asstThinkingSpin { to { transform: rotate(360deg); } }"},{"name":"asstThinkingSheen","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstThinkingSheen 1.9s ease-in-out infinite","css":"@keyframes asstThinkingSheen { 0% { transform: translateX(-120%); } 60%,100% { transform: translateX(120%); } }"},{"name":"asstThinkingShimmer","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstThinkingShimmer 2.2s linear infinite","css":"@keyframes asstThinkingShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }"},{"name":"asstThinkingDot","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstThinkingDot 1.2s ease-in-out infinite","css":"@keyframes asstThinkingDot { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }"},{"name":"asstMicPulse","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstMicPulse 1.3s ease-in-out infinite","css":"@keyframes asstMicPulse {\n    0%, 100% { box-shadow: 0 0 0 0 rgba(224,72,61,0.55); }\n    50% { box-shadow: 0 0 0 6px rgba(224,72,61,0); }\n}"},{"name":"asstFade","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstFade .5s ease","css":"@keyframes asstFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }"},{"name":"asstSpin","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstSpin 0.8s linear infinite","css":"@keyframes asstSpin { to { transform: rotate(360deg); } }"},{"name":"asstCaretBlink","group":"Full Assistant","file":"styles/views/assistant-view.css","animation":"asstCaretBlink 1s steps(2) infinite","css":"@keyframes asstCaretBlink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }"},{"name":"chatbotThinkingPulse","group":"Side panel","file":"styles/legacy/workspace-overrides.css","animation":"chatbotThinkingPulse 1.4s ease-in-out infinite","css":"@keyframes chatbotThinkingPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }"},{"name":"chatbotThinkingSpin","group":"Side panel","file":"styles/legacy/workspace-overrides.css","animation":"chatbotThinkingSpin 2.6s linear infinite, chatbotThinkingPulse 1.4s ease-in-out infinite","css":"@keyframes chatbotThinkingSpin { to { transform: rotate(360deg); } }"},{"name":"chatbotThinkingSheen","group":"Side panel","file":"styles/legacy/workspace-overrides.css","animation":"chatbotThinkingSheen 1.9s ease-in-out infinite","css":"@keyframes chatbotThinkingSheen { 0% { transform: translateX(-120%); } 60%,100% { transform: translateX(120%); } }"},{"name":"chatbotThinkingShimmer","group":"Side panel","file":"styles/legacy/workspace-overrides.css","animation":"chatbotThinkingShimmer 2.2s linear infinite","css":"@keyframes chatbotThinkingShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }"},{"name":"chatbotThinkingDot","group":"Side panel","file":"styles/legacy/workspace-overrides.css","animation":"chatbotThinkingDot 1.2s ease-in-out infinite","css":"@keyframes chatbotThinkingDot { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }"},{"name":"chatbotCaretBlink","group":"Side panel","file":"styles/legacy/workspace-overrides.css","animation":"chatbotCaretBlink 1.05s steps(1, end) infinite","css":"@keyframes chatbotCaretBlink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }"},{"name":"chatbotMsgIn","group":"Side panel","file":"styles/legacy/workspace-overrides.css","animation":"chatbotMsgIn 0.26s cubic-bezier(0.22, 0.61, 0.36, 1) both","css":"@keyframes chatbotMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }"},{"name":"sutraMicPulse","group":"Side panel","file":"styles/legacy/workspace-overrides.css","animation":"sutraMicPulse 1.3s ease-in-out infinite","css":"@keyframes sutraMicPulse {\n            0%, 100% { box-shadow: 0 0 0 0 rgba(224,72,61,0.55); }\n            50% { box-shadow: 0 0 0 6px rgba(224,72,61,0); }\n        }"},{"name":"flow-popover-in","group":"Side panel","file":"styles/legacy/workspace-overrides.css","animation":"flow-popover-in 0.16s ease-out","css":"@keyframes flow-popover-in {\n            from { opacity: 0; transform: translateY(-4px) scale(0.98); }\n            to   { opacity: 1; transform: none; }\n        }"},{"name":"chat-spin","group":"Side panel","file":"styles/legacy/workspace-overrides.css","animation":"chat-spin .9s linear infinite","css":"@keyframes chat-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"}];
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const source = [
    'Building robots have taught me to notice the small details that makes a design work.',
    'I learned to test each idea seperate, then explain the results to my team.',
    'Working together, we discovered that better questions is often more useful than quick answers.'
  ];
  const corrected = [
    'Building robots has taught me to notice the small details that make a design work.',
    'I learned to test each idea separately, then explain the results to my team.',
    'Working together, we discovered that better questions are often more useful than quick answers.'
  ];
  const shorter = [
    'Building robots taught me to notice the details.',
    'I test ideas and share the results with my team.',
    'Together, we ask better questions before looking for quick answers.'
  ];
  const rephrased = [
    'Building robots taught me how small details can make or break a design.',
    'I learned to test one idea at a time and talk through the results with my team.',
    'Together, we found that asking a better question often matters more than finding a quick answer.'
  ];
  const labels = {grammar:'/grammar',spelling:'/spelling',rephrase:'/rephrase',writing:'AI writing help',general:'AI general help'};
  let base = [...source], committed = null, undoState = null, suggestions = [], controller = null, paused = false, lastTarget = null;
  let travel = null, travelMs = 0, reactionTimer = null;
  const reduced = () => $('reduce').checked || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, className, text) => { const e = document.createElement(tag); e.className = className || ''; if (text != null) e.textContent = text; return e; };
  const lines = () => [...$('passage').children];
  function announce(text) { $('announcement').textContent = text; }
  function activity(step, text) {
    document.querySelectorAll('[data-step]').forEach(e => e.classList.toggle('active',e.dataset.step === step));
    $('presence').textContent = text; $('line-status').textContent = text; announce(text);
    mood(step==='reading'?'reading':step==='editing'?'writing':step==='review'?'pleased':'idle');
  }
  function mood(name) {
    const replay=name==='pleased'&&$('character').classList.contains('is-pleased');
    $('character').classList.remove('is-reading','is-writing','is-pleased','is-confused');
    if(replay)void $('character').offsetWidth;
    if(name!=='idle')$('character').classList.add('is-'+name);
  }
  function holdTravel() {
    if(!travel)return;
    const pose=getComputedStyle($('character')).transform;
    travel.cancel();travel=null;$('character').style.transform=pose;
  }
  function syncTravel() {
    if(!travel)return;
    if(reduced()){travel.finish();return;}
    travel.playbackRate=Number($('speed').value);if(paused)travel.pause();else travel.play();
  }
  function message(role, text, error = false) {
    const empty = $('feed').querySelector('.empty-chat'); if (empty) empty.remove();
    const bubble = el('div', 'chat-message ' + role + (error ? ' error' : ''));
    bubble.append(el('small','',role === 'user' ? 'YOU' : 'SUTRA · PREVIEW'), el('span','',text));
    $('feed').append(bubble); $('feed').scrollTop = $('feed').scrollHeight; return bubble;
  }
  function renderNote(texts) {
    $('passage').replaceChildren(...texts.map((text,index) => { const line = el('p','note-line',text); line.dataset.number = String(index+1).padStart(2,'0'); return line; }));
  }
  function busy(on) {
    $('run').disabled=on; $('command').disabled=on; $('pause').disabled=!on; $('stop').disabled=!on;
    $('pause').textContent='Pause'; paused=false; document.body.classList.remove('is-paused');
  }
  function targetPosition(target,docked) {
    const box=$('workspace').getBoundingClientRect(), rect=target.getBoundingClientRect();
    if(docked) {
      const scale=.65,size=$('character').querySelector('.assistant-logo').offsetWidth*scale;
      return {x:rect.left-box.left+(rect.width-size)/2,y:rect.top-box.top+(rect.height-size)/2,scale};
    }
    if(target.classList.contains('inline-change')) {
      const word=target.querySelector('ins:not(:empty)')||target.querySelector('.original-word,del')||target;
      const wordRect=word.getClientRects()[0]||rect, line=target.closest('.note-line'), rail=line.getBoundingClientRect();
      const documentRect=$('passage').getBoundingClientRect();
      // Stay above the paragraph, aligned with the exact word, including wrapped words.
      return {x:Math.max(3,Math.min(wordRect.left-box.left+wordRect.width/2-21,documentRect.right-box.left-43)),y:Math.max(8,rail.top-box.top+parseFloat(getComputedStyle(line).paddingTop)-53),scale:.82};
    }
    return {x:Math.max(3,rect.left-box.left-57),y:rect.top-box.top+5,scale:1};
  }
  function moveTo(target, docked = false, instant = false) {
    const {x,y,scale}=targetPosition(target,docked);
    const character=$('character'), pose=(px,py,s,rotation=0)=>`translate(${px}px,${py}px) rotate(${rotation}deg) scale(${s})`;
    const matrix=new DOMMatrixReadOnly(getComputedStyle(character).transform==='none'?undefined:getComputedStyle(character).transform);
    const start=lastTarget?{x:matrix.e,y:matrix.f,s:Math.hypot(matrix.a,matrix.b)}:{x,y,s:scale};
    holdTravel();lastTarget=target;character.style.transform=pose(x,y,scale);
    character.classList.add('present');character.classList.toggle('is-docked',docked);
    const distance=Math.hypot(x-start.x,y-start.y), direction=Math.sign(x-start.x)||1;
    travelMs=reduced()||instant?0:Math.min(680,220+distance*.4);
    if(travelMs) {
      const animation=character.animate([
        {transform:pose(start.x,start.y,start.s),offset:0},
        {transform:pose(start.x+(x-start.x)*.55,start.y+(y-start.y)*.55-2,(start.s+scale)/2,direction*.8),offset:.55},
        {transform:pose(x,y,scale),offset:1}
      ],{duration:travelMs,easing:'cubic-bezier(.25,.1,.25,1)'});
      travel=animation;syncTravel();animation.onfinish=()=>{if(travel===animation)travel=null;};
    }
    return travelMs;
  }
  function park() {
    $('character').classList.remove('is-writing'); moveTo($('dock'),true);
  }
  function wait(ms, signal) {
    return new Promise((resolve,reject) => {
      let last=performance.now(), left=reduced()?Math.min(ms,120):ms;
      function frame(now) {
        if(signal.aborted) { reject(new DOMException('Stopped','AbortError')); return; }
        if(!paused) left-=(now-last)*Number($('speed').value);
        last=now; if(left<=0) resolve(); else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  function typeInto(target, text, signal) {
    if(reduced()) { target.textContent=text; return wait(80,signal); }
    return new Promise((resolve,reject)=>{
      let last=performance.now(),elapsed=0; const duration=380+Math.min(720,text.length*24);
      function frame(now) {
        if(signal.aborted){reject(new DOMException('Stopped','AbortError'));return;}
        if(!paused)elapsed+=(now-last)*Number($('speed').value);
        last=now;target.textContent=text.slice(0,Math.ceil(text.length*Math.min(1,elapsed/duration)));
        if(elapsed>=duration)resolve();else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  // Keep matching words and whitespace outside the edited spans.
  function wordChanges(before,after) {
    const tokens=text=>text.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)||[];
    const a=tokens(before),b=tokens(after),table=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
    for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)table[i][j]=a[i]===b[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
    const parts=[];let i=0,j=0,change=null;
    const flush=()=>{if(change){parts.push(change);change=null;}};
    while(i<a.length||j<b.length) {
      if(i<a.length&&j<b.length&&a[i]===b[j]){flush();parts.push({same:a[i++]});j++;}
      else {if(!change)change={before:'',after:''};if(i<a.length&&(j===b.length||table[i+1][j]>=table[i][j+1]))change.before+=a[i++];else change.after+=b[j++];}
    }
    flush();return parts;
  }
  async function suggestInline(line,before,after,signal) {
    const edits=[];line.replaceChildren();
    for(const part of wordChanges(before,after)) {
      if(part.same!==undefined){line.append(document.createTextNode(part.same));continue;}
      const wrapper=el('span','inline-change'),original=el('span','original-word',part.before);
      wrapper.append(original);line.append(wrapper);edits.push({part,wrapper,original});
    }
    for(const {part,wrapper,original} of edits) {
      const flight=moveTo(wrapper);
      await wait(flight+120,signal);
      wrapper.classList.add('is-active');const old=el('del','',part.before),next=el('ins'),caret=el('span','typing-caret');
      original.replaceWith(old);wrapper.append(next,caret);
      await typeInto(next,part.after,signal);caret.remove();wrapper.classList.remove('is-active');moveTo(wrapper);
    }
    return edits.length;
  }
  const spellingPass=text=>text.replace(/\bdetials\b/g,'details').replace(/\bseperately\b/g,'separately').replace(/\bquestons\b/g,'questions').replace(/\bseperate\b/g,'separate');
  const grammarPass=text=>text.replace(/\brobots have\b/g,'robots has').replace(/\bdetails that makes\b/g,'details that make').replace(/\bquestions is\b/g,'questions are').replace(/\bidea seperate\b/g,'idea separately');
  function abort() {
    if(controller) controller.abort(); controller=null;clearTimeout(reactionTimer);holdTravel();busy(false);
    $('feed').querySelectorAll('.thinking').forEach(e=>e.remove());
    $('character').classList.remove('is-writing');
  }
  function prepareReview() {
    $('review').hidden=!suggestions.some(Boolean); $('doc-mode').textContent=suggestions.some(Boolean)?'Suggestions · review first':'Original note';
  }
  async function play(follow = null) {
    abort(); const own = new AbortController(); controller=own; const signal=own.signal;
    const kind=$('command').value;
    base=committed ? [...committed] : (kind==='spelling' ? corrected.map(s=>s.replace('separately','seperately').replace('questions','questons').replace('details','detials')) : [...source]);
    const output=follow==='shorter'?shorter : follow==='voice'?corrected : kind==='rephrase'||kind==='writing'?rephrased : base.map(kind==='spelling'?spellingPass:grammarPass);
    suggestions=[]; $('review').hidden=true; $('undo').hidden=true; $('doc-mode').textContent='Reading your passage';
    renderNote(base); busy(true); message('user',follow==='shorter'?'Make it shorter.':follow==='voice'?'Keep my voice.':labels[kind]);
    const thinking=el('div','thinking','Finding the right lines '); thinking.append(el('i'),el('i'),el('i')); $('feed').append(thinking);
    activity('reading','Opening chat and finding your passage'); moveTo($('dock'),true);
    try {
      await wait(850,signal); thinking.remove();
      message('assistant',kind==='general'?'I’ll read alongside you and point out what could be clearer. I won’t change your text.':'I’ll work through these three passages. You’ll see each suggestion on the page before accepting it.');
      for(let i=0;i<base.length;i++) {
        const line=lines()[i]; line.classList.add('reading'); const flight=moveTo(line); activity('reading','Reading passage '+(i+1)+' of 3');
        await wait(flight+450,signal);
        if(kind==='general') { await wait(400,signal); line.classList.remove('reading'); continue; }
        $('doc-mode').textContent='Live suggestions · not accepted'; activity('editing','Suggesting an edit in passage '+(i+1));
        $('character').classList.add('is-writing');line.classList.add('editing');
        const changes=await suggestInline(line,base[i],output[i],signal);
        if(changes)suggestions[i]=output[i];line.classList.remove('reading','editing');line.classList.toggle('suggested',changes>0);
        mood('pleased');await wait(240,signal);
      }
      const changed=suggestions.filter(Boolean).length;
      activity('review',kind==='general'?'Ready to talk about your note':changed?changed+' passages have suggestions to review':'No corrections needed');
      if(kind==='general') { $('doc-mode').textContent='Read only · no edits'; message('assistant','Your reflection connects making, testing, and teamwork. Add one concrete moment from a project to make it more memorable. Want help shaping that example?'); park(); }
      else { message('assistant',changed?'Only the changed words are marked. Everything around them stays in place. Accept the suggestions, discard them, or ask me to try a different approach.':'No corrections are needed in this demo passage. The wording is unchanged.');prepareReview();park(); }
      controller=null; busy(false);
    } catch(error) {
      if(error.name!=='AbortError') { message('assistant','Preview interrupted. Reset the demo to try again.',true); }
      if(controller===own) { controller=null; busy(false); }
    }
  }
  function reset() {
    abort();clearTimeout(reactionTimer);committed=null; undoState=null; suggestions=[]; base=[...source]; renderNote(base);
    $('review').hidden=true; $('undo').hidden=true; $('doc-mode').textContent='Original note';
    $('feed').replaceChildren(); const empty=el('div','empty-chat'); empty.append(el('span','empty-star','✦'),el('h3','','Let’s work on this together.'),el('p','','Your command starts the conversation. I’ll show my work right on the page.')); $('feed').append(empty);
    $('character').className='co-editor is-docked'; lastTarget=null; $('chat-input').value=''; activity('ready','Choose a command to get started.'); $('presence').textContent='Here when you need me';park();
  }
  $('run').onclick=()=>play(); $('reset').onclick=reset;
  $('command').onchange=()=>{committed=null;undoState=null;suggestions=[];base=[...source];renderNote(base);prepareReview();$('undo').hidden=true;activity('ready','Ready for '+labels[$('command').value]);park();};
  $('pause').onclick=()=>{paused=!paused;syncTravel();$('pause').textContent=paused?'Resume':'Pause';document.body.classList.toggle('is-paused',paused);$('presence').textContent=paused?'Paused · take your time':'Working alongside you';};
  $('stop').onclick=()=>{abort();suggestions=[];renderNote(base);prepareReview();activity('ready','Stopped · original wording preserved');message('assistant','Stopped. I removed the unaccepted preview. Your original wording is unchanged.');park();};
  $('accept').onclick=()=>{undoState={base:[...base],committed:committed&&[...committed]};committed=base.map((text,i)=>suggestions[i]||text);renderNote(committed);lines().forEach(e=>e.classList.add('accepted-line'));suggestions=[];$('review').hidden=true;$('undo').hidden=false;$('doc-mode').textContent='Accepted in demo';activity('review','Suggestions accepted · Undo is available');message('assistant','Accepted in this demo. You can undo this pass at any time.');park();};
  $('discard').onclick=()=>{suggestions=[];renderNote(base);prepareReview();$('undo').hidden=!committed;activity('ready','Suggestions discarded · original wording preserved');message('assistant','Discarded. Let’s try a different approach whenever you’re ready.');park();};
  $('undo').onclick=()=>{if(!undoState)return;committed=undoState.committed;base=[...undoState.base];undoState=null;suggestions=[];renderNote(base);prepareReview();$('undo').hidden=true;activity('ready','Accepted edits undone');message('assistant','Undone. The wording from before this pass is back.');park();};
  function follow(text,key) {
    if(controller && (key==='shorter'||key==='voice'||/short|voice/i.test(text))) { message('assistant','Got it — I’ll replace this unaccepted pass with your new direction.');play(key||(/short/i.test(text)?'shorter':'voice'));return; }
    if(key==='explain'||/explain|why|what changed/i.test(text)) { message('user',text);message('assistant','In this scripted example, I fix subject–verb agreement and “separate/separately,” or make the wording more direct. The idea and first-person voice stay yours.');park();return; }
    if(key||/short|voice/i.test(text)) { play(key||(/short/i.test(text)?'shorter':'voice'));return; }
    message('user',text);message('assistant','This is a motion preview, so replies are scripted. Try “Make it shorter,” “Keep my voice,” or “Explain changes” to continue the demonstration.');park();
  }
  document.querySelectorAll('[data-follow]').forEach(b=>b.onclick=()=>follow(b.textContent,b.dataset.follow));
  $('chat-form').onsubmit=e=>{e.preventDefault();const text=$('chat-input').value.trim();if(!text)return;$('chat-input').value='';follow(text);};
  $('error-demo').onclick=()=>{abort();suggestions=[];renderNote(base);prepareReview();activity('ready','Connection interrupted · original note is safe');message('assistant','Connection interrupted. Your original note is safe; no suggestions were accepted. Run the preview to retry.',true);moveTo($('dock'),true);mood('confused');};
  function react() {
    clearTimeout(reactionTimer);if(!controller)park();mood('pleased');
    reactionTimer=setTimeout(()=>{const step=document.querySelector('[data-step].active')?.dataset.step;mood(step==='editing'?'writing':step==='reading'?'reading':step==='review'?'pleased':'idle');},1300);
  }
  $('hello-demo').onclick=react;$('aha-demo').onclick=react;
  $('return-demo').onclick=()=>{if(controller){$('stop').click();}else park();};
  $('theme').onclick=()=>{const light=document.body.classList.toggle('light');$('theme').textContent=light?'Dark theme':'Light theme';};
  $('reduce').onchange=()=>{document.body.classList.toggle('reduce',$('reduce').checked);syncTravel();};
  $('speed').onchange=syncTravel;
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',syncTravel);
  function realign() { if(lastTarget&&lastTarget.isConnected)moveTo(lastTarget,lastTarget===$('dock'),true); }
  addEventListener('resize',realign);
  new ResizeObserver(realign).observe($('workspace'));

  function renderLibrary() {
    const visible=currentMotion.filter(r=>$('family').value==='All'||r.group===$('family').value);
    $('grid').replaceChildren(); $('count').textContent=visible.length+' existing Assistant definitions';
    for(const row of visible) {
      const card=el('article','motion-card');card.append(el('small','',row.group),el('h3','',row.name));
      const stage=el('div','motion-stage'),sample=el('div','sample','Sutra Assistant');let targets=[sample];
      if(/Float/.test(row.name)){sample.classList.add('orb');sample.textContent='';}
      else if(/Spin|spin|Pulse/.test(row.name)){sample.classList.add('symbol');sample.textContent=/Mic/.test(row.name)?'◉':'✧';}
      else if(/Caret/.test(row.name)){sample.classList.add('caret');sample.textContent='';}
      else if(/Shimmer/.test(row.name)){sample.classList.add('shimmer');sample.textContent='Thinking';}
      else if(/Sheen/.test(row.name)){const sheen=el('i','sheen');sample.append(sheen);targets=[sheen];}
      else if(/Dot/.test(row.name)){sample.textContent='Thinking ';targets=[0,1,2].map(()=>{const d=el('i','dot');sample.append(d);return d;});}
      stage.append(sample);card.append(stage,el('div','motion-meta',row.animation||'Definition only; no active timing found'),el('div','motion-meta',row.file));
      const replay=el('button','replay','Replay');replay.onclick=()=>targets.forEach((target,index)=>{target.style.animation='none';void target.offsetWidth;target.style.animation=row.animation||'none';if(/Dot/.test(row.name))target.style.animationDelay=index*.18+'s';});
      const detail=el('details'),summary=el('summary','','Exact CSS');detail.append(summary,el('pre','',row.css));card.append(replay,detail);$('grid').append(card);replay.click();
    }
  }
  $('family').onchange=renderLibrary;$('replay').onclick=()=>document.querySelectorAll('.replay').forEach(b=>b.click());
  reset();renderLibrary();
})();
