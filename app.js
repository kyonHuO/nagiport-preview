import {LIMITS,LABELS,textRows,validateRows,parseCsv,inferCsvLayout,csvRows,resultsCsv} from './core.js';
const $=selector=>document.querySelector(selector);
const el=(tag,text,className)=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
const EXAMPLES=['音が静かで、毎日使いやすいです。','使いやすいけれど、電池がすぐ切れます。','The item arrived broken.','It arrived on Tuesday.'];
let csvTable=null,rows=[],worker=null,busy=false,results=[],fileVersion=0,runVersion=0,ready=false,backend='',startedAt=0,slowTimer=null,loading=false;
function inputError(text=''){$('#input-error').textContent=text;$('#input-error').hidden=!text;}
function runError(text=''){$('#run-error').textContent=text;$('#run-error').hidden=!text;if(!text)$('#error-debug').hidden=true;}
function currentRows(){return csvTable?csvRows(csvTable,Number($('#csv-column').value),$('#csv-header').checked):textRows($('#review-input').value);}
function updateCounter(){rows=currentRows();$('#input-counter').textContent=`${rows.length} / 100 件`;$('#input-counter').classList.toggle('over-limit',rows.length>100);}
function updateFilePreview(){
  const header=$('#csv-header').checked,selected=Number($('#csv-column').value)||0;
  $('#csv-column').replaceChildren(...csvTable[0].map((value,index)=>{const option=el('option',header?(value.trim()||`列${index+1}`):`列${index+1}`);option.value=index;return option;}));
  $('#csv-column').value=String(selected);updateCounter();
  $('#file-preview').replaceChildren(...rows.slice(0,3).map((text,i)=>el('p',`${i+1}. ${text}`)));
  if(rows.length>3)$('#file-preview').append(el('p',`ほか${rows.length-3}件`));
}
function removeFile(){fileVersion++;csvTable=null;$('#csv-file').value='';$('#file-panel').hidden=true;$('#review-input').hidden=false;updateCounter();inputError();hideConfirm();}
function stopWorker(){worker?.terminate();worker=null;ready=false;backend='';}
function setBusy(value){
  busy=value;$('#classify-input').disabled=value;
  for(const selector of ['#review-input','#csv-file','#csv-column','#csv-header','#remove-file','#use-example','#clear-input','#device-choice'])$(selector).disabled=value;
  $('#cancel-run').hidden=!value;$('#export-csv').disabled=value||!results.length;
  if(!value){clearInterval(slowTimer);slowTimer=null;$('#classify-input').replaceChildren(document.createTextNode(ready?'もう一度分類する ':'この内容を分類する '),el('span','→'));}
}
function progressState(title,detail='',value=null){$('#run-status').hidden=false;$('#status-title').textContent=title;$('#status-detail').textContent=detail;if(value===null)$('#run-progress').removeAttribute('value');else $('#run-progress').value=value;}
let activeFilter='all';
function applyFilter(){
  Array.prototype.forEach.call(document.querySelectorAll('#result-list .result-row'),row=>{row.hidden=activeFilter!=='all'&&row.dataset.category!==activeFilter;});
  const host=$('#result-filter');if(host)Array.prototype.forEach.call(host.children,btn=>btn.setAttribute('aria-pressed',String(btn.dataset.filter===activeFilter)));
}
function renderFilter(){
  const host=$('#result-filter');if(!host)return;
  const keys=Object.keys(LABELS).filter(key=>results.some(r=>r.category===key));
  const want=['all',...keys];
  // Keep existing chips (and keyboard focus): remove only what is gone, add only what is new.
  Array.prototype.forEach.call([...host.children],btn=>{if(!want.includes(btn.dataset.filter))btn.remove();});
  want.forEach((key,index)=>{
    let btn=host.querySelector(`[data-filter="${key}"]`);
    if(!btn){btn=el('button',key==='all'?'すべて':LABELS[key],'filter-chip');btn.type='button';btn.dataset.filter=key;btn.addEventListener('click',()=>{activeFilter=key;applyFilter();});}
    btn.textContent=key==='all'?'すべて':LABELS[key];
    const current=host.children[index];
    if(current!==btn)host.insertBefore(btn,current||null);
  });
  applyFilter();
}
function showResults(){
  $('#results').hidden=!results.length;$('#result-count').textContent=`${results.length}件`;
  const counts=Object.fromEntries(Object.keys(LABELS).map(key=>[key,results.filter(r=>r.category===key).length]));
  $('#result-summary').textContent=Object.keys(LABELS).filter(key=>counts[key]).map(key=>`${LABELS[key]} ${counts[key]}件`).join('　');
  renderFilter();
}
function reasonText(result){
  if(result.reason==='reserved_media_token')return '画像・音声・動画用の予約記号が含まれるため未分類にしました。予約記号を取り除いて再実行してください。';
  if(result.category==='skipped')return '512トークンを超えたため、本文を切り捨てず未分類にしました。短くして再実行してください。';
  if(result.reason==='similarity')return '例文との近さが低いため保留にしました。';
  if(result.reason==='margin')return `「${LABELS[result.candidate]}」が最も近い候補ですが、次の候補との差が小さいため保留にしました。`;
  if(result.reason==='neutral')return '評価のない文章・文脈が不足した文章の例に近いため、保留にしました。';
  return '';
}
function appendResult(result){
  results.push(result);const row=el('article','','result-row');row.dataset.category=result.category;row.append(el('span',String(result.id).padStart(2,'0'),'row-id'));
  const body=el('div','');body.append(el('p',result.text,'review-text'));
  const meta=el('div','','row-meta');meta.append(el('span',LABELS[result.category],`label ${result.category}`));
  if(Number.isFinite(result.score))meta.append(el('span',`最も近い分類との近さ ${result.score.toFixed(3)}`,'score-note'));
  body.append(meta);const reason=reasonText(result);if(reason)body.append(el('p',reason,'reason-note'));
  if(result.nearest){const detail=el('details','','result-evidence');detail.append(el('summary','比較した例文・数値を見る'));detail.append(el('p',`最も近い例文：${result.nearest}`));detail.append(el('p',result.scores.map(x=>`${LABELS[x.category]}: ${x.score.toFixed(3)}`).join(' / ')));detail.append(el('p',`1位と2位の差：${result.margin.toFixed(3)}。値はコサイン類似度で、確率・正解率ではありません。`));body.append(detail);}
  row.append(body);$('#result-list').append(row);showResults();
}
function fail(data){
  const base=data.code==='memory'?'端末の空きメモリが足りず、分類エンジンを実行できませんでした。ほかのタブを閉じるか、PCでお試しください。':data.code==='download'?'分類エンジンまたは実行用ファイルを取得できませんでした。通信・ブラウザの制限をご確認のうえ、再実行してください。':data.code==='gpu'?'この端末のWebGPUで実行できませんでした。「分類方法・保存について」でCPUを選ぶと再試行できます。':'分類エンジンの実行に失敗しました。最新のChrome・Edgeを使うか、「分類方法・保存について」でCPUを選んで再試行してください。';
  stopWorker();setBusy(false);$('#download-notice').textContent='再実行時は分類エンジンを準備し直します。取得済みファイルはキャッシュを利用する場合があります。';$('#run-status').hidden=true;runError(base+' 自動の代替判定は行っていません。');
  window.dispatchEvent(new Event('nagiport:fail'));
  if(data.diagnostic){$('#error-diagnostic').textContent=`${data.stage} / ${data.backend}: ${data.diagnostic}`;$('#error-debug').hidden=false;}
  if(results.length)$('#result-summary').append(document.createTextNode('（途中で停止した結果です）'));
}
function attachWorker(version){
  worker=new Worker(new URL('./inference.worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(version!==runVersion||!busy)return;
    if(data.type==='backend')backend=data.backend;
    else if(data.type==='download')progressState('準備用ファイルを読み込んでいます',`${(data.loaded/1e6).toFixed(1)} / ${(data.total/1e6).toFixed(1)} MB（分類用ファイル。実行用ファイルは別途） · ${backend==='webgpu'?'WebGPU':'CPU'}`,null);
    else if(data.type==='status'){const detail=data.stage==='inference'?`${backend==='webgpu'?'WebGPU':'CPU'}でブラウザ内処理中。中止するとそこまでの結果を残します。`:data.stage==='prototypes'?'最初の実行だけ、分類用の例文をモデルで計算します。':'初回は数分かかる場合があります。入力はサーバーに送信しません。';progressState(data.text,detail,data.stage==='inference'?data.current/data.total*100:null);}
    else if(data.type==='ready'){ready=true;$('#download-notice').textContent='分類エンジンの準備ができています。このページではそのまま分類できます。';}
    else if(data.type==='result')appendResult(data.result);
    else if(data.type==='complete'){setBusy(false);const sec=Math.round((performance.now()-startedAt)/1000);progressState(`${results.length}件の処理が終わりました`,`${backend==='webgpu'?'WebGPU':'CPU'} · ${sec}秒（初回は準備時間を含みます）`,100);$('#results').focus({preventScroll:true});$('#results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});window.dispatchEvent(new CustomEvent('nagiport:complete',{detail:{results:results.map(r=>Object.assign({},r))}}));}
    else if(data.type==='error')fail(data);
  };
  worker.onerror=()=>{if(version===runVersion&&busy)fail({code:'runtime'});};
}
$('#review-input').addEventListener('input',()=>{fileVersion++;updateCounter();inputError();hideConfirm();});
$('#use-example').addEventListener('click',()=>{removeFile();$('#review-input').value=EXAMPLES.join('\n');updateCounter();$('#review-input').focus();});
$('#clear-input').addEventListener('click',()=>{removeFile();$('#review-input').value='';updateCounter();inputError();$('#review-input').focus();});
$('#remove-file').addEventListener('click',removeFile);
$('#csv-column').addEventListener('change',()=>{updateFilePreview();inputError();hideConfirm();});
$('#csv-header').addEventListener('change',()=>{updateFilePreview();inputError();hideConfirm();});
$('#csv-file').addEventListener('change',async(event)=>{
  const file=event.target.files[0];if(!file)return;const version=++fileVersion;inputError();hideConfirm();loading=true;
  try{
    if(!/\.csv$/i.test(file.name))throw Error('拡張子.csvのファイルを選んでください。');
    if(file.size>LIMITS.fileBytes)throw Error('1MB以下のCSVを選んでください。');
    const raw=await file.arrayBuffer();if(version!==fileVersion||busy)return;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(raw),table=parseCsv(text),layout=inferCsvLayout(table);
    csvTable=table;$('#csv-header').checked=layout.header;$('#csv-column').replaceChildren(...table[0].map((_,i)=>{const option=el('option',`列${i+1}`);option.value=i;return option;}));$('#csv-column').value=String(layout.column);
    $('#file-name').textContent=file.name;$('#file-panel').hidden=false;$('#review-input').hidden=true;updateFilePreview();hideConfirm();
    try{validateRows(rows);}catch(error){inputError(error.message);}
  }catch(error){if(version!==fileVersion)return;event.target.value='';inputError(error instanceof TypeError?'UTF-8形式のCSVを選んでください。':error.message);}finally{loading=false;}
});
$('#device-choice').addEventListener('change',()=>{stopWorker();$('#download-notice').textContent='実行方法を変更しました。次回、分類エンジンを準備し直します。';});
function startRun(){
  if(busy||loading)return;fileVersion++;updateCounter();inputError();runError();
  window.dispatchEvent(new Event('nagiport:start'));
  try{validateRows(rows);}catch(error){inputError(error.message);return;}
  if(!window.isSecureContext||!window.Worker||!window.WebAssembly){runError('この環境では実行できません。HTTPS接続の最新ブラウザでお試しください。');return;}
  results=[];activeFilter='all';$('#result-list').replaceChildren();showResults();setBusy(true);startedAt=performance.now();
  // Keep an already prepared worker and its listener's version for reruns.
  if(!worker){runVersion++;try{attachWorker(runVersion);}catch{fail({code:'runtime'});return;}}
  progressState(ready?'分類を開始しています':'分類エンジンを準備しています',ready?'このページで準備済みの分類エンジンを使います。':'保存済みファイルがあれば再利用し、このブラウザ内で分類します。');
  slowTimer=setInterval(()=>{if(busy&&performance.now()-startedAt>120000&&!results.length)$('#status-detail').textContent='端末・通信によって準備に数分かかります。処理は続いています。中止して、CPUへの切り替えやPCでの再実行もできます。';},30000);
  worker.postMessage({type:'classify',rows:[...rows],device:$('#device-choice').value});
}
const confirmPanel=$('#classify-confirm');
function hideConfirm(){if(confirmPanel)confirmPanel.hidden=true;}
function prepareConfirm(){
  if(busy||loading)return;fileVersion++;updateCounter();inputError();runError();
  try{validateRows(rows);}catch(error){inputError(error.message);return;}
  $('#confirm-count').textContent=`有効な行数：${rows.length}件（先頭${Math.min(5,rows.length)}件を表示）`;
  $('#confirm-preview').replaceChildren(...rows.slice(0,5).map(text=>el('li',text)));
  confirmPanel.hidden=false;
}
$('#classify-input').addEventListener('click',()=>{confirmPanel?prepareConfirm():startRun();});
if(confirmPanel){
  $('#classify-confirm-run').addEventListener('click',()=>{hideConfirm();startRun();});
  $('#classify-confirm-cancel').addEventListener('click',hideConfirm);
}
$('#cancel-run').addEventListener('click',()=>{
  if(!busy)return;runVersion++;stopWorker();setBusy(false);progressState('処理を中止しました',results.length?`${results.length}件の結果を残しました。残りは分類していません。`:'入力は残っています。分類結果はまだありません。',null);$('#run-progress').hidden=true;$('#download-notice').textContent='再実行時は分類エンジンを準備し直します。取得済みファイルはキャッシュを利用する場合があります。';window.dispatchEvent(new Event('nagiport:cancel'));
});
$('#classify-input').addEventListener('click',()=>{$('#run-progress').hidden=false;});
$('#export-csv').addEventListener('click',()=>{
  if(busy||!results.length)return;
  const blob=new Blob([resultsCsv(results)],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),link=el('a','');link.href=url;link.download='review-classification-results.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
});
window.addEventListener('pagehide',()=>{fileVersion++;runVersion++;stopWorker();clearInterval(slowTimer);});
window.addEventListener('pageshow',event=>{if(event.persisted){$('#download-notice').textContent='画面を移動したため、次回は分類エンジンを準備し直します。取得済みファイルはキャッシュを利用する場合があります。';if(busy){setBusy(false);progressState('処理を中止しました','画面を移動したため、分類エンジンを解放しました。再実行できます。');}}});
updateCounter();
// Test seam: only when ?debug=1, so the classifier UI can be exercised without
// downloading the model. Not exposed in normal use.
if(typeof location!=='undefined'&&new URLSearchParams(location.search).has('debug'))window.__nagiport={appendResult,applyFilter,getResults:()=>results};
