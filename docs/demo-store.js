'use strict';
// Static hosting serves the UI. IndexedDB holds each visitor's own demo copy.
const TumbleweedDemo=(()=>{
 const database='tumbleweed-demo-v1:'+location.pathname.replace(/index\.html$/,'');
 let dbPromise,memory=null,sessionOnly=false;
 function open(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
   if(!window.indexedDB){reject(new Error('Browser storage is unavailable.'));return;}
   const request=indexedDB.open(database,1);
   request.onupgradeneeded=()=>request.result.createObjectStore('workspaces');
   request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(new Error('Close another open demo tab and reload.'));
  }).catch(()=>{sessionOnly=true;memory=structuredClone(TumbleweedDemoSeed);return null;});
  return dbPromise;
 }
 async function transaction(write,request){
  const db=await open();
  if(!db){if(write){memory=TumbleweedDemoModel.mutate(memory,request,TumbleweedDemoSeed);}return structuredClone(memory);}
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('workspaces',write?'readwrite':'readonly');const table=tx.objectStore('workspaces');let result,failure;
   const query=table.get('current');
   query.onsuccess=()=>{
    try{
     const current=query.result||structuredClone(TumbleweedDemoSeed);
     result=write?TumbleweedDemoModel.mutate(current,request,TumbleweedDemoSeed):current;
     if(write&&result.revision!==current.revision){table.put(current,'previous');table.put(result,'current');}
    }catch(error){failure=error;tx.abort();}
   };
   tx.oncomplete=()=>resolve(structuredClone(result));
   tx.onerror=()=>reject(failure||tx.error||new Error('Could not save to this browser. Export your backup and try again.'));
   tx.onabort=()=>reject(failure||tx.error||new Error('The save was cancelled. Your previous data is retained.'));
  });
 }
 async function request(path,body){
  if(path==='/api/state'){const state=await transaction(false);return {state,token:'browser-demo',data_path:sessionOnly?'This tab only — browser storage is unavailable':'This browser — IndexedDB (no shared server database)'};}
  if(path==='/api/backup')return transaction(false);
  if(path==='/api/mutate'||path==='/api/restore')return {state:await transaction(true,body)};
  throw new Error('Use the local application to import your own collection.');
 }
 function savedLabel(revision){return (sessionOnly?'Session only · export to keep changes':'Saved in this browser')+' · revision '+revision;}
 return {request,savedLabel,get sessionOnly(){return sessionOnly;}};
})();
