export async function request(url:string,init:RequestInit={}):Promise<Response>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{const response=await fetch(url,{...init,redirect:'manual',cache:'no-store',credentials:'same-origin',signal:controller.signal});
 if(response.status===401)window.dispatchEvent(new Event('itf-auth-expired'));
 if(response.type==='opaqueredirect'||response.status>=300&&response.status<400||response.redirected||response.status===401||response.status===403||!response.headers.get('content-type')?.includes('application/json'))throw Error('Your session expired or access is unavailable. Use Sign in again to reconnect.');
 const bytes=await response.arrayBuffer();return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
 }catch(e){if((e as Error).name==='AbortError')throw Error(init.method==='POST'?'The save timed out. Check ITFlow before retrying; it may have completed.':'The request timed out. Check your connection and try again.');if(e instanceof TypeError)throw Error(init.method==='POST'?'The request could not be completed. Check ITFlow before retrying; the save may have reached the server.':'The connection or sign-in session was interrupted. Try again; if it continues, use Sign in again.');throw e;}finally{clearTimeout(timer)}
}
export async function freshCsrf(){const r=await request('/api/session');if(!r.ok)throw Error('Could not refresh your session. Sign in again.');return (await r.json()).csrfToken as string;}
