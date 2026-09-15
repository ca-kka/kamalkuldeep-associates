/* KKA upload network resilience.
 *
 * The browser can report `Failed to fetch` when the completion request loses
 * its response even though the Edge Function is still running. Retrying the
 * same completion request is safe because complete-upload is idempotent by
 * uploadId and returns the existing document when it has already finalized.
 */
const nativeFetch=window.fetch.bind(window);
const COMPLETE_PATH="/functions/v1/complete-upload";
const PREPARE_PATH="/functions/v1/prepare-upload";
const transient=(error)=>error instanceof TypeError||/failed to fetch|networkerror|load failed/i.test(String(error?.message||error));
async function retryFetch(input,init,retries=2){
  let last;
  for(let attempt=0;attempt<=retries;attempt++){
    try{return await nativeFetch(input,init)}catch(error){
      last=error;
      if(!transient(error)||attempt===retries)throw error;
      await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
    }
  }
  throw last;
}
window.fetch=async function(input,init){
  const url=typeof input==="string"?input:(input?.url||"");
  if(!url.includes(COMPLETE_PATH)&&!url.includes(PREPARE_PATH))return nativeFetch(input,init);
  const method=(init?.method||input?.method||"GET").toUpperCase();
  if(method!=="POST")return nativeFetch(input,init);
  return retryFetch(input,init,2);
};
